// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './GenericLender.sol';
import {SafeERC20} from '../../helpers/libraries/SafeERC20.sol';
import {IERC20} from '../../helpers/interfaces/IERC20.sol';
import {IERC20Detailed} from '../../helpers/interfaces/IERC20Detailed.sol';
import {IScaledBalanceToken} from '../../helpers/interfaces/IScaledBalanceToken.sol';
import {IAaveV3ProtocolDataProvider} from '../../helpers/interfaces/IAaveV3ProtocolDataProvider.sol';
import {IReserveInterestRateStrategy} from '../../helpers/interfaces/IReserveInterestRateStrategy.sol';
import {ILendingPool, DataTypes} from '../../helpers/interfaces/ILendingPool.sol';
import {IStableDebtToken} from '../../helpers/interfaces/IStableDebtToken.sol';
import {Errors} from '../../helpers/libraries/Errors.sol';
import {WadRayMath} from '../../helpers/libraries/WadRayMath.sol';
import {ReserveConfiguration} from '../../helpers/libraries/ReserveConfiguration.sol';

contract AaveV3Lender is GenericLender {
  using SafeERC20 for IERC20;
  using WadRayMath for uint256;
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

  ILendingPool private constant LENDING_POOL = ILendingPool(0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2);
  address private aToken;

  constructor(
    address _aggregator,
    string memory _name,
    address _aToken
  ) GenericLender(_aggregator, _name) {
    _initialize(_aToken);
  }

  function initialize(address _aToken) external {
    _initialize(_aToken);
  }

  function cloneAaveV3Lender(
    address _aggregator,
    string memory _name,
    address _aToken
  ) external returns (address newLender) {
    newLender = _clone(_aggregator, _name);
    AaveV3Lender(newLender).initialize(_aToken);
  }

  function POOL() external view override returns (address) {
    return aToken;
  }

  function totalAssets() external view returns (uint256) {
    return _totalAssets();
  }

  function convertToAssets(uint256 shares) external view returns (uint256) {
    return _convertToAssets(shares);
  }

  function convertToShares(uint256 assets) external view returns (uint256) {
    return _convertToShares(assets);
  }

  function balanceOf(address owner) external view returns (uint256) {
    return _balanceOf(owner);
  }

  function maxDeposit(address receiver) external view returns (uint256) {
    require(receiver == aggregator, Errors.AG_INVALID_CONFIGURATION);

    if (!_checkDepositPool()) return 0;

    DataTypes.ReserveData memory reserveData = LENDING_POOL.getReserveData(address(asset));
    uint256 supplyCap = reserveData.configuration.getSupplyCap();
    uint256 decimals = reserveData.configuration.getDecimals();
    if (supplyCap != 0) return supplyCap * 10 ** decimals;
    
    return type(uint256).max;
  }

  function maxWithdraw(address owner) external view returns (uint256) {
    return _maxWithdraw(owner);
  }

  function maxRedeem(address owner) external view returns (uint256) {
    return _maxRedeem(owner);
  }

  function previewWithdraw(uint256 assets) external view returns (uint256) {
    return _convertToShares(assets);
  }

  function name() external view returns (string memory) {
    return lenderName;
  }

  function ASSET() external view returns (address) {
    return address(asset);
  }

  function AGGREGATOR() external view returns (address) {
    return aggregator;
  }

  function apr() external view returns (uint256) {
    // dividing by 1e9 to pass from ray to wad
    return uint256(LENDING_POOL.getReserveData(address(asset)).currentLiquidityRate) / 1e9;
  }

  function aprAfterDebtChange(uint256 amount, bool increased) external view returns (uint256) {
    address want = address(asset);

    //need to calculate new supplyRate after Deposit (when deposit has not been done yet)
    DataTypes.ReserveData memory reserveData = LENDING_POOL.getReserveData(want);
    uint256 totalStableDebt = IERC20Detailed(reserveData.stableDebtTokenAddress).totalSupply();
    uint256 totalVariableDebt = IERC20Detailed(reserveData.variableDebtTokenAddress).totalSupply();
    uint256 averageStableBorrowRate = IStableDebtToken(reserveData.stableDebtTokenAddress).getAverageStableRate();
    uint256 reserveFactor = reserveData.configuration.getReserveFactor();

    uint256 addedAmount;
    uint256 takenAmount;
    if (increased) {
      addedAmount = amount;
    } else {
      takenAmount = amount;
    }
    DataTypes.CalculateInterestRatesParams memory params = DataTypes.CalculateInterestRatesParams(
        reserveData.unbacked,
        addedAmount,
        takenAmount,
        totalStableDebt,
        totalVariableDebt,
        averageStableBorrowRate,
        reserveFactor,
        want,
        aToken
    );

    (uint256 newLiquidityRate, , ) = IReserveInterestRateStrategy(reserveData.interestRateStrategyAddress).calculateInterestRates(params);
    
    return newLiquidityRate / 1e9; // divided by 1e9 to go from Ray to Wad
  }

  function deposit(
    uint256 assets,
    address receiver
  ) external onlyAggregator returns (uint256) {
    IERC20 want = asset;

    require(msg.sender == receiver, Errors.AG_INVALID_CONFIGURATION);

    // transfer and invest
    want.transferFrom(aggregator, address(this), assets);

    if(want.allowance(address(this), address(LENDING_POOL)) < assets){
      want.safeApprove(address(LENDING_POOL), 0);
      want.safeApprove(address(LENDING_POOL), assets);
    }

    LENDING_POOL.supply(address(want), assets, address(this), 0);

    return assets;
  }

  function withdraw(
    uint256 amount,
    address receiver,
    address owner
  ) external onlyAggregator returns (uint256) {
    require(msg.sender == owner, Errors.AG_INVALID_CONFIGURATION);
    require(amount <= _maxWithdraw(owner), Errors.AG_INVALID_CONFIGURATION);
    
    uint256 retAmount = _withdraw(amount, receiver);
    
    return _convertToShares(retAmount);
  }

  function redeem(
    uint256 shares,
    address receiver,
    address owner
  ) external onlyAggregator returns (uint256) {
    require(msg.sender == owner, Errors.AG_INVALID_CONFIGURATION);
    require(shares <= _maxRedeem(owner), Errors.AG_INVALID_CONFIGURATION);

    return _withdraw(_convertToAssets(shares), receiver);
  }

  function transferShares(address to, uint256 shares) external onlyAggregator {
    IERC20(aToken).safeTransfer(to, _convertToAssets(shares));
  }

  function _balanceOf(address owner) internal view returns (uint256) {
    if (owner == aggregator) {
      return IScaledBalanceToken(aToken).scaledBalanceOf(address(this));
    }

    return 0;
  }

  function _maxWithdraw(address owner) internal view returns (uint256) {
    if (_checkWithdrawPool() && owner == aggregator) return _totalAssets();

    return 0;
  }

  function _maxRedeem(address owner) internal view returns (uint256) {
    if (!_checkWithdrawPool()) return 0;

    return _balanceOf(owner);
  }

  function _totalAssets() internal view returns (uint256) {
    return IERC20(aToken).balanceOf(address(this));
  }

  function _convertToShares(uint256 assets) internal view returns (uint256) {
    uint256 rate = LENDING_POOL.getReserveNormalizedIncome(address(asset));
    
    return assets.rayDiv(rate);
  }

  function _convertToAssets(uint256 shares) internal view returns (uint256) {
    uint256 rate = LENDING_POOL.getReserveNormalizedIncome(address(asset));
    
    return shares.rayMul(rate);
  }

  function _checkDepositPool() internal view returns (bool) {
    // check if asset is paused
    DataTypes.ReserveConfigurationMap memory configuration = LENDING_POOL.getConfiguration(
      address(asset)
    );
    (bool isActive, bool isFrozen, , , bool isPaused) = configuration.getFlags();

    if (!isActive || isFrozen || isPaused) {
      return false;
    }

    return true;
  }

  function _checkWithdrawPool() internal view returns (bool) {
    // check if asset is paused
    DataTypes.ReserveConfigurationMap memory configuration = LENDING_POOL.getConfiguration(
      address(asset)
    );
    (bool isActive, , , , bool isPaused) = configuration.getFlags();

    if (!isActive || isPaused) {
      return false;
    }

    return true;
  }

  function _withdraw(uint256 amount, address receiver) internal returns (uint256) {
    address want = address(asset);

    //not state changing but OK because of previous call
    uint256 liquidity = IERC20(want).balanceOf(aToken);
    if (amount <= liquidity) {
      //we can take all
      LENDING_POOL.withdraw(want, amount, receiver);
      return amount;
    }
    
    //take all we can
    LENDING_POOL.withdraw(want, liquidity, receiver);
    return liquidity;
  }

  function _initialize(address _aToken) internal {
    require(address(aToken) == address(0), Errors.AG_ALREADY_INITIALIZED);

    aToken = _aToken;
  }
}
