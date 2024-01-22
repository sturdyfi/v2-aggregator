// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IFraxlendPairV3 {
  function isInterestPaused() external view returns (bool);

  function toAssetAmount(uint256 _shares, bool _roundUp, bool _previewInterest) external view returns (uint256);

  function toAssetShares(uint256 _amount, bool _roundUp, bool _previewInterest) external view returns (uint256);

  function getConstants()
    external
    pure
    returns (
        uint256 _LTV_PRECISION,
        uint256 _LIQ_PRECISION,
        uint256 _UTIL_PREC,
        uint256 _FEE_PRECISION,
        uint256 _EXCHANGE_PRECISION,
        uint256 _DEVIATION_PRECISION,
        uint256 _RATE_PRECISION,
        uint256 _MAX_PROTOCOL_FEE
    );
}