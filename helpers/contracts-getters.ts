import {
  AggregatorV2__factory,
  MintableERC20__factory,
  IERC20Detailed__factory,
  AggregatorV2Factory__factory,
  AggregatorV2DataProvider__factory,
} from '../types';
import { getEthersSigners } from './contracts-helpers';
import { DRE, getDb } from './misc-utils';
import { eContractid, tEthereumAddress } from './types';

export const getFirstSigner = async () => (await getEthersSigners())[0];

export const getAggregatorV2Impl = async (address?: tEthereumAddress) =>
  await AggregatorV2__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.AggregatorV2Impl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

  export const getAggregatorV2Factory = async (address?: tEthereumAddress) =>
  await AggregatorV2Factory__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.AggregatorV2Factory}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getAggregator = async (assetSymbol: string, address?: tEthereumAddress) =>
  await AggregatorV2__factory.connect(
    address ||
      (
        await getDb()
          .get(`${assetSymbol.toUpperCase() + eContractid.AggregatorV2}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getAggregatorV2DataProvider = async (address?: tEthereumAddress) =>
  await AggregatorV2DataProvider__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.AggregatorV2DataProvider}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getIErc20Detailed = async (address: tEthereumAddress) =>
  await IERC20Detailed__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.IERC20Detailed}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMintableERC20 = async (address: tEthereumAddress) =>
  await MintableERC20__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MintableERC20}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );