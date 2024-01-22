// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IAggregatorV2} from '../helpers/interfaces/IAggregatorV2.sol';
import {IERC20} from '../helpers/interfaces/IERC20.sol';
import {IERC4626} from '../helpers/interfaces/IERC4626.sol';
import {IGenericLender} from '../helpers/interfaces/IGenericLender.sol';
import {Errors} from '../helpers/libraries/Errors.sol';

contract LenderDebtManager {
  IAggregatorV2 public immutable aggregator;
  IERC20 public immutable asset;

  struct LenderAllocation {
    address lender;
    uint256 debt;
  }

  address private _zkVerifier;
  address[] private _lenders;
  // pair -> lender
  mapping(address => address) private _pairToLender;
  // gateway -> bool
  mapping(address => bool) private _whitelistedGateway;

  modifier onlyAdmin() {
    require(msg.sender == aggregator.ADMIN(), Errors.AG_CALLER_NOT_ADMIN);
    _;
  }

  constructor(IAggregatorV2 _aggregator) {
    aggregator = _aggregator;
    asset = IERC20(_aggregator.asset());
  }

  /**
   * @dev Add lender to list.
   * - Caller is Admin
   * @param _lender The lender to manage debt.
   */
  function addLender(address _lender) external payable onlyAdmin {
    require(aggregator.getLenderData(_lender).activation != 0, Errors.AG_INVALID_CONFIGURATION);

    uint256 lenderCount = _lenders.length;
    for (uint256 i; i < lenderCount; ++i) {
      if (_lenders[i] == _lender) return;
    }

    _lenders.push(_lender);
    _pairToLender[IGenericLender(_lender).POOL()] = _lender;
  }

  /**
   * @dev Remove lender from list.
   * - Caller is Anyone
   * @param _lender The lender to manage debt.
   */
  function removeLender(address _lender) external {
    if (aggregator.getLenderData(_lender).activation != 0) {
      require(msg.sender == aggregator.ADMIN(), Errors.AG_CALLER_NOT_ADMIN);
    }

    uint256 lenderCount = _lenders.length;
    for (uint256 i; i < lenderCount; ++i) {
      if (_lenders[i] == _lender) {
        // if not last element
        if (i != lenderCount - 1) {
          _lenders[i] = _lenders[lenderCount - 1];
        }
        _lenders.pop();
        delete _pairToLender[IGenericLender(_lender).POOL()];

        return;
      }
    }
  }

  /**
   * @dev Set the lender's external pool address.
   * - Caller is Admin
   * @param _pair The external pool address.
   * @param _lender The lender address to manage debt.
   */
  function setPairToLender(address _pair, address _lender) external payable onlyAdmin {
    _pairToLender[_pair] = _lender;
  }

  /**
   * @dev Set the whitelisted gateway.
   * - Caller is Admin
   * @param _gateway The Silo Gateway address.
   * @param _enabled True if whitelisted gateway, else false.
   */
  function setWhitelistedGateway(address _gateway, bool _enabled) external payable onlyAdmin {
    _whitelistedGateway[_gateway] = _enabled;
  }

  /**
   * @dev Set the zero knowledge verifier address.
   * - Caller is Admin
   * @param _verifier The zero knowledge verifier address.
   */
  function setZKVerifier(address _verifier) external payable onlyAdmin {
    _zkVerifier = _verifier;
  }

  /**
   * @dev Manual update the allocations.
   *      Calculate the newAPR, curAPR and if newAPR < curAPR then it would be failed.
   *      The `_newPositions` list should be in order of decreasing debt and increasing debt.
   * - Caller is Admin
   * @param _newPositions The list of position info
   */
  function manualAllocation(LenderAllocation[] memory _newPositions) external payable onlyAdmin {
    _manualAllocation(_newPositions);
  }

  /**
   * @dev Manual update the allocations from zk verifier.
   *      ZK verifer guarantee newAPR > curAPR and it is optimal allocations as well.
   *      The `_newPositions` list should be in order of decreasing debt and increasing debt.
   * - Caller is ZKVerifier
   * @param _newPositions The list of position info
   */
  function zkAllocation(LenderAllocation[] memory _newPositions) external payable {
    require(msg.sender == _zkVerifier, Errors.AG_INVALID_CONFIGURATION);
    require(_lenders.length == _newPositions.length, Errors.AG_INVALID_CONFIGURATION);

    _manualAllocation(_newPositions);
  }

   /**
   * @dev Process the just in time liquidity.
   *      If the sturdy silos have not enough liquidity in case of borrowing,
   *      silos would request liquidity by reducing debts from other lenders.
   * - Caller is Silo Gateways
   * @param _amount The required liquidity amount.
   * @param _pair The silo address.
   */
  function requestLiquidity(uint256 _amount, address _pair) external payable {
    // only whitelisted gateways can request liquidity in case of borrow.
    address requestingLender = _pairToLender[_pair];
    require(requestingLender != address(0), Errors.AG_INVALID_CONFIGURATION);
    require(_whitelistedGateway[msg.sender], Errors.AG_INVALID_CONFIGURATION);

    // update state of requesting lender and check the supply cap
    aggregator.processReport(requestingLender);
    IAggregatorV2.LenderData memory requestingLenderData = aggregator.getLenderData(requestingLender);
    require (requestingLenderData.maxDebt == 0 || requestingLenderData.currentDebt + _amount < requestingLenderData.maxDebt - 1, Errors.AG_SUPPLY_LIMIT);
    

    address[] memory lenders = _lenders;
    uint256 totalIdle = asset.balanceOf(address(aggregator));
    uint256 minIdle = aggregator.MINIMUM_TOTAL_IDLE();
    uint256 requiredAmount = _amount + minIdle;
    uint256 lenderCount = lenders.length;

    if (requiredAmount > totalIdle) {
      unchecked {
        requiredAmount -= totalIdle;
      }
    }

    // sort based on apr
    for (uint256 i; i < lenderCount - 1; ++i) {
      for (uint256 j = i + 1; j < lenderCount; ++j) {
        if (IGenericLender(lenders[i]).apr() > IGenericLender(lenders[j]).apr()) {
          address temp = lenders[i];
          lenders[i] = lenders[j];
          lenders[j] = temp;
        }
      }
    }
    
    // withdraw from other lenders to fill the required amount
    for (uint256 i; i < lenderCount; ++i) {
      IAggregatorV2.LenderData memory lenderData = aggregator.getLenderData(lenders[i]);

      if (lenders[i] == requestingLender) continue;

      aggregator.processReport(lenders[i]);
      
      uint256 newDebt;
      uint256 withdrawAmount;
      if (lenderData.currentDebt >= requiredAmount) {
        unchecked {
          newDebt = lenderData.currentDebt - requiredAmount; 
        }
      }

      newDebt = aggregator.updateDebt(lenders[i], newDebt);
      unchecked {
        withdrawAmount = lenderData.currentDebt - newDebt;
      }

      if (withdrawAmount < requiredAmount) {
        unchecked {
          requiredAmount -= withdrawAmount;
        }
      } else {
        requiredAmount = 0;
        break;
      }
    }

    require(requiredAmount == 0, Errors.AG_INVALID_CONFIGURATION);

    // update debt of msg.sender to fill the missing liquidity
    aggregator.updateDebt(requestingLender, requestingLenderData.currentDebt + _amount);
  }

  /**
   * @dev Get the full array of lenders.
   * @return the full array of lenders.
   */
  function getLenders() external view returns (address[] memory) {
    return _lenders;
  }

  /**
   * @dev Get the lender address of external pool.
   * @return the lender address of external pool.
   */
  function getLenderFromPair(address _pair) external view returns (address) {
    return _pairToLender[_pair];
  }

  /**
   * @dev Get the status of gateway
   * @return True if whitelisted gateway, else false.
   */
  function gatewayWhitelisted(address _gateway) external view returns (bool) {
    return _whitelistedGateway[_gateway];
  }

  /**
   * @dev Get the verifier address.
   * @return the verifier address.
   */
  function getZKVerifier() external view returns (address) {
    return _zkVerifier;
  }

  function _manualAllocation(LenderAllocation[] memory _newPositions) internal {
    uint256 lenderLength = _newPositions.length;

    for (uint256 i; i < lenderLength; ++i) {
      LenderAllocation memory position = _newPositions[i];
      aggregator.processReport(position.lender);

      IAggregatorV2.LenderData memory lenderData = aggregator.getLenderData(position.lender);
      require(lenderData.activation != 0, Errors.AG_INVALID_CONFIGURATION);
      require(lenderData.maxDebt == 0 || position.debt <= lenderData.maxDebt, Errors.AG_INVALID_CONFIGURATION);

      if (lenderData.currentDebt == position.debt) continue;

      // update debt.
      aggregator.updateDebt(position.lender, position.debt);
    }
  }
}
