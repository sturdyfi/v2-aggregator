// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IFraxlendPair {
  function currentRateInfo()
    external
    view
    returns (uint64 lastBlock, uint64 feeToProtocolRate, uint64 lastTimestamp, uint64 ratePerSec);

  function totalAsset() external view returns (uint128 amount, uint128 shares);

  function totalBorrow() external view returns (uint128 amount, uint128 shares);

  function paused() external view returns (bool);

  function maturityDate() external view returns (uint256);

  function penaltyRate() external view returns (uint256);

  function rateContract() external view returns (address);

  function rateInitCallData() external view returns (bytes calldata);

  function toAssetShares(uint256 _amount, bool _roundUp) external view returns (uint256);

  function toAssetAmount(uint256 _shares, bool _roundUp) external view returns (uint256);

  function getConstants()
    external
    pure
    returns (
      uint256 _LTV_PRECISION,
      uint256 _LIQ_PRECISION,
      uint256 _UTIL_PREC,
      uint256 _FEE_PRECISION,
      uint256 _EXCHANGE_PRECISION,
      uint64 _DEFAULT_INT,
      uint16 _DEFAULT_PROTOCOL_FEE,
      uint256 _MAX_PROTOCOL_FEE
    );

  function deposit(uint256 _amount, address _receiver) external returns (uint256 _sharesReceived);

  function redeem(
    uint256 _shares,
    address _receiver,
    address _owner
  ) external returns (uint256 _amountToReturn);
}