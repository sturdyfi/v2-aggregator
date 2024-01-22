// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {Errors} from '../helpers/libraries/Errors.sol';
import {Ownable} from '../helpers/dependencies/Ownable.sol';

contract AggregatorV2DataProvider is Ownable {
  // aggregator addresses
  address[] private _aggregators;
  // aggregator factory address
  address private _factory;

  modifier onlyAdmin() {
    require(msg.sender == owner() || msg.sender == _factory, Errors.AG_CALLER_NOT_ADMIN);
    _;
  }

  /**
   * @dev Add new aggregator to list
   * - Caller is owner or factory
   * @param _aggregator The new aggregator address
   */
  function addAggregator(address _aggregator) external payable onlyAdmin {
    _aggregators.push(_aggregator);    
  }

  /**
   * @dev Add multiple new aggregators to list
   * - Caller is owner or factory
   * @param aggregators_ The new aggregator addresses
   */
  function addAggregators(address[] memory aggregators_) external payable onlyAdmin {
    uint256 count = aggregators_.length;
    for (uint256 i; i < count; ++i) {
      _aggregators.push(aggregators_[i]);
    }
  }

  /**
   * @dev Set aggregator factory contract address
   * - Caller is owner
   * @param factory_ The factory contract address
   */
  function setFactory(address factory_) external payable onlyOwner {
    _factory = factory_;
  }

  /**
   * @dev Get the factory contract address
   * @return the factory contract address
   */
  function getFactory() external view returns (address) {
    return _factory;
  }

  /**
   * @dev Get the all registered aggregator list
   * @return the list of aggregators
   */
  function getAggregators() external view returns (address[] memory) {
    return _aggregators;
  }

  /// TODO: Get Protocol Data functions
}
