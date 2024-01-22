// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {ILenderDebtManager} from '../helpers/interfaces/ILenderDebtManager.sol';
import {IAggregatorV2} from '../helpers/interfaces/IAggregatorV2.sol';
import {IERC20} from '../helpers/interfaces/IERC20.sol';
import {ISilo} from '../helpers/interfaces/ISilo.sol';
import {Errors} from '../helpers/libraries/Errors.sol';
import {ReentrancyGuard} from '../helpers/dependencies/ReentrancyGuard.sol';

contract SiloGateway is ReentrancyGuard {
  uint256 private constant UTIL_PREC = 1e5;

  // LenderDebtManager address
  ILenderDebtManager public immutable manager;
  // Aggregator address
  IAggregatorV2 public immutable aggregator;
  // Aggregator's asset which is lending or borrowing
  address public immutable asset;

  // In case of borrow, the silo's utilization limit value for the just in-time liquidity.
  uint256 private _utilizationLimit;

  modifier onlyAdmin() {
    require(msg.sender == aggregator.ADMIN(), Errors.AG_CALLER_NOT_ADMIN);
    _;
  }

  constructor(ILenderDebtManager _manager, uint256 utilizationLimit_) {
    manager = _manager;
    aggregator = IAggregatorV2(_manager.aggregator());
    asset = aggregator.asset();
    _utilizationLimit = utilizationLimit_;
  }

  /**
   * @dev Set the utilization limit value for the just in-time liquidity.
   * - Caller is Admin
   * @param utilizationLimit_ The utilization limit value. 1% = 1000
   */
  function setUtilizationLimit(uint256 utilizationLimit_) external payable onlyAdmin {
    _utilizationLimit = utilizationLimit_;
  }

  /**
   * @dev Borrow asset from `_silo`
   *      If there is not enough liquidity in silo, it would try to make enough liquidity via aggregator.
   * - Caller is anyone
   * @param _silo The silo address.
   * @param _borrowAmount The borrowing amount
   * @param _collateralAmount The collateral amount, if not zero, perform deposit collateral first.
   * @param _receiver The receiver address of borrowing asset.
   */
  function borrowAsset(
    address _silo, 
    uint256 _borrowAmount,
    uint256 _collateralAmount,
    address _receiver
  ) external nonReentrant {
    (uint256 totalAsset, ) = ISilo(_silo).totalAsset();
    (uint256 totalBorrow, ) = ISilo(_silo).totalBorrow();
    uint256 numerator = UTIL_PREC * (totalBorrow + _borrowAmount);
    uint256 utilizationRate = numerator / totalAsset;
    uint256 utilizationLimit = _utilizationLimit;

    require(utilizationRate <= UTIL_PREC, Errors.AG_INVALID_CONFIGURATION);
    require(address(asset) == ISilo(_silo).asset(), Errors.AG_INVALID_CONFIGURATION);
    require(manager.getLenderFromPair(_silo) != address(0), Errors.AG_INVALID_CONFIGURATION);

    // Just in-time liquidity
    if (utilizationRate > utilizationLimit) {
      uint256 requiredAmount = (numerator / utilizationLimit) - totalAsset;
      manager.requestLiquidity(requiredAmount, _silo);
    }

    // TODO: This part would be updated after sturdy silo v2 is completed
    // Temporarily it is implemented for FraxLend Pair
    {
      if (_collateralAmount > 0) {
        address CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
        IERC20(CRV).transferFrom(msg.sender, address(this), _collateralAmount);
        IERC20(CRV).approve(_silo, _collateralAmount);
      }
      ISilo(_silo).borrowAsset(_borrowAmount, _collateralAmount, _receiver);
    }
  }

  /**
   * @dev Get the utilization limit value
   * @return the utilization limit value
   */
  function getUtilizationLimit() external view returns (uint256) {
    return _utilizationLimit;
  }
}
