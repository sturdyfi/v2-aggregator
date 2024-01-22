import BigNumber from 'bignumber.js';

export interface SymbolMap<T> {
  [symbol: string]: T;
}

export type eNetwork = eEthereumNetwork;

export enum eEthereumNetwork {
  main = 'main',
  tenderly = 'tenderly',
}

export enum EthereumNetworkNames {
  main = 'main',
}

export enum SturdyPools {
  proto = 'proto',
}

export enum eContractid {
  Example = 'Example',
  IERC20Detailed = 'IERC20Detailed',
  MintableERC20 = 'MintableERC20',
  FraxLender = 'FraxLender',
  AaveV3Lender = 'AaveV3Lender',
  CompoundV3Lender = 'CompoundV3Lender',
  AggregatorV2Factory = 'AggregatorV2Factory',
  AggregatorV2 = 'AggregatorV2',
  AggregatorV2Impl = 'AggregatorV2Impl',
  LenderDebtManager = 'LenderDebtManager',
  SiloGateway = 'SiloGateway',
  AggregatorV2DataProvider = 'AggregatorV2DataProvider',
}

export type tEthereumAddress = string;
export type tStringTokenBigUnits = string; // 1 ETH, or 10e6 USDC or 10e18 DAI
export type tBigNumberTokenBigUnits = BigNumber;
export type tStringTokenSmallUnits = string; // 1 wei, or 1 basic unit of USDC, or 1 basic unit of DAI
export type tBigNumberTokenSmallUnits = BigNumber;

export interface iAssetCommon<T> {
  [key: string]: T;
}
export interface iAssetBase<T> {
  WETH: T;
  DAI: T;
  USDC: T;
  USDT: T;
  USD: T;
}

export type iAssetsWithoutETH<T> = Omit<iAssetBase<T>, 'ETH'>;

export type iAssetsWithoutUSD<T> = Omit<iAssetBase<T>, 'USD'>;

export type iSturdyPoolAssets<T> = Pick<
  iAssetsWithoutUSD<T>,
  | 'DAI'
  | 'USDC'
  | 'USDT'
>;

export type iMultiPoolsAssets<T> = iAssetCommon<T> | iSturdyPoolAssets<T>;

export type iSturdyPoolTokens<T> = Omit<iSturdyPoolAssets<T>, 'ETH'>;

export type iAssetAggregatorBase<T> = iAssetsWithoutETH<T>;

export enum TokenContractId {
  DAI = 'DAI',
  WETH = 'WETH',
  USDC = 'USDC',
  USDT = 'USDT',
}

export type iParamsPerNetwork<T> = iEthereumParamsPerNetwork<T>;

export interface iParamsPerNetworkAll<T> extends iEthereumParamsPerNetwork<T> {}

export interface iEthereumParamsPerNetwork<T> {
  [eEthereumNetwork.main]: T;
  [eEthereumNetwork.tenderly]: T;
}

export interface iParamsPerPool<T> {
  [SturdyPools.proto]: T;
}

export enum RateMode {
  None = '0',
  Stable = '1',
  Variable = '2',
}

export interface ObjectString {
  [key: string]: string;
}

export interface ISturdyConfiguration {
  FRAX: iParamsPerNetwork<tEthereumAddress>;
  USDC: iParamsPerNetwork<tEthereumAddress>;
  CRV: iParamsPerNetwork<tEthereumAddress>;
}

export interface ITokenAddress {
  [token: string]: tEthereumAddress;
}

export type PoolConfiguration = ISturdyConfiguration;
