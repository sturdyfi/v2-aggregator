import rawBRE from 'hardhat';
import { initializeMakeSuite } from './helpers/make-suite';

before(async () => {
  await rawBRE.run('set-DRE');
  const FORK = process.env.FORK;
  const SKIP_DEPLOY = process.env.SKIP_DEPLOY;

  if (!SKIP_DEPLOY) {
    if (FORK) {
      await rawBRE.run('sturdy:mainnet');
    } else {
      console.log('-> Deploying test environment...');
      // await buildTestEnv(deployer, secondaryWallet);
    }
  }

  await initializeMakeSuite();
  console.log('\n***************');
  console.log('Setup and snapshot finished');
  console.log('***************\n');
});
