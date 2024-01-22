// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface ICometMain {
  struct UserBasic {
    int104 principal;
    uint64 baseTrackingIndex;
    uint64 baseTrackingAccrued;
    uint16 assetsIn;
    uint8 _reserved;
  }

  function getUtilization() external view returns (uint256);

  function getSupplyRate(uint256 utilization) external view returns (uint64);

  function totalSupply() external view returns (uint256);

  function totalBorrow() external view returns (uint256);

  function isSupplyPaused() external view returns (bool);

  function isWithdrawPaused() external view returns (bool);

  function userBasic(address user) external view returns (UserBasic memory);

  function supply(address asset, uint256 amount) external;

  function withdrawTo(address to, address asset, uint amount) external;
}