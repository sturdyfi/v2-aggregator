// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IGenericLender {
  function name() external view returns (string memory);

  function ASSET() external view returns (address);

  function POOL() external view returns (address);

  function totalAssets() external view returns (uint256);

  function AGGREGATOR() external view returns (address);

  function apr() external view returns (uint256);

  function aprAfterDebtChange(uint256 amount, bool increased) external view returns (uint256);

  function convertToAssets(uint256 shares) external view returns (uint256);

  function convertToShares(uint256 assets) external view returns (uint256);

  function balanceOf(address owner) external view returns (uint256);

  function maxDeposit(address receiver) external view returns (uint256);

  function maxWithdraw(address owner) external view returns (uint256);

  function previewWithdraw(uint256 assets) external view returns (uint256);

  function withdraw(
    uint256 amount,
    address receiver,
    address owner
  ) external returns (uint256);

  function redeem(
    uint256 shares,
    address receiver,
    address owner
  ) external returns (uint256);

  function deposit(
    uint256 assets,
    address receiver
  ) external returns (uint256);

  function transferShares(address to, uint256 shares) external;
}
