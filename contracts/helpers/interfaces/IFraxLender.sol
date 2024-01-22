// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IFraxLender {
  function cloneFraxLender(
    address _aggregator,
    string memory _name,
    address _pair,
    uint256 _version
  ) external returns (address newLender);
}
