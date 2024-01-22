// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IAaveV3Lender {
  function cloneAaveV3Lender(
    address _aggregator,
    string memory _name,
    address _aToken
  ) external returns (address newLender);
}
