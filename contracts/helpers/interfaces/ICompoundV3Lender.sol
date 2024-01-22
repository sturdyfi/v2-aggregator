// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface ICompoundV3Lender {
  function cloneCompoundV3Lender(
    address _aggregator,
    string memory _name,
    address _cToken
  ) external returns (address newLender);
}
