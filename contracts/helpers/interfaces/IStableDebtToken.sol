// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IStableDebtToken {
  /**
   * @notice Returns the average rate of all the stable rate loans.
   * @return The average stable rate
   */
  function getAverageStableRate() external view returns (uint256);
}