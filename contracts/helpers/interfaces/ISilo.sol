// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface ISilo {
  function borrowAsset(
    uint256 _borrowAmount,
    uint256 _collateralAmount,
    address _receiver
  ) external returns (uint256 _shares);

  function asset() external view returns (address);

  function totalAsset() external view returns (uint128 amount, uint128 shares);

  function totalBorrow() external view returns (uint128 amount, uint128 shares);
}