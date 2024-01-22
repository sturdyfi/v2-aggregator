import { getMintableERC20 } from '../../helpers/contracts-getters';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { SignerWithAddress } from './make-suite';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const FRAX = '0x853d955aCEf822Db058eb8505911ED77F175b99e';
const CRV = '0xD533a949740bb3306d119CC777fa900bA034cd52';

const TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    symbol: 'DAI',
    address: DAI,
    owner: '0x28C6c06298d514Db089934071355E5743bf21d60',
  },
  {
    symbol: 'USDC',
    address: USDC,
    owner: '0x28C6c06298d514Db089934071355E5743bf21d60',
  },
  {
    symbol: 'USDT',
    address: USDT,
    owner: '0x28C6c06298d514Db089934071355E5743bf21d60',
  },
  {
    symbol: 'FRAX',
    address: FRAX,
    owner: '0xcC46564Eb2063B60cd457da49d09dcA9544dfeAE',
  },
  {
    symbol: 'CRV',
    address: CRV,
    owner: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
  },
];

export async function mint(reserveSymbol: string, amount: string, user: SignerWithAddress) {
  const ethers = (DRE as any).ethers;

  const token = TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  if (token) {
    const asset = await getMintableERC20(token.address);
    await impersonateAccountsHardhat([token.owner]);
    const signer = await ethers.provider.getSigner(token.owner);
    await waitForTx(await asset.connect(signer).transfer(user.address, amount));
  }
}
