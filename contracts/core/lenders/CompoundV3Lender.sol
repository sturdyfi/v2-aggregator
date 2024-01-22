// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './GenericLender.sol';
import {SafeERC20} from '../../helpers/libraries/SafeERC20.sol';
import {IERC20} from '../../helpers/interfaces/IERC20.sol';
import {ICometMain} from '../../helpers/interfaces/ICometMain.sol';
import {Errors} from '../../helpers/libraries/Errors.sol';

contract CompoundV3Lender is GenericLender {
  using SafeERC20 for IERC20;

  uint256 private constant SECOND_PER_YEAR = 31_536_000;
  uint256 private constant FACTOR_SCALE = 1e18;

  address private cToken;

  constructor(
    address _aggregator,
    string memory _name,
    address _cToken
  ) GenericLender(_aggregator, _name) {
    _initialize(_cToken);
  }

  function initialize(address _cToken) external {
    _initialize(_cToken);
  }

  function cloneCompoundV3Lender(
    address _aggregator,
    string memory _name,
    address _cToken
  ) external returns (address newLender) {
    newLender = _clone(_aggregator, _name);
    CompoundV3Lender(newLender).initialize(_cToken);
  }

  function POOL() external view override returns (address) {
    return cToken;
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
    address pool = cToken;
    uint256 utilization = ICometMain(pool).getUtilization();
    uint256 supplyRate = ICometMain(pool).getSupplyRate(utilization);

    return supplyRate * SECOND_PER_YEAR;
  }

  function aprAfterDebtChange(uint256 amount, bool increased) external view returns (uint256) {
    address pool = cToken;
    uint256 totalSupply = ICometMain(pool).totalSupply();
    uint256 totalBorrow = ICometMain(pool).totalBorrow();
    uint256 utilization;

    totalSupply = increased ? totalSupply + amount : totalSupply - amount;
    if (totalSupply != 0) {
      utilization = totalBorrow * FACTOR_SCALE / totalSupply;
    }

    uint256 supplyRate = ICometMain(pool).getSupplyRate(utilization);
    
    return supplyRate * SECOND_PER_YEAR;
  }

  function deposit(
    uint256 assets,
    address receiver
  ) external onlyAggregator returns (uint256) {
    IERC20 want = asset;

    require(msg.sender == receiver, Errors.AG_INVALID_CONFIGURATION);

    // transfer and invest
    want.transferFrom(aggregator, address(this), assets);

    address pool = cToken;
    if(want.allowance(address(this), pool) < assets){
      want.safeApprove(pool, 0);
      want.safeApprove(pool, assets);
    }

    ICometMain(pool).supply(address(asset), assets);

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
    IERC20(cToken).safeTransfer(to, _convertToAssets(shares));
  }

  function _balanceOf(address owner) internal view returns (uint256) {
    if (owner == aggregator) {
      return uint104(ICometMain(cToken).userBasic(address(this)).principal);
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
    return IERC20(cToken).balanceOf(address(this));
  }

  function _convertToShares(uint256 assets) internal view returns (uint256) {
    uint256 totalShares = _balanceOf(aggregator);
    uint256 totalAssets = _totalAssets();

    return assets * totalShares / totalAssets;
  }

  function _convertToAssets(uint256 shares) internal view returns (uint256) {
    uint256 totalShares = _balanceOf(aggregator);
    uint256 totalAssets = _totalAssets();
    
    return shares * totalAssets / totalShares;
  }

  function _checkDepositPool() internal view returns (bool) {
    // check if deposit paused
    if (ICometMain(cToken).isSupplyPaused()) {
      return false;
    }

    return true;
  }

  function _checkWithdrawPool() internal view returns (bool) {
    // check if withdraw paused
    if (ICometMain(cToken).isWithdrawPaused()) {
      return false;
    }

    return true;
  }

  function _withdraw(uint256 amount, address receiver) internal returns (uint256) {
    address want = address(asset);
    address pool = cToken;

    //not state changing but OK because of previous call
    uint256 liquidity = IERC20(want).balanceOf(pool);
    if (amount <= liquidity) {
      //we can take all
      ICometMain(pool).withdrawTo(receiver, want, amount);
      return amount;
    }
    
    //take all we can
    ICometMain(pool).withdrawTo(receiver, want, liquidity);

    return liquidity;
  }

  function _initialize(address _cToken) internal {
    require(address(cToken) == address(0), Errors.AG_ALREADY_INITIALIZED);

    cToken = _cToken;
  }
}
