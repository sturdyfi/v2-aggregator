// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './GenericLender.sol';
import {SafeERC20} from '../../helpers/libraries/SafeERC20.sol';
import {IERC20} from '../../helpers/interfaces/IERC20.sol';
import {IFraxlendPair} from '../../helpers/interfaces/IFraxlendPair.sol';
import {IFraxlendPairV2} from '../../helpers/interfaces/IFraxlendPairV2.sol';
import {IFraxlendPairV3} from '../../helpers/interfaces/IFraxlendPairV3.sol';
import {IRateCalculator} from '../../helpers/interfaces/IRateCalculator.sol';
import {IRateCalculatorV2} from '../../helpers/interfaces/IRateCalculatorV2.sol';
import {Errors} from '../../helpers/libraries/Errors.sol';

contract FraxLender is GenericLender {
  using SafeERC20 for IERC20;

  address private pair;
  uint256 private version;

  constructor(
    address _aggregator,
    string memory _name,
    address _pair,
    uint256 _version
  ) GenericLender(_aggregator, _name) {
    _initialize(_pair, _version);
  }

  function initialize(address _pair, uint256 _version) external {
    _initialize(_pair, _version);
  }

  function cloneFraxLender(
    address _aggregator,
    string memory _name,
    address _pair,
    uint256 _version
  ) external returns (address newLender) {
    newLender = _clone(_aggregator, _name);
    FraxLender(newLender).initialize(_pair, _version);
  }

  function POOL() external view override returns (address) {
    return pair;
  }

  function PAIRVERSION() external view returns (uint256) {
    return version;
  }

  function totalAssets() external view returns (uint256) {
    return _totalAssets();
  }

  function convertToAssets(uint256 shares) external view returns (uint256) {
    if (version < 3) return IFraxlendPair(pair).toAssetAmount(shares, false);
    
    return IFraxlendPairV3(pair).toAssetAmount(shares, false, true);
  }

  function convertToShares(uint256 assets) external view returns (uint256) {
    return _convertToShares(assets, false);
  }

  function balanceOf(address owner) external view returns (uint256) {
    return _balanceOf(owner);
  }

  function maxDeposit(address receiver) external view returns (uint256) {
    require(receiver == aggregator, Errors.AG_INVALID_CONFIGURATION);

    return type(uint256).max;
  }

  function maxWithdraw(address owner) external view returns (uint256) {
    return _maxWithdraw(owner);
  }

  function maxRedeem(address owner) external view returns (uint256) {
    return _maxRedeem(owner);
  }

  function previewWithdraw(uint256 assets) external view returns (uint256) {
    return _convertToShares(assets, true);
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
    uint256 ratePerSec; 
    
    if (version == 1) {
      (,,, ratePerSec) = IFraxlendPair(pair).currentRateInfo();
    } else {
      (,,, ratePerSec,) = IFraxlendPairV2(pair).currentRateInfo();
    }

    return ratePerSec * YEAR_SEC;
  }

  function aprAfterDebtChange(uint256 amount, bool increased) external view returns (uint256) {
    IFraxlendPair pool = IFraxlendPair(pair);
    uint256 lastBlock;
    uint256 lastTimestamp;
    uint256 ratePerSec;
    uint256 fullUtilizationRate;
    uint256 UTIL_PREC;
    uint256 DEFAULT_INT;
    
    if (version == 1) {
      (lastBlock,, lastTimestamp, ratePerSec) = pool.currentRateInfo();
    } else {
      (lastBlock,, lastTimestamp, ratePerSec, fullUtilizationRate) = IFraxlendPairV2(pair).currentRateInfo();
    }

    if (lastTimestamp == block.timestamp) {
      return ratePerSec * YEAR_SEC;
    }

    (uint256 assetAmount, ) = pool.totalAsset();
    (uint256 borrowAmount, uint256 borrowShares) = pool.totalBorrow();
    assetAmount = increased ? assetAmount + amount : assetAmount - amount;

    if (version < 3) {
      (,, UTIL_PREC,,, DEFAULT_INT,,) = pool.getConstants();

      if (borrowShares == 0 && !pool.paused()) {
        return DEFAULT_INT * YEAR_SEC;
      }

      uint256 maturityDate = pool.maturityDate();
      if (maturityDate != 0 && block.timestamp > maturityDate) {
        return pool.penaltyRate() * YEAR_SEC;
      }
    } else {
      (,, UTIL_PREC,,,,,) = IFraxlendPairV3(pair).getConstants();

      if (IFraxlendPairV3(pair).isInterestPaused()) {
        return ratePerSec * YEAR_SEC;
      }
    }

    uint256 deltaTime = block.timestamp - lastTimestamp;
    uint256 utilizationRate = assetAmount == 0 
      ? 0
      : (UTIL_PREC * borrowAmount) / assetAmount;
    if (version == 1) {
      bytes memory rateData = abi.encode(
        ratePerSec,
        deltaTime,
        utilizationRate,
        block.number - lastBlock
      );
      bytes memory rateInitCallData = pool.rateInitCallData();
      ratePerSec = IRateCalculator(pool.rateContract()).getNewRate(rateData, rateInitCallData);
    } else {
      (ratePerSec, ) = IRateCalculatorV2(pool.rateContract()).getNewRate(
        deltaTime,
        utilizationRate,
        uint64(fullUtilizationRate)
      );
    }

    return ratePerSec * YEAR_SEC;
  }

  function deposit(
    uint256 assets,
    address receiver
  ) external onlyAggregator returns (uint256) {
    IERC20 want = asset;

    require(msg.sender == receiver, Errors.AG_INVALID_CONFIGURATION);

    // transfer and invest
    want.transferFrom(aggregator, address(this), assets);

    address pool = pair;
    if(want.allowance(address(this), pool) < assets){
      want.safeApprove(pool, 0);
      want.safeApprove(pool, assets);
    }

    IFraxlendPair(pool).deposit(assets, address(this));

    return assets;
  }

  function withdraw(
    uint256 amount,
    address receiver,
    address owner
  ) external onlyAggregator returns (uint256) {
    require(msg.sender == owner, Errors.AG_INVALID_CONFIGURATION);
    require(amount <= _maxWithdraw(owner), Errors.AG_INVALID_CONFIGURATION);

    IFraxlendPair pool = IFraxlendPair(pair);
    uint256 shares;
    if (version < 3) {
      shares = pool.toAssetShares(amount, true);
    } else {
      shares = IFraxlendPairV3(pair).toAssetShares(amount, true, true);
    }

    pool.redeem(shares, receiver, address(this));

    return shares;
  }

  function redeem(
    uint256 shares,
    address receiver,
    address owner
  ) external onlyAggregator returns (uint256) {
    require(msg.sender == owner, Errors.AG_INVALID_CONFIGURATION);
    require(shares <= _maxRedeem(owner), Errors.AG_INVALID_CONFIGURATION);

    return IFraxlendPair(pair).redeem(shares, receiver, address(this));
  }

  function transferShares(address to, uint256 shares) external onlyAggregator {
    IERC20(pair).safeTransfer(to, shares);
  }

  function _balanceOf(address owner) internal view returns (uint256) {
    if (owner == aggregator) {
      return IERC20(pair).balanceOf(address(this));
    }

    return 0;
  }

  function _maxWithdraw(address owner) internal view returns (uint256) {
    if (owner == aggregator) return _totalAssets();

    return 0;
  }

  function _maxRedeem(address owner) internal view returns (uint256) {
    return _balanceOf(owner);
  }

  function _totalAssets() internal view returns (uint256) {
    address pool = pair;
    uint256 shares = IERC20(pool).balanceOf(address(this));

    if (version < 3) return IFraxlendPair(pool).toAssetAmount(shares, false);

    return IFraxlendPairV3(pool).toAssetAmount(shares, false, true);
  }

  function _convertToShares(uint256 assets, bool roundUp) internal view returns (uint256) {
    if (version < 3) return IFraxlendPair(pair).toAssetShares(assets, roundUp);
    
    return IFraxlendPairV3(pair).toAssetShares(assets, roundUp, true);
  }

  function _initialize(address _pair, uint256 _version) internal {
    require(address(pair) == address(0), Errors.AG_ALREADY_INITIALIZED);

    pair = _pair;
    version = _version;
  }
}
