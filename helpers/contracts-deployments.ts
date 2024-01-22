import { DRE, waitForTx } from './misc-utils';
import {
  eContractid, tEthereumAddress,
} from './types';
import {
  getFirstSigner,
  getAggregator,
  getAggregatorV2Impl,
  getAggregatorV2Factory,
  getAggregatorV2DataProvider,
} from './contracts-getters';
import {
  AggregatorV2__factory,
  FraxLender,
  FraxLender__factory,
  LenderDebtManager__factory,
  AaveV3Lender__factory,
  AaveV3Lender,
  CompoundV3Lender__factory,
  CompoundV3Lender,
  SiloGateway__factory,
  AggregatorV2Factory__factory,
  AggregatorV2DataProvider__factory,
} from '../types';
import {
  withSaveAndVerify,
  rawInsertContractAddressInDb,
} from './contracts-helpers';
import { ZERO_ADDRESS } from './constants';

export interface SiloData {
  lenderType: number;
  lender: tEthereumAddress;
  version: number;
}

export const deployAggregatorV2Impl = async (verify?: boolean) => {
  const signer = await getFirstSigner();
  const impl = await withSaveAndVerify(
    await new AggregatorV2__factory(signer).deploy(ZERO_ADDRESS),
    eContractid.AggregatorV2Impl,
    [ZERO_ADDRESS],
    verify
  );

  await waitForTx(await impl.initialize(await signer.getAddress()));
}

export const deployAggregatorV2Factory = async (verify?: boolean) => {
  const impl = await getAggregatorV2Impl();
  const dataProvider = await getAggregatorV2DataProvider();
  return withSaveAndVerify(
    await new AggregatorV2Factory__factory(await getFirstSigner()).deploy(impl.address, dataProvider.address),
    eContractid.AggregatorV2Factory,
    [impl.address, dataProvider.address],
    verify
  );
}

export const deployFraxLender = async (args: [string, string, string, string], verify?: boolean) =>
  withSaveAndVerify(
    await new FraxLender__factory(await getFirstSigner()).deploy(...args),
    args[1].toUpperCase() + eContractid.FraxLender,
    args,
    verify
  );

export const cloneFraxLender = async (args: [string, string, string, string], fromLender: FraxLender) => {
  const tx = await fromLender.cloneFraxLender(...args);
  const rc = await tx.wait();
  const event = rc.events?.find((event) => event.event === 'Cloned');
  const newLenderAddress = event?.args?.[0];
  await rawInsertContractAddressInDb(
    args[1].toUpperCase() + eContractid.FraxLender,
    newLenderAddress
  );

  return FraxLender__factory.connect(newLenderAddress, await getFirstSigner());
};

export const deployAaveV3Lender = async (args: [string, string, string], verify?: boolean) =>
  withSaveAndVerify(
    await new AaveV3Lender__factory(await getFirstSigner()).deploy(...args),
    args[1].toUpperCase() + eContractid.AaveV3Lender,
    args,
    verify
  );

export const cloneAaveV3Lender = async (args: [string, string, string], fromLender: AaveV3Lender) => {
  const tx = await fromLender.cloneAaveV3Lender(...args);
  const rc = await tx.wait();
  const event = rc.events?.find((event) => event.event === 'Cloned');
  const newLenderAddress = event?.args?.[0];
  await rawInsertContractAddressInDb(
    args[1].toUpperCase() + eContractid.AaveV3Lender,
    newLenderAddress
  );

  return AaveV3Lender__factory.connect(newLenderAddress, await getFirstSigner());
};

export const deployCompoundV3Lender = async (args: [string, string, string], verify?: boolean) =>
  withSaveAndVerify(
    await new CompoundV3Lender__factory(await getFirstSigner()).deploy(...args),
    args[1].toUpperCase() + eContractid.CompoundV3Lender,
    args,
    verify
  );

export const cloneCompoundV3Lender = async (args: [string, string, string], fromLender: CompoundV3Lender) => {
  const tx = await fromLender.cloneCompoundV3Lender(...args);
  const rc = await tx.wait();
  const event = rc.events?.find((event) => event.event === 'Cloned');
  const newLenderAddress = event?.args?.[0];
  await rawInsertContractAddressInDb(
    args[1].toUpperCase() + eContractid.CompoundV3Lender,
    newLenderAddress
  );

  return CompoundV3Lender__factory.connect(newLenderAddress, await getFirstSigner());
};

export const deployAggregator = async (
  assetSymbol: string, 
  adminFee: string,
  protcolFee: string,
  minTotalIdle: string,
  proxyAdmin: string,
  treasury: string,
  asset: string,
  lpTokenName: string,
  lpTokenSymbol: string,
  lpTokenDecimals: string,
  silos: SiloData[],
  verify?: boolean
) => {
  const factory = await getAggregatorV2Factory();

  const ret = await waitForTx(
    await factory.create(
      adminFee,
      protcolFee,
      minTotalIdle,
      proxyAdmin,
      treasury,
      asset,
      lpTokenName,
      lpTokenSymbol,
      lpTokenDecimals,
      silos
    )
  );
  await rawInsertContractAddressInDb(
    assetSymbol.toUpperCase() + eContractid.AggregatorV2,
    ret.events?.[ret.events?.length - 1]?.args?.[0]
  );

  return await getAggregator(assetSymbol);
};

export const deployLenderDebtManager = async (args: [string, string], verify?: boolean) =>
  withSaveAndVerify(
    await new LenderDebtManager__factory(await getFirstSigner()).deploy(args[1]),
    args[0].toUpperCase() + eContractid.LenderDebtManager,
    args,
    verify
  );

export const deploySiloGateway = async (args: [string, string, string], verify?: boolean) =>
  withSaveAndVerify(
    await new SiloGateway__factory(await getFirstSigner()).deploy(args[1], args[2]),
    args[0].toUpperCase() + eContractid.SiloGateway,
    args,
    verify
  );

export const deployAggregatorV2DataProvider = async (verify?: boolean) =>
  withSaveAndVerify(
    await new AggregatorV2DataProvider__factory(await getFirstSigner()).deploy(),
    eContractid.AggregatorV2DataProvider,
    [],
    verify
  );
