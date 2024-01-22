// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IRateCalculatorV2 {
  function getNewRate(uint256 _deltaTime, uint256 _utilization, uint64 _maxInterest)
    external
    view
    returns (uint64 _newRatePerSec, uint64 _newMaxInterest);
}