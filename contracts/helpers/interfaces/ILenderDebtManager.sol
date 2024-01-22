// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface ILenderDebtManager {
  function aggregator() external view returns (address);

  function getLenderFromPair(address _pair) external view returns (address);

  function requestLiquidity(uint256 _amount, address _pair) external;
}