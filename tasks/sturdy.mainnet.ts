import { task } from 'hardhat/config';
import { checkVerification } from '../helpers/etherscan-verification';
import { printContracts } from '../helpers/misc-utils';

task('sturdy:mainnet', 'Deploy development enviroment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addFlag('skipRegistry', 'Skip addresses provider registration at Addresses Provider Registry')
  .setAction(async ({ verify, skipRegistry }, DRE) => {
    await DRE.run('set-DRE');

    // Prevent loss of gas verifying all the needed ENVs for Etherscan verification
    if (verify) {
      checkVerification();
    }

    console.log('Migration started\n');

    console.log('1. Deploy Aggregator Factory');
    await DRE.run('full:deploy-aggregatorV2-factory', { skipRegistry, verify });

    // if (verify) {
    //   printContracts();
    //   console.log('9. Veryfing contracts');
    //   await DRE.run('verify:general', { all: true, pool: POOL_NAME });

    //   console.log('10. Veryfing aTokens and debtTokens');
    //   await DRE.run('verify:tokens', { pool: POOL_NAME });
    // }

    console.log('\nFinished migrations');
    printContracts();
  });
