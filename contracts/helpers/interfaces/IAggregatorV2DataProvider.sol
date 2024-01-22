// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IAggregatorV2DataProvider {
  function addAggregator(address _aggregators) external;

  function addAggregators(address[] memory aggregators_) external;
}