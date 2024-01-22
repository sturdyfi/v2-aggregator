// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IRateCalculator {
  function getNewRate(
    bytes calldata _data,
    bytes calldata _initData
  ) external pure returns (uint64 _newRatePerSec);
}