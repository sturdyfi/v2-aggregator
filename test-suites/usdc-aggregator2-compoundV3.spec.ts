import { SignerWithAddress, TestEnv, makeSuite } from './helpers/make-suite';
import {
  cloneCompoundV3Lender,
  deployCompoundV3Lender,
  deployAggregator,
  deployLenderDebtManager,
  deployAaveV3Lender,
} from '../helpers/contracts-deployments';
import { CompoundV3Lender, AggregatorV2, AaveV3Lender, LenderDebtManager, CompoundV3Lender__factory, AaveV3Lender__factory, AggregatorV2DataProvider } from '../types';
import { ONE_ADDRESS, ZERO_ADDRESS } from '../helpers/constants';
import { convertToCurrencyDecimals, getEthersSigners } from '../helpers/contracts-helpers';
import { mint } from './helpers/mint';
import { advanceBlock, timeLatest } from '../helpers/misc-utils';
import { parseEther } from 'ethers/lib/utils';
import { getAggregatorV2DataProvider } from '../helpers/contracts-getters';

const { expect } = require('chai');
const COMPOUND_V3_USDC_CTOKEN = '0xc3d688B66703497DAA19211EEdff47f25384cdc3';
const AAVE_V3_USDC_ATOKEN = '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c';
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
  // deploy Compound V3 Lender
  let compoundLender = await deployCompoundV3Lender([
    ZERO_ADDRESS,
    'USDC',
    COMPOUND_V3_USDC_CTOKEN,
  ]);
  // deploy Aave V3 Lender
  let aaveLender = await deployAaveV3Lender([
    ZERO_ADDRESS,
    'USDC',
    AAVE_V3_USDC_ATOKEN,
  ]);
  
  // deploy USDC aggregator contract
  const aggregator = await deployAggregator(
    'USDC',
    ADMIN_FEE,
    PROTOCOL_FEE,
    (await convertToCurrencyDecimals(asset, '1000')).toString(),
    proxyAdmin.address,
    admin.address,
    asset,
    'Usdc Aggregator',
    'usdc-ag-lp',
    '6',
    [
      {
        lenderType: LenderType.CompoundV3,
        lender: compoundLender.address,
        version: 0
      },
      {
        lenderType: LenderType.AaveV3,
        lender: aaveLender.address,
        version: 0
      }
    ]
  );
  await aggregator.setAdmin(admin.address, ADMIN_FEE);

  // deploy USDC LenderDebtManager contract
  const manager = await deployLenderDebtManager(['USDC', aggregator.address]);
  await aggregator.connect(admin.signer).setManager(manager.address);

  // get CompoundV3Lender, AaveV3Lender
  const lenders = await aggregator.getLenders();
  compoundLender = CompoundV3Lender__factory.connect(lenders[0], signers[0]);
  aaveLender = AaveV3Lender__factory.connect(lenders[1], signers[0]);

  await aggregator.connect(admin.signer).updateMaxDebtForLender(compoundLender.address, await convertToCurrencyDecimals(asset, '8000'));

  // add AaveV3Lender, CompoundV3Lender to manager
  await manager.connect(admin.signer).addLender(compoundLender.address);
  await manager.connect(admin.signer).addLender(aaveLender.address);

  return { aggregator, compoundLender, aaveLender, manager };
};

makeSuite('UsdcAggregator - Clone lender', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let compoundLender: CompoundV3Lender;
  let admin: SignerWithAddress;
  let dataProvider: AggregatorV2DataProvider;

  before(async () => {
    const { users, USDC } = testEnv;
    admin = users[0];

    // deploy USDC aggregator contract
    aggregator = await deployAggregator(
      'USDC',
      '0',
      '0',
      '0',
      ZERO_ADDRESS,
      ONE_ADDRESS,
      USDC.address,
      '',
      '',
      '0',
      []
    );

    // deploy USDC debt manager contract
    manager = await deployLenderDebtManager(['USDC', aggregator.address]);
    dataProvider = await getAggregatorV2DataProvider();
  });

  it('Check Aggregator configuration', async () => {
    const { USDC, deployer } = testEnv;

    expect(await aggregator.name()).to.be.eq('');
    expect(await aggregator.symbol()).to.be.eq('');
    expect(await aggregator.decimals()).to.be.eq(0);
    expect(await aggregator.ADMIN()).to.be.eq(deployer.address);
    expect(await aggregator.TREASURY()).to.be.eq(ONE_ADDRESS);
    expect(await aggregator.ADMIN_FEE()).to.be.eq(0);
    expect(await aggregator.PROTOCOL_FEE()).to.be.eq(0);
    expect(await aggregator.TOTAL_DEBT()).to.be.eq(0);
    expect(await aggregator.MINIMUM_TOTAL_IDLE()).to.be.eq(0);
    expect(await aggregator.asset()).to.be.eq(USDC.address);
    expect((await aggregator.getLenders()).length).to.be.eq(0);
    expect(await aggregator.isShutdown()).to.be.eq(false);
    expect((await dataProvider.getAggregators()).length).to.be.eq(1);
  });

  it('Init Aggregator', async () => {
    const { USDC } = testEnv;
    const minTotalIdle = await convertToCurrencyDecimals(USDC.address, '1000');

    await aggregator.setAdmin(admin.address, ADMIN_FEE);
    await aggregator.connect(admin.signer).setShutdown(true);
    await aggregator.connect(admin.signer).init(USDC.address, 'Usdc Aggregator', 'usdc-ag-lp', 6);
    await aggregator.connect(admin.signer).setTreasury(ONE_ADDRESS, PROTOCOL_FEE);
    await aggregator.connect(admin.signer).setMinimumTotalIdle(minTotalIdle);

    expect(await aggregator.name()).to.be.eq('Usdc Aggregator');
    expect(await aggregator.symbol()).to.be.eq('usdc-ag-lp');
    expect(await aggregator.decimals()).to.be.eq(6);
    expect(await aggregator.ADMIN()).to.be.eq(admin.address);
    expect(await aggregator.TREASURY()).to.be.eq(ONE_ADDRESS);
    expect(await aggregator.ADMIN_FEE()).to.be.eq(ADMIN_FEE);
    expect(await aggregator.PROTOCOL_FEE()).to.be.eq(PROTOCOL_FEE);
    expect(await aggregator.TOTAL_DEBT()).to.be.eq(0);
    expect(await aggregator.MINIMUM_TOTAL_IDLE()).to.be.eq(minTotalIdle);
    expect(await aggregator.asset()).to.be.eq(USDC.address);
    expect((await aggregator.getLenders()).length).to.be.eq(0);
    expect(await aggregator.isShutdown()).to.be.eq(true);
  });

  it('Deploy CompoundV3Lender', async () => {
    const { users, USDC } = testEnv;
    const user = users[1];

    compoundLender = await deployCompoundV3Lender([
      aggregator.address,
      'USDC',
      COMPOUND_V3_USDC_CTOKEN
    ]);

    expect(await compoundLender.ASSET()).to.be.eq(USDC.address);
    expect(await compoundLender.POOL()).to.be.eq(COMPOUND_V3_USDC_CTOKEN);
    expect(await compoundLender.AGGREGATOR()).to.be.eq(aggregator.address);
    expect(await compoundLender.name()).to.be.eq('USDC');
    expect(await compoundLender.totalAssets()).to.be.eq(0);
    expect(await compoundLender.apr()).to.not.be.eq(0);

    // Manager add lender check
    await expect(manager.addLender(compoundLender.address)).to.be.reverted;
    await aggregator.connect(admin.signer).addLender(compoundLender.address, 0);
    await expect(manager.connect(admin.signer).addLender(compoundLender.address)).to.not.be.reverted;

    // Manager remove lender check
    await expect(manager.connect(user.signer).removeLender(compoundLender.address)).to.be.reverted;
    await expect(manager.connect(admin.signer).removeLender(compoundLender.address)).to.not.be.reverted;
    await manager.connect(admin.signer).addLender(compoundLender.address);
    await aggregator.connect(admin.signer).removeLender(compoundLender.address, false);
    await expect(manager.connect(user.signer).removeLender(compoundLender.address)).to.not.be.reverted;

  });

  it('Clone CompoundV3Lender', async () => {
    const { USDC } = testEnv;

    const otherCompoundLender = await cloneCompoundV3Lender(
      [aggregator.address, 'USDC_CLONED', COMPOUND_V3_USDC_CTOKEN],
      compoundLender
    );

    expect(await otherCompoundLender.ASSET()).to.be.eq(USDC.address);
    expect(await otherCompoundLender.POOL()).to.be.eq(COMPOUND_V3_USDC_CTOKEN);
    expect(await otherCompoundLender.AGGREGATOR()).to.be.eq(aggregator.address);
    expect(await otherCompoundLender.name()).to.be.eq('USDC_CLONED');
    expect(await otherCompoundLender.totalAssets()).to.be.eq(0);
    expect(await otherCompoundLender.apr()).to.not.be.eq(0);
  });
});

makeSuite('UsdcAggregator - deposit/withdraw', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let compoundLender: CompoundV3Lender;
  let aaveLender: AaveV3Lender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, USDC } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(USDC.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    compoundLender = ret.compoundLender;
  });

  it('Check Aggregator added lenders', async () => {
    const { USDC } = testEnv;

    expect((await aggregator.getLenders()).length).to.be.eq(2);
    expect((await aggregator.getLenders())[0]).to.be.eq(compoundLender.address);
    expect((await aggregator.getLenders())[1]).to.be.eq(aaveLender.address);
    expect((await aggregator.getLenderData(compoundLender.address)).maxDebt).to.be.eq(await convertToCurrencyDecimals(USDC.address, '8000'));
    expect((await aggregator.getLenderData(aaveLender.address)).maxDebt).to.be.eq(0);
  });

  it('User1 Deposit 5000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '5000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user1);

    //Approve aggregator
    await USDC.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await USDC.balanceOf(user1.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '10000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user2);

    //Approve aggregator
    await USDC.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await USDC.balanceOf(user2.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('User1 Withdraw 3000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user1 = users[1];
    const withdrawAmount = await convertToCurrencyDecimals(USDC.address, '3000');

    //Withdraw
    await aggregator.connect(user1.signer).withdraw(withdrawAmount, user1.address, user1.address);

    expect(await USDC.balanceOf(user1.address)).to.be.eq(withdrawAmount);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(withdrawAmount.mul(4));
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(withdrawAmount.div(3).mul(2));
  });

  it('User2 Withdraw 10000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user2 = users[2];
    const withdrawAmount = await convertToCurrencyDecimals(USDC.address, '10000');

    //Withdraw
    await aggregator.connect(user2.signer).withdraw(withdrawAmount, user2.address, user2.address);

    expect(await USDC.balanceOf(user2.address)).to.be.eq(withdrawAmount);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(withdrawAmount.div(5));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(0);
  });

  it('User1 Withdraw 2000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user1 = users[1];
    const withdrawAmount = await convertToCurrencyDecimals(USDC.address, '2000');

    //Withdraw
    await aggregator.connect(user1.signer).withdraw(withdrawAmount, user1.address, user1.address);

    expect(await USDC.balanceOf(user1.address)).to.be.eq(withdrawAmount.mul(5).div(2));
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(0);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(0);
  });
});

makeSuite('UsdcAggregator - deposit/Allocation', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let compoundLender: CompoundV3Lender;
  let aaveLender: AaveV3Lender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, USDC } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(USDC.address, admin, users[6]);
    aggregator = ret.aggregator;
    aaveLender = ret.aaveLender;
    compoundLender = ret.compoundLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '5000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user1);

    //Approve aggregator
    await USDC.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await USDC.balanceOf(user1.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '10000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user2);

    //Approve aggregator
    await USDC.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await USDC.balanceOf(user2.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Admin run Allocation', async () => {
    const { USDC } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(USDC.address, '15000');
    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const compoundLenderAPR = await compoundLender.apr();
    expect(compoundLenderAPR).to.be.gt(aaveLenderAPR);

    // APRAfterDeposit check
    expect(await compoundLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(compoundLenderAPR);

    //Allocation
    const positions = [
      {
        lender: compoundLender.address,
        debt: lendAmount.div(15).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterUSDCAmountOfHighPair.sub(beforeUSDCAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterUSDCAmountOfLowPair.sub(beforeUSDCAmountOfLowPair)).to.be.eq(0);
  });

  it('After for a while, User4 deposit 2000 USDC and Admin run Allocation, then user1,user2 amount would be increased', async () => {
    const { users, USDC } = testEnv;
    const user4 = users[4];
    const user1Amount = await convertToCurrencyDecimals(USDC.address, '5000');
    const user2Amount = await convertToCurrencyDecimals(USDC.address, '10000');
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '2000');

    await advanceBlock((await timeLatest()).plus(YIELD_PERIOD).toNumber());

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user4);

    //Approve aggregator
    await USDC.connect(user4.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user4.signer).deposit(depositAmount, user4.address);

    expect(await USDC.balanceOf(user4.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount.div(2).mul(9));
    expect(await aggregator.balanceOf(user4.address)).to.be.eq(depositAmount);

    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    //Allocation to process remained asset
    const positions = [
      {
        lender: aaveLender.address,
        debt: depositAmount.div(2).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount.div(2));
    expect(afterUSDCAmountOfHighPair.sub(beforeUSDCAmountOfHighPair)).to.be.eq(0);
    expect(afterUSDCAmountOfLowPair.sub(beforeUSDCAmountOfLowPair)).to.be.eq(
      depositAmount.div(2).mul(8)
    );

    // there is no yield yet
    expect(await aggregator.totalAssets()).to.be.lte(
      user1Amount.add(user2Amount).add(depositAmount)
    );

    // call withdraw some to make yield
    await aggregator.connect(admin.signer).processReport(compoundLender.address);
    await aggregator.connect(admin.signer).updateDebt(compoundLender.address, depositAmount.div(2).mul(7));
    expect(await aggregator.totalAssets()).to.be.gt(
      user1Amount.add(user2Amount).add(depositAmount)
    );

    // there would be yield
    await aggregator.connect(admin.signer).processReport(compoundLender.address);
    expect(await aggregator.totalAssets()).to.be.gt(
      user1Amount.add(user2Amount).add(depositAmount)
    );
    expect(await aggregator.balanceOf(admin.address)).to.be.gte((await aggregator.convertToShares((await aggregator.totalAssets()).sub(user1Amount).sub(user2Amount).sub(depositAmount).div(10).mul(2).sub(2))));

    expect(await aggregator.convertToAssets(user1Amount)).to.be.gt(user1Amount);
    expect(await aggregator.convertToAssets(user2Amount)).to.be.gt(user2Amount);
    expect(await aggregator.convertToAssets(depositAmount)).to.be.gt(depositAmount);
  });
});

makeSuite('UsdcAggregator - deposit/Allocation/removeLender', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let compoundLender: CompoundV3Lender;
  let aaveLender: AaveV3Lender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, USDC } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(USDC.address, admin, users[6]);
    aggregator = ret.aggregator;
    compoundLender = ret.compoundLender;
    aaveLender = ret.aaveLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '5000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user1);

    //Approve aggregator
    await USDC.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await USDC.balanceOf(user1.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '10000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user2);

    //Approve aggregator
    await USDC.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await USDC.balanceOf(user2.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Admin run Allocation', async () => {
    const { USDC } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(USDC.address, '15000');
    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const compoundLenderAPR = await compoundLender.apr();
    expect(compoundLenderAPR).to.be.gt(aaveLenderAPR);

    // APRAfterDeposit check
    expect(await compoundLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(compoundLenderAPR);

    //Allocation
    const positions = [
      {
        lender: compoundLender.address,
        debt: lendAmount.div(15).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterUSDCAmountOfHighPair.sub(beforeUSDCAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterUSDCAmountOfLowPair.sub(beforeUSDCAmountOfLowPair)).to.be.eq(0);
  });

  it('update debt as 0 for CompoundV3Lender and remove CompoundV3Lender', async () => {
    const { USDC } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(USDC.address, '15000');
    const beforeUSDCAmountOfPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    // there may be yield
    await aggregator.connect(admin.signer).processReport(compoundLender.address);

    // update debt as 0
    await aggregator.connect(admin.signer).updateDebt(compoundLender.address, 0);

    // remove CompoundV3Lender
    await aggregator.connect(admin.signer).removeLender(compoundLender.address, false);

    const afterUSDCAmountOfPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect((await aggregator.getLenders()).length).to.be.eq(1);
    expect(await USDC.balanceOf(aggregator.address)).to.be.gt(lendAmount.div(15).mul(9));
    expect(await aggregator.totalAssets()).to.be.gt(lendAmount);

    expect(await aggregator.convertToAssets(lendAmount)).to.be.gt(lendAmount);
    expect(afterUSDCAmountOfPair.sub(beforeUSDCAmountOfPair)).to.be.eq(0);
  });
});

makeSuite('UsdcAggregator - deposit/Allocation/withdraw', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let compoundLender: CompoundV3Lender;
  let aaveLender: AaveV3Lender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, USDC } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(USDC.address, admin, users[6]);
    aggregator = ret.aggregator;
    compoundLender = ret.compoundLender;
    aaveLender = ret.aaveLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '5000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user1);

    //Approve aggregator
    await USDC.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await USDC.balanceOf(user1.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '10000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user2);

    //Approve aggregator
    await USDC.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await USDC.balanceOf(user2.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Admin run Allocation', async () => {
    const { USDC } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(USDC.address, '15000');
    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const compoundLenderAPR = await compoundLender.apr();
    expect(compoundLenderAPR).to.be.gt(aaveLenderAPR);

    // APRAfterDeposit check
    expect(await compoundLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(compoundLenderAPR);

    //Allocation
    const positions = [
      {
        lender: compoundLender.address,
        debt: lendAmount.div(15).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterUSDCAmountOfHighPair.sub(beforeUSDCAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterUSDCAmountOfLowPair.sub(beforeUSDCAmountOfLowPair)).to.be.eq(0);
  });

  it('Admin run Allocation again to process remained asset', async () => {
    const { USDC } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(USDC.address, '15000');
    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    //Allocation
    const positions = [
      {
        lender: aaveLender.address,
        debt: lendAmount.div(15).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterUSDCAmountOfHighPair.sub(beforeUSDCAmountOfHighPair)).to.be.eq(0);
    expect(afterUSDCAmountOfLowPair.sub(beforeUSDCAmountOfLowPair)).to.be.eq(
      lendAmount.div(15).mul(6)
    );
  });

  it('User2 withdraw 5000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user2 = users[2];
    const withdrawAmount = await convertToCurrencyDecimals(USDC.address, '5000');
    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    // withdraw
    await aggregator.connect(user2.signer).withdraw(withdrawAmount, user2.address, user2.address);

    // there may be yield
    await aggregator.connect(admin.signer).processReport(aaveLender.address);
    await aggregator.connect(admin.signer).processReport(aaveLender.address);

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.lt(withdrawAmount.div(5));
    expect(await aggregator.totalAssets()).to.be.gt(withdrawAmount.mul(2));
    expect(await aggregator.convertToAssets(withdrawAmount.mul(2))).to.be.gt(withdrawAmount.mul(2));
    expect(beforeUSDCAmountOfHighPair.sub(afterUSDCAmountOfHighPair)).to.be.lte(withdrawAmount.div(5).mul(4).add(await USDC.balanceOf(aggregator.address)));
    expect(beforeUSDCAmountOfLowPair.sub(afterUSDCAmountOfLowPair)).to.be.eq(
      0
    );
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(withdrawAmount);
  });
});

makeSuite('UsdcAggregator - deposit/Allocation/Shutdown', (testEnv: TestEnv) => {
  let aggregator: AggregatorV2;
  let manager: LenderDebtManager;
  let compoundLender: CompoundV3Lender;
  let aaveLender: AaveV3Lender;
  let admin: SignerWithAddress;

  before(async () => {
    const { users, USDC } = testEnv;
    admin = users[0];

    const ret = await setupAggregator(USDC.address, admin, users[6]);
    aggregator = ret.aggregator;
    compoundLender = ret.compoundLender;
    aaveLender = ret.aaveLender;
    manager = ret.manager;
  });

  it('User1 Deposit 5000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user1 = users[1];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '5000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user1);

    //Approve aggregator
    await USDC.connect(user1.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user1.signer).deposit(depositAmount, user1.address);

    expect(await USDC.balanceOf(user1.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount);
    expect(await aggregator.balanceOf(user1.address)).to.be.eq(depositAmount);
  });

  it('User2 Deposit 10000 USDC', async () => {
    const { users, USDC } = testEnv;
    const user2 = users[2];
    const depositAmount = await convertToCurrencyDecimals(USDC.address, '10000');

    //Prepare USDC
    await mint('USDC', depositAmount.toString(), user2);

    //Approve aggregator
    await USDC.connect(user2.signer).approve(aggregator.address, depositAmount);

    //Deposit
    await aggregator.connect(user2.signer).deposit(depositAmount, user2.address);

    expect(await USDC.balanceOf(user2.address)).to.be.eq(0);
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(depositAmount.mul(3).div(2));
    expect(await aggregator.balanceOf(user2.address)).to.be.eq(depositAmount);
  });

  it('Admin run Allocation', async () => {
    const { USDC } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(USDC.address, '15000');
    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    // APR check
    const aaveLenderAPR = await aaveLender.apr();
    const compoundLenderAPR = await compoundLender.apr();
    expect(compoundLenderAPR).to.be.gt(aaveLenderAPR);

    // APRAfterDeposit check
    expect(await compoundLender.aprAfterDebtChange(lendAmount, true)).to.be.lt(compoundLenderAPR);

    //Allocation
    const positions = [
      {
        lender: compoundLender.address,
        debt: lendAmount.div(15).mul(8)
      }
    ]
    await manager.connect(admin.signer).manualAllocation(positions);

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.eq(lendAmount.div(15).mul(7));
    expect(await aggregator.totalAssets()).to.be.eq(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.eq(lendAmount);
    expect(afterUSDCAmountOfHighPair.sub(beforeUSDCAmountOfHighPair)).to.be.eq(
      lendAmount.div(15).mul(8)
    );
    expect(afterUSDCAmountOfLowPair.sub(beforeUSDCAmountOfLowPair)).to.be.eq(0);
  });

  it('Shutdown aggregator', async () => {
    const { USDC } = testEnv;
    const lendAmount = await convertToCurrencyDecimals(USDC.address, '15000');
    const beforeUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const beforeUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)

    // deactive
    await aggregator.connect(admin.signer).setShutdown(true);
    expect(await aggregator.isShutdown()).to.be.eq(true);

    // there may be yield
    await aggregator.connect(admin.signer).processReport(compoundLender.address);
    await aggregator.connect(admin.signer).processReport(aaveLender.address);

    //Allocation but since shutdown, it would be only pull out.
    await aggregator.connect(admin.signer).updateDebt(compoundLender.address, lendAmount.div(15).mul(8));

    const afterUSDCAmountOfHighPair = await USDC.balanceOf(COMPOUND_V3_USDC_CTOKEN);
    const afterUSDCAmountOfLowPair = await USDC.balanceOf(AAVE_V3_USDC_ATOKEN)
    expect(await USDC.balanceOf(aggregator.address)).to.be.gt(lendAmount);
    expect(await aggregator.totalAssets()).to.be.gt(lendAmount);
    expect(await aggregator.convertToAssets(lendAmount)).to.be.gt(lendAmount);
    expect(beforeUSDCAmountOfHighPair.sub(afterUSDCAmountOfHighPair)).to.be.gt(
      lendAmount.div(15).mul(8)
    );
    expect(beforeUSDCAmountOfLowPair.sub(afterUSDCAmountOfLowPair)).to.be.eq(
      0
    );
  });
});