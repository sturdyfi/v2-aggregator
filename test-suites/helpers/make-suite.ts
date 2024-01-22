import {
  evmRevert,
  evmSnapshot,
  DRE,
  impersonateAccountsHardhat,
} from '../../helpers/misc-utils';
import { Signer } from 'ethers';
import { eNetwork, ISturdyConfiguration, tEthereumAddress } from '../../helpers/types';

import chai from 'chai';
// @ts-ignore
import bignumberChai from 'chai-bignumber';
import { getEthersSigners } from '../../helpers/contracts-helpers';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { solidity } from 'ethereum-waffle';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import { parseEther } from '@ethersproject/units';
import { IERC20Detailed } from '../../types';
import { IERC20Detailed__factory } from '../../types';

chai.use(bignumberChai());
chai.use(solidity);

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}
export interface TestEnv {
  deployer: SignerWithAddress;
  owner: SignerWithAddress;
  users: SignerWithAddress[];
  FRAX: IERC20Detailed;
  USDC: IERC20Detailed;
  CRV: IERC20Detailed;
}

let buidlerevmSnapshotId: string = '0x1';
const setBuidlerevmSnapshotId = (id: string) => {
  buidlerevmSnapshotId = id;
};

const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  owner: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  FRAX: {} as IERC20Detailed,
  USDC: {} as IERC20Detailed,
  CRV: {} as IERC20Detailed,
} as TestEnv;

export async function initializeMakeSuite() {
  // Mainnet missing addresses
  const poolConfig = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
  const fraxAddress = getParamPerNetwork(poolConfig.FRAX, network);
  const usdcAddress = getParamPerNetwork(poolConfig.USDC, network);
  const crvAddress = getParamPerNetwork(poolConfig.CRV, network);

  const [_deployer, ...restSigners] = await getEthersSigners();
  let deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  if (network == 'main') {
    const deployerAddress = '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc';
    const ethers = (DRE as any).ethers;
    await impersonateAccountsHardhat([deployerAddress]);
    let signer = await ethers.provider.getSigner(deployerAddress);
    testEnv.owner = {
      address: deployerAddress,
      signer: signer,
    };

    await _deployer.sendTransaction({ value: parseEther('90000'), to: deployerAddress });
  }

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;

  testEnv.FRAX = IERC20Detailed__factory.connect(fraxAddress, deployer.signer);
  testEnv.USDC = IERC20Detailed__factory.connect(usdcAddress, deployer.signer);
  testEnv.CRV = IERC20Detailed__factory.connect(crvAddress, deployer.signer);
}

const setSnapshot = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  setBuidlerevmSnapshotId(await evmSnapshot());
};

const revertHead = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  await evmRevert(buidlerevmSnapshotId);
};

export function makeSuite(name: string, tests: (testEnv: TestEnv) => void) {
  describe(name, () => {
    before(async () => {
      if (DRE.network.name != 'goerli') await setSnapshot();
    });
    tests(testEnv);
    after(async () => {
      if (DRE.network.name != 'goerli') await revertHead();
    });
  });
}
