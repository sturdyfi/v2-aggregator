import { task } from 'hardhat/config';
import {
  ConfigNames,
} from '../helpers/configuration';
import { getEthersSigners } from '../helpers/contracts-helpers';
import { deployAggregatorV2DataProvider, deployAggregatorV2Factory, deployAggregatorV2Impl } from '../helpers/contracts-deployments';
import { getAggregatorV2DataProvider, getAggregatorV2Factory } from '../helpers/contracts-getters';

task(
  'full:deploy-aggregatorV2-factory',
  'Deploy aggregator v2 factory'
)
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addFlag('skipRegistry')
  .setAction(async ({ verify }, DRE) => {
    await DRE.run('set-DRE');

    // Deploy aggregator v2 data provider
    await deployAggregatorV2DataProvider(verify);

    // Deploy aggregator v2 impl
    await deployAggregatorV2Impl(verify);

    // Deploy aggregator v2 factory
    const factory = await deployAggregatorV2Factory(verify);

    // set factory address to data provider
    const dataProvider = await getAggregatorV2DataProvider();
    await dataProvider.setFactory(factory.address);
  });
