import { ISturdyConfiguration, eEthereumNetwork } from '../helpers/types';

// ----------------
// POOL--SPECIFIC PARAMS
// ----------------

export const SturdyConfig: ISturdyConfiguration = {
  FRAX: {
    [eEthereumNetwork.main]: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    [eEthereumNetwork.tenderly]: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
  },
  USDC: {
    [eEthereumNetwork.main]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    [eEthereumNetwork.tenderly]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  CRV: {
    [eEthereumNetwork.main]: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    [eEthereumNetwork.tenderly]: '0xD533a949740bb3306d119CC777fa900bA034cd52',
  },
};

export default SturdyConfig;
