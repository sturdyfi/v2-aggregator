// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IAggregatorV2 {
  struct LenderData {
    // Timestamp when the lender was added.
    uint256 activation;
    // The current assets the lender holds.
    uint256 currentDebt;
    // The max assets the lender can hold. 
    uint256 maxDebt;
  }

  function init(
    address _asset,
    string memory _name,
    string memory _symbol,
    uint8 decimals
  ) external;

  function setAdmin(address _admin, uint256 _adminFee) external;

  function setTreasury(address _treasury, uint256 _protocolFee) external;

  function setManager(address _manager) external;

  function setShutdown(bool isShutdown) external;

  function updateMaxDebtForLender(address lender, uint256 newMaxDebt) external;

  function setMinimumTotalIdle(uint256 _minTotalIdle) external;

  function addLender(address newLender, uint256 newMaxDebt) external;

  function updateDebt(address lender, uint256 targetDebt) external returns (uint256);

  function buyDebt(address lender, uint256 amount) external;

  function processReport(address lender) external returns (uint256, uint256);

  function asset() external view returns (address);

  function getLenderData(address lender) external view returns (LenderData memory);

  function ADMIN() external view returns (address);

  function MINIMUM_TOTAL_IDLE() external view returns (uint256);
}