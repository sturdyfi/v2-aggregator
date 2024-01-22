// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IFraxlendPairV2 {
  function currentRateInfo()
    external
    view
    returns (uint32 lastBlock, uint32 feeToProtocolRate, uint64 lastTimestamp, uint64 ratePerSec, uint64 fullUtilizationRate);
}