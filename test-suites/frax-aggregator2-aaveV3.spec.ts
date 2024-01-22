import { SignerWithAddress, TestEnv, makeSuite } from './helpers/make-suite';
import {
  cloneAaveV3Lender,
  cloneFraxLender,
  deployAaveV3Lender,
  deployAggregator,
  deployFraxLender,
  deployLenderDebtManager,
} from '../helpers/contracts-deployments';
import { AaveV3Lender, AaveV3Lender__factory, AggregatorV2, AggregatorV2DataProvider, FraxLender, FraxLender__factory, LenderDebtManager } from '../types';
import { ONE_ADDRESS, ZERO_ADDRESS } from '../helpers/constants';
import { convertToCurrencyDecimals, getEthersSigners } from '../helpers/contracts-helpers';
import { mint } from './helpers/mint';
import { advanceBlock, timeLatest } from '../helpers/misc-utils';
import { parseEther } from 'ethers/lib/utils';
import { getAggregatorV2DataProvider } from '../helpers/contracts-getters';

const { expect } = require('chai');
const AAVE_V3_FRAX_ATOKEN = '0xd4e245848d6E1220DBE62e155d89fa327E43CB06';
const FRAX_CVX_PAIR_ADDRESS = '0xa1D100a5bf6BFd2736837c97248853D989a9ED84';
const FRAX_FXS_PAIR_ADDRESS = '0xDbe88DBAc39263c47629ebbA02b3eF4cf0752A72';
const FRAX_FPI_PAIR_ADDRESS = '0x74F82Bd9D0390A4180DaaEc92D64cf0708751759';
const FRAX_APE_PAIR_ADDRESS = '0x3a25B9aB8c07FfEFEe614531C75905E810d8A239';
const FRAX_MKR_PAIR_ADDRESS = '0x82Ec28636B77661a95f021090F6bE0C8d379DD5D';
const FRAX_UNI_PAIR_ADDRESS = '0xc6CadA314389430d396C7b0C70c6281e99ca7fe8';
const FRAX_AAVE_PAIR_ADDRESS = '0xc779fEE076EB04b9F8EA424ec19DE27Efd17A68d';
const YIELD_PERIOD = 100000;
const ADMIN_FEE = '1000';
const PROTOCOL_FEE = '1000';

enum LenderType {
  FraxLend = 1,
  AaveV3 = 2,
  CompoundV3 = 3,
}

const setupAggregator = async (asset: string, admin: SignerWithAddress, proxyAdmin: SignerWithAddress) => {
  const signers = await getEthersSigners();
  // deploy Aave V3 Lender
  let aaveLender = await deployAaveV3Lender([
    ZERO_ADDRESS,
    'FRAX',
    AAVE_V3_FRAX_ATOKEN,
  ]);
  // deploy CVX FraxLender
  let cvxLender = await deployFraxLender([
    ZERO_ADDRESS,
    'CVX',
    FRAX_CVX_PAIR_ADDRESS,
    '1'
  ]);

  // deploy FRAX aggregator contract
  const aggregator = await deployAggregator(
    'FRAX',
    ADMIN_FEE,
    PROTOCOL_FEE,
    parseEther('1000').toString(),
    proxyAdmin.address,
    admin.address,
    asset,
    'Frax Aggregator',
    'frax-ag-lp',
    '18',
    [
      {
        lenderType: LenderType.FraxLend,
        lender: cvxLender.address,
        version: 1
      },
      {
        lenderType: LenderType.AaveV3,
        lender: aaveLender.address,
        version: 0
      }
    ]
  );
  await aggregator.setAdmin(admin.address, ADMIN_FEE);

  // deploy FRAX LenderDebtManager contract
  const manager = await deployLenderDebtManager(['FRAX', aggregator.address]);
  await aggregator.connect(admin.signer).setManager(manager.address);

  // get CVX FraxLender, AaveV3Lender
  const lenders = await aggregator.getLenders();
  cvxLender = FraxLender__factory.connect(lenders[0], signers[0]);
  aaveLender = AaveV3Lender__factory.connect(lenders[1], signers[0]);

  await aggregator.connect(admin.signer).updateMaxDebtForLender(cvxLender.address, parseEther('8000'));

  // add AaveV3Lender, CVX FraxLender to manager
  await manager.connect(admin.signer).addLender(cvxLender.address);
  await manager.connect(admin.signer).addLender(aaveLender.address);

  return { aggregator, aaveLender, cvxLender, manager };
};

makeSuite('FraxAggregator - Clone lender', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let aaveLender: AaveV3Lender;
  let admin: SignerWithAddress;
  let dataProvider: AggregatorV2DataProvider;

  before(async () => {
    const { users, FRAX } = testEnv;
    admin = users[0];

    // deploy FRAX aggregator contract
    aggregator = await deployAggregator(
      'FRAX',
      '0',
      '0',
      '0',
      ZERO_ADDRESS,
      ONE_ADDRESS,
      FRAX.address,
      '',
      '',
      '0',
      []
    );

    // deploy FRAX debt manager contract
    manager = await deployLenderDebtManager(['FRAX', aggregator.address]);
    dataProvider = await getAggregatorV2DataProvider();
  });

  it('Check Aggregator configuration', async () => {
    const { FRAX, deployer } = testEnv;

    expect(await aggregator.name()).to.be.eq('');
    expect(await aggregator.symbol()).to.be.eq('');
    expect(await aggregator.decimals()).to.be.eq(0);
    expect(await aggregator.ADMIN()).to.be.eq(deployer.address);
    expect(await aggregator.TREASURY()).to.be.eq(ONE_ADDRESS);
    expect(await aggregator.ADMIN_FEE()).to.be.eq(0);
    expect(await aggregator.PROTOCOL_FEE()).to.be.eq(0);
    expect(await aggregator.TOTAL_DEBT()).to.be.eq(0);
    expect(await aggregator.MINIMUM_TOTAL_IDLE()).to.be.eq(0);
    expect(await aggregator.asset()).to.be.eq(FRAX.address);
    expect((await aggregator.getLenders()).length).to.be.eq(0);
    expect(await aggregator.isShutdown()).to.be.eq(false);
    expect((await dataProvider.getAggregators()).length).to.be.eq(1);
  });

  it('Init Aggregator', async () => {
    const { FRAX } = testEnv;

    await aggregator.setAdmin(admin.address, ADMIN_FEE);
    await aggregator.connect(admin.signer).setShutdown(true);
    await aggregator.connect(admin.signer).init(FRAX.address, 'Frax Aggregator', 'frax-ag-lp', 18);
    await aggregator.connect(admin.signer).setTreasury(ONE_ADDRESS, PROTOCOL_FEE);
    await aggregator.connect(admin.signer).setMinimumTotalIdle(parseEther('1000'));

    expect(await aggregator.name()).to.be.eq('Frax Aggregator');
    expect(await aggregator.symbol()).to.be.eq('frax-ag-lp');
    expect(await aggregator.decimals()).to.be.eq(18);
    expect(await aggregator.ADMIN()).to.be.eq(admin.address);
    expect(await aggregator.TREASURY()).to.be.eq(ONE_ADDRESS);
    expect(await aggregator.ADMIN_FEE()).to.be.eq(ADMIN_FEE);
    expect(await aggregator.PROTOCOL_FEE()).to.be.eq(PROTOCOL_FEE);
    expect(await aggregator.TOTAL_DEBT()).to.be.eq(0);
    expect(await aggregator.MINIMUM_TOTAL_IDLE()).to.be.eq(parseEther('1000'));
    expect(await aggregator.asset()).to.be.eq(FRAX.address);
    expect((await aggregator.getLenders()).length).to.be.eq(0);
    expect(await aggregator.isShutdown()).to.be.eq(true);
  });

  it('Deploy AaveV3Lender', async () => {
    const { users, FRAX } = testEnv;
    const user = users[1];

    aaveLender = await deployAaveV3Lender([
      aggregator.address,
      'FRAX',
      AAVE_V3_FRAX_ATOKEN
    ]);

    expect(await aaveLender.ASSET()).to.be.eq(FRAX.address);
    expect(await aaveLender.POOL()).to.be.eq(AAVE_V3_FRAX_ATOKEN);
    expect(await aaveLender.AGGREGATOR()).to.be.eq(aggregator.address);
    expect(await aaveLender.name()).to.be.eq('FRAX');
    expect(await aaveLender.totalAssets()).to.be.eq(0);
    expect(await aaveLender.apr()).to.not.be.eq(0);
    expect(await aaveLender.maxDeposit(aggregator.address)).to.be.eq(await convertToCurrencyDecimals(FRAX.address, '15000000'))

    // Manager add lender check
    await expect(manager.addLender(aaveLender.address)).to.be.reverted;
    await aggregator.connect(admin.signer).addLender(aaveLender.address, 0);
    await expect(manager.connect(admin.signer).addLender(aaveLender.address)).to.not.be.reverted;

    // Manager remove lender check
    await expect(manager.connect(user.signer).removeLender(aaveLender.address)).to.be.reverted;
    await expect(manager.connect(admin.signer).removeLender(aaveLender.address)).to.not.be.reverted;
    await manager.connect(admin.signer).addLender(aaveLender.address);
    await aggregator.connect(admin.signer).removeLender(aaveLender.address, false);
    await expect(manager.connect(user.signer).removeLender(aaveLender.address)).to.not.be.reverted;

  });

  it('Clone AaveV3Lender', async () => {
    const { FRAX } = testEnv;

    const otherAaveLender = await cloneAaveV3Lender(
      [aggregator.address, 'FRAX_CLONED', AAVE_V3_FRAX_ATOKEN],
      aaveLender
    );

    expect(await otherAaveLender.ASSET()).to.be.eq(FRAX.address);
    expect(await otherAaveLender.POOL()).to.be.eq(AAVE_V3_FRAX_ATOKEN);
    expect(await otherAaveLender.AGGREGATOR()).to.be.eq(aggregator.address);
    expect(await otherAaveLender.name()).to.be.eq('FRAX_CLONED');
    expect(await otherAaveLender.totalAssets()).to.be.eq(0);
    expect(await otherAaveLender.apr()).to.not.be.eq(0);
  });
});

makeSuite('FraxAggregator - deposit/withdraw', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let aaveLender: AaveV3Lender;
  let cvxLender: FraxLender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, FRAX } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(FRAX.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    cvxLender = ret.cvxLender;
  });

  it('Check Aggregator added lenders', async () => {
    expect((await aggregator.getLenders()).length).to.be.eq(2);
    expect((await aggregator.getLenders())[0]).to.be.eq(cvxLender.address);
    expect((await aggregator.getLenders())[1]).to.be.eq(aaveLender.address);
    expect((await aggregator.getLenderData(aaveLender.address)).maxDebt).to.be.eq(0);
    expect((await aggregator.getLenderData(cvxLender.address)).maxDebt).to.be.eq(parseEther('8000'));
  });

  it('User1 Deposit 5000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '5000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user1);

    //Approve aggregator
    await FRAX.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '10000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user2);

    //Approve aggregator
    await FRAX.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await FRAX.balanceOf(user2.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('User1 Withdraw 3000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const withdrawAmount = await convertToCurrencyDecimals(FRAX.address, '3000');

    //Withdraw
    await aggregator.connect(user1.signer).withdraw(withdrawAmount, user1.address, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(withdrawAmount);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(withdrawAmount.mul(4));
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(withdrawAmount.div(3).mul(2));
  });

  it('User2 Withdraw 10000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const withdrawAmount = await convertToCurrencyDecimals(FRAX.address, '10000');

    //Withdraw
    await aggregator.connect(user2.signer).withdraw(withdrawAmount, user2.address, user2.address);

    expect(await FRAX.balanceOf(user2.address)).to.be.eq(withdrawAmount);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(withdrawAmount.div(5));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(0);
  });

  it('User1 Withdraw 2000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const withdrawAmount = await convertToCurrencyDecimals(FRAX.address, '2000');

    //Withdraw
    await aggregator.connect(user1.signer).withdraw(withdrawAmount, user1.address, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(withdrawAmount.mul(5).div(2));
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(0);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(0);
  });
});

makeSuite('FraxAggregator - deposit/Allocation', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let aaveLender: AaveV3Lender;
  let cvxLender: FraxLender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, FRAX } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(FRAX.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    cvxLender = ret.cvxLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '5000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user1);

    //Approve aggregator
    await FRAX.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '10000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user2);

    //Approve aggregator
    await FRAX.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await FRAX.balanceOf(user2.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Admin run Allocation', async () => {
    const { FRAX } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(FRAX.address, '15000');
    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const cvxLenderAPR = await cvxLender.apr();
    expect(aaveLenderAPR).to.be.gt(cvxLenderAPR);

    // APRAfterDeposit check
    expect(await aaveLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(aaveLenderAPR);

    //Allocation
    const positions = [
      {
        lender: cvxLender.address,
        debt: lendAmount.div(15).mul(8)
      },
      {
        lender: aaveLender.address,
        debt: 0
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterFRAXAmountOfHighPair.sub(beforeFRAXAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterFRAXAmountOfLowPair.sub(beforeFRAXAmountOfLowPair)).to.be.eq(0);
  });

  it('After for a while, User4 deposit 2000 FRAX and Admin run Allocation, then user1,user2 amount would be increased', async () => {
    const { users, FRAX } = testEnv;
    const user4 = users[4];
    const user1Amount = await convertToCurrencyDecimals(FRAX.address, '5000');
    const user2Amount = await convertToCurrencyDecimals(FRAX.address, '10000');
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '2000');

    await advanceBlock((await timeLatest()).plus(YIELD_PERIOD).toNumber());

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user4);

    //Approve aggregator
    await FRAX.connect(user4.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user4.signer).deposit(depositAmount, user4.address);

    expect(await FRAX.balanceOf(user4.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.div(2).mul(9));
    expect(await aggregator.balanceOf(user4.address)).to.be.eq(depositAmount);

    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    //Allocation to process remained asset
    const positions = [
      {
        lender: cvxLender.address,
        debt: depositAmount.div(2).mul(8)
      },
      {
        lender: aaveLender.address,
        debt: depositAmount.div(2).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.div(2));
    expect(afterFRAXAmountOfHighPair.sub(beforeFRAXAmountOfHighPair)).to.be.eq(1);
    expect(afterFRAXAmountOfLowPair.sub(beforeFRAXAmountOfLowPair)).to.be.eq(
      depositAmount.div(2).mul(8).sub(1)
    );

    // there is no yield yet
    expect(await aggregator.totalAssets()).to.be.lte(
      user1Amount.add(user2Amount).add(depositAmount)
    );

    // there would be yield
    await aggregator.connect(admin.signer).processReport(aaveLender.address);
    expect(await aggregator.totalAssets()).to.be.gt(
      user1Amount.add(user2Amount).add(depositAmount)
    );
    expect(await aggregator.balanceOf(admin.address)).to.be.gte((await aggregator.convertToShares((await aggregator.totalAssets()).sub(user1Amount).sub(user2Amount).sub(depositAmount).div(10).mul(2))));

    expect(await aggregator.convertToAssets(user1Amount)).to.be.gt(user1Amount);
    expect(await aggregator.convertToAssets(user2Amount)).to.be.gt(user2Amount);
    expect(await aggregator.convertToAssets(depositAmount)).to.be.gt(depositAmount);
  });
});

makeSuite('FraxAggregator - deposit/Allocation/removeLender', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let aaveLender: AaveV3Lender;
  let cvxLender: FraxLender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, FRAX } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(FRAX.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    cvxLender = ret.cvxLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '5000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user1);

    //Approve aggregator
    await FRAX.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '10000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user2);

    //Approve aggregator
    await FRAX.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await FRAX.balanceOf(user2.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Admin run Allocation', async () => {
    const { FRAX } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(FRAX.address, '15000');
    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const cvxLenderAPR = await cvxLender.apr();
    expect(aaveLenderAPR).to.be.gt(cvxLenderAPR);

    // APRAfterDeposit check
    expect(await aaveLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(aaveLenderAPR);

    //Allocation
    const positions = [
      {
        lender: cvxLender.address,
        debt: lendAmount.div(15).mul(8)
      },
      {
        lender: aaveLender.address,
        debt: 0
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterFRAXAmountOfHighPair.sub(beforeFRAXAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterFRAXAmountOfLowPair.sub(beforeFRAXAmountOfLowPair)).to.be.eq(0);
  });

  it('update debt as 0 for AaveV3Lender and remove AaveV3Lender', async () => {
    const { FRAX } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(FRAX.address, '15000');
    const beforeFRAXAmountOfPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    // there may be yield
    await aggregator.connect(admin.signer).processReport(cvxLender.address);

    // update debt as 0
    await aggregator.connect(admin.signer).updateDebt(cvxLender.address, 0);

    // remove AaveV3Lender
    await aggregator.connect(admin.signer).removeLender(cvxLender.address, false);

    const afterFRAXAmountOfPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect((await aggregator.getLenders()).length).to.be.eq(1);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.gt(lendAmount.div(15).mul(9));
    expect(await aggregator.totalAssets()).to.be.gt(lendAmount);

    expect(await aggregator.convertToAssets(lendAmount)).to.be.gt(lendAmount);
    expect(afterFRAXAmountOfPair.sub(beforeFRAXAmountOfPair)).to.be.eq(0);
  });
});

makeSuite('FraxAggregator - deposit/Allocation/withdraw', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let aaveLender: AaveV3Lender;
  let cvxLender: FraxLender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, FRAX } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(FRAX.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    cvxLender = ret.cvxLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '5000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user1);

    //Approve aggregator
    await FRAX.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '10000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user2);

    //Approve aggregator
    await FRAX.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await FRAX.balanceOf(user2.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Admin run Allocation', async () => {
    const { FRAX } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(FRAX.address, '15000');
    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const cvxLenderAPR = await cvxLender.apr();
    expect(aaveLenderAPR).to.be.gt(cvxLenderAPR);

    // APRAfterDeposit check
    expect(await aaveLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(aaveLenderAPR);

    //Allocation
    const positions = [
      {
        lender: cvxLender.address,
        debt: lendAmount.div(15).mul(8)
      },
      {
        lender: aaveLender.address,
        debt: 0
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterFRAXAmountOfHighPair.sub(beforeFRAXAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterFRAXAmountOfLowPair.sub(beforeFRAXAmountOfLowPair)).to.be.eq(0);
  });

  it('Admin run Allocation again to process remained asset', async () => {
    const { FRAX } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(FRAX.address, '15000');
    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    //Allocation
    const positions = [
      {
        lender: cvxLender.address,
        debt: lendAmount.div(15).mul(8)
      },
      {
        lender: aaveLender.address,
        debt: lendAmount.div(15).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount.sub(1));
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount.sub(1));
    expect(afterFRAXAmountOfHighPair.sub(beforeFRAXAmountOfHighPair)).to.be.eq(1);
    expect(afterFRAXAmountOfLowPair.sub(beforeFRAXAmountOfLowPair)).to.be.eq(
      lendAmount.div(15).mul(6).sub(1)
    );
  });

  it('User2 withdraw 5000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const withdrawAmount = await convertToCurrencyDecimals(FRAX.address, '5000');
    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    // withdraw
    await aggregator.connect(user2.signer).withdraw(withdrawAmount, user2.address, user2.address);

    // there may be yield
    await aggregator.connect(admin.signer).processReport(aaveLender.address);
    await aggregator.connect(admin.signer).processReport(cvxLender.address);

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.lt(withdrawAmount.div(5));
    expect(await aggregator.totalAssets()).to.be.gt(withdrawAmount.mul(2));
    expect(await aggregator.convertToAssets(withdrawAmount.mul(2))).to.be.gt(withdrawAmount.mul(2));
    expect(beforeFRAXAmountOfHighPair.sub(afterFRAXAmountOfHighPair)).to.be.lte(withdrawAmount.div(5).mul(4).add(await FRAX.balanceOf(aggregator.address)));
    expect(beforeFRAXAmountOfLowPair.sub(afterFRAXAmountOfLowPair)).to.be.eq(
      0
    );
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(withdrawAmount.sub(1));
  });
});

makeSuite('FraxAggregator - deposit/Allocation/Shutdown', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let aaveLender: AaveV3Lender;
  let cvxLender: FraxLender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, FRAX } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(FRAX.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    cvxLender = ret.cvxLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '5000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user1);

    //Approve aggregator
    await FRAX.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '10000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user2);

    //Approve aggregator
    await FRAX.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await FRAX.balanceOf(user2.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('User3 run Allocation', async () => {
    const { FRAX } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(FRAX.address, '15000');
    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const cvxLenderAPR = await cvxLender.apr();
    expect(aaveLenderAPR).to.be.gt(cvxLenderAPR);

    // APRAfterDeposit check
    expect(await aaveLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(aaveLenderAPR);

    //Allocation
    const positions = [
      {
        lender: cvxLender.address,
        debt: lendAmount.div(15).mul(8)
      },
      {
        lender: aaveLender.address,
        debt: 0
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterFRAXAmountOfHighPair.sub(beforeFRAXAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterFRAXAmountOfLowPair.sub(beforeFRAXAmountOfLowPair)).to.be.eq(0);
  });

  it('Shutdown aggregator', async () => {
    const { FRAX } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(FRAX.address, '15000');
    const beforeFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const beforeFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)

    // deactive
    await aggregator.connect(admin.signer).setShutdown(true);
    expect(await aggregator.isShutdown()).to.be.eq(true);

    // there may be yield
    await aggregator.connect(admin.signer).processReport(aaveLender.address);
    await aggregator.connect(admin.signer).processReport(cvxLender.address);

    //Allocation but since shutdown, it would be only pull out.
    await aggregator.connect(admin.signer).updateDebt(cvxLender.address, lendAmount.div(15).mul(8));

    const afterFRAXAmountOfHighPair = await FRAX.balanceOf(FRAX_CVX_PAIR_ADDRESS);
    const afterFRAXAmountOfLowPair = await FRAX.balanceOf(AAVE_V3_FRAX_ATOKEN)
    expect(await FRAX.balanceOf(aggregator.address)).to.be.gt(lendAmount);
    expect(await aggregator.totalAssets()).to.be.gt(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.gt(lendAmount);
    expect(beforeFRAXAmountOfHighPair.sub(afterFRAXAmountOfHighPair)).to.be.gt(
      lendAmount.div(15).mul(8)
    );
    expect(beforeFRAXAmountOfLowPair.sub(afterFRAXAmountOfLowPair)).to.be.eq(
      0
    );
  });
});

makeSuite('FraxAggregator - deposit/addLender 6 times/manualAllocation/manualAllocation ', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let aaveLender: AaveV3Lender;
  let cvxLender: FraxLender;
  let fxsLender: FraxLender;
  let fpiLender: FraxLender;
  let apeLender: FraxLender;
  let mkrLender: FraxLender;
  let uniLender: FraxLender;
  let aaveFLender: FraxLender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, FRAX } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(FRAX.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    cvxLender = ret.cvxLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '5000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user1);

    //Approve aggregator
    await FRAX.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await FRAX.balanceOf(user1.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 FRAX', async () => {
    const { users, FRAX } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '10000');

    //Prepare FRAX
    await mint('FRAX', depositAmount.toString(), user2);

    //Approve aggregator
    await FRAX.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await FRAX.balanceOf(user2.address)).to.be.eq(0);
    expect(await FRAX.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Add Lender 6 times', async () => {
    // deploy CVX FraxLender
    fxsLender = await cloneFraxLender(
      [aggregator.address, 'FXS', FRAX_FXS_PAIR_ADDRESS, '1'],
      cvxLender,
    );
    fpiLender = await cloneFraxLender(
      [aggregator.address, 'FPI', FRAX_FPI_PAIR_ADDRESS, '2'],
      cvxLender
    );
    apeLender = await cloneFraxLender(
      [aggregator.address, 'APE', FRAX_APE_PAIR_ADDRESS, '3'],
      cvxLender
    );
    mkrLender = await cloneFraxLender(
      [aggregator.address, 'MKR', FRAX_MKR_PAIR_ADDRESS, '3'],
      cvxLender
    );
    uniLender = await cloneFraxLender(
      [aggregator.address, 'UNI', FRAX_UNI_PAIR_ADDRESS, '3'],
      cvxLender
    );
    aaveFLender = await cloneFraxLender(
      [aggregator.address, 'AAVE', FRAX_AAVE_PAIR_ADDRESS, '3'],
      cvxLender
    );

    // add 6 FraxLenders to aggregator
    await aggregator.connect(admin.signer).addLender(fxsLender.address, parseEther('2000'));
    await aggregator.connect(admin.signer).addLender(fpiLender.address, 0);
    await aggregator.connect(admin.signer).addLender(apeLender.address, 0);
    await aggregator.connect(admin.signer).addLender(mkrLender.address, 0);
    await aggregator.connect(admin.signer).addLender(uniLender.address, 0);
    await aggregator.connect(admin.signer).addLender(aaveFLender.address, 0);

    // add 6 FraxLenders to manager
    await manager.connect(admin.signer).addLender(fxsLender.address);
    await manager.connect(admin.signer).addLender(fpiLender.address);
    await manager.connect(admin.signer).addLender(apeLender.address);
    await manager.connect(admin.signer).addLender(mkrLender.address);
    await manager.connect(admin.signer).addLender(uniLender.address);
    await manager.connect(admin.signer).addLender(aaveFLender.address);

    expect((await aggregator.getLenders()).length).to.be.eq(8);
  });

  it('first manualAllocation: 1,6,2,1,1,1,1,1 K', async () => {
    const { FRAX, users } = testEnv;
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '1000');
    const positions = [
      {
        lender: cvxLender.address,
        debt: depositAmount
      },
      {
        lender: aaveLender.address,
        debt: depositAmount.mul(6)
      },
      {
        lender: fxsLender.address,
        debt: depositAmount.mul(3)
      },
      {
        lender: fpiLender.address,
        debt: depositAmount
      },
      {
        lender: apeLender.address,
        debt: depositAmount
      },
      {
        lender: mkrLender.address,
        debt: depositAmount
      },
      {
        lender: uniLender.address,
        debt: depositAmount
      },
      {
        lender: aaveFLender.address,
        debt: depositAmount
      },
    ]
    
    // reverted because of supplyCap
    await expect(manager.connect(admin.signer).manualAllocation(positions)).to.be.reverted;

    // success
    positions[2].debt = depositAmount.mul(2);
    await expect(manager.connect(admin.signer).manualAllocation(positions)).to.not.be.reverted;
  });

  it('second withdraw all and manualAllocation: 8,7,0,0,0,0,0,0 K', async () => {
    const { FRAX, users } = testEnv;
    const user4 = users[4];
    const depositAmount = await convertToCurrencyDecimals(FRAX.address, '1000');

    // Withdraw all
    await aggregator.connect(admin.signer).processReport(aaveLender.address);
    await aggregator.connect(admin.signer).updateDebt(aaveLender.address, 0);

    await aggregator.connect(admin.signer).processReport(cvxLender.address);
    await aggregator.connect(admin.signer).updateDebt(cvxLender.address, 0);

    await aggregator.connect(admin.signer).processReport(fxsLender.address);
    await aggregator.connect(admin.signer).updateDebt(fxsLender.address, 0);

    await aggregator.connect(admin.signer).processReport(fpiLender.address);
    await aggregator.connect(admin.signer).updateDebt(fpiLender.address, 0);

    await aggregator.connect(admin.signer).processReport(apeLender.address);
    await aggregator.connect(admin.signer).updateDebt(apeLender.address, 0);

    await aggregator.connect(admin.signer).processReport(mkrLender.address);
    await aggregator.connect(admin.signer).updateDebt(mkrLender.address, 0);

    await aggregator.connect(admin.signer).processReport(uniLender.address);
    await aggregator.connect(admin.signer).updateDebt(uniLender.address, 0);

    await aggregator.connect(admin.signer).processReport(aaveFLender.address);
    await aggregator.connect(admin.signer).updateDebt(aaveFLender.address, 0);

    const positions = [
      {
        lender: cvxLender.address,
        debt: depositAmount.mul(8)
      },
      {
        lender: aaveLender.address,
        debt: depositAmount.mul(7)
      },
      {
        lender: fxsLender.address,
        debt: 0
      },
      {
        lender: fpiLender.address,
        debt: 0
      },
      {
        lender: apeLender.address,
        debt: 0
      },
      {
        lender: mkrLender.address,
        debt: 0
      },
      {
        lender: uniLender.address,
        debt: 0
      },
      {
        lender: aaveFLender.address,
        debt: 0
      },
    ]

    // success
    await expect(manager.connect(admin.signer).manualAllocation(positions)).to.not.be.reverted;
    expect(await FRAX.balanceOf(aggregator.address)).to.be.gt(depositAmount);
  });
});