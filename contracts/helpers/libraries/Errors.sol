// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

/**
 * @title Errors library
 * @author Sturdy
 * @notice Defines the error messages emitted by the different contracts of the Sturdy protocol
 * @dev Error messages prefix glossary:
 *  - AG = Aggregator
 */
library Errors {
  string internal constant AG_FEE_TOO_BIG = '1';
  string internal constant AG_CALLER_NOT_ADMIN = '2';
  string internal constant AG_CALLER_NOT_AGGREGATOR = '3';
  string internal constant AG_ALREADY_INITIALIZED = '4';
  string internal constant AG_INVALID_CONFIGURATION = '5';
  string internal constant AG_INVALID_LENDER = '6';
  string internal constant AG_INSUFFICIENT_ASSETS = '7';
  string internal constant AG_HIGHER_DEBT = '8';
  string internal constant AG_SUPPLY_LIMIT = '9';
  string internal constant AG_NOT_HIGHER_APR = '10';
  string internal constant AG_BORROW_VIA_GATEWAY_FAILED = '11';
}
