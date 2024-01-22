import {
  PoolConfiguration,
} from './types';
import SturdyConfig from '../markets';

export enum ConfigNames {
  Commons = 'Commons',
  Sturdy = 'Sturdy',
}

export const loadPoolConfig = (configName: ConfigNames): PoolConfiguration => {
  switch (configName) {
    case ConfigNames.Sturdy:
      return SturdyConfig;
    default:
      throw new Error(`Unsupported pool configuration: ${Object.values(ConfigNames)}`);
  }
};