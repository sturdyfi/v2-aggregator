// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../../helpers/interfaces/IGenericLender.sol';
import {SafeERC20} from '../../helpers/libraries/SafeERC20.sol';
import {IERC20} from '../../helpers/interfaces/IERC20.sol';
import {IERC4626} from '../../helpers/interfaces/IERC4626.sol';
import {Errors} from '../../helpers/libraries/Errors.sol';

abstract contract GenericLender is IGenericLender {
  using SafeERC20 for IERC20;

  uint256 internal constant YEAR_SEC = 31556736;

  address internal aggregator;
  IERC20 internal asset;
  string internal lenderName;

  event Cloned(address indexed clone);

  modifier onlyAggregator() {
    require(msg.sender == address(aggregator), Errors.AG_CALLER_NOT_AGGREGATOR);
    _;
  }

  constructor(address _aggregator, string memory _name) {
    _initialize(_aggregator, _name);
  }

  function initialize(address _aggregator, string memory _name) external virtual {
    _initialize(_aggregator, _name);
  }

  function POOL() external view virtual returns (address);

  function _initialize(address _aggregator, string memory _name) internal {
    require(address(aggregator) == address(0), Errors.AG_ALREADY_INITIALIZED);
    
    if (_aggregator == address(0)) return;

    aggregator = _aggregator;
    asset = IERC20(IERC4626(_aggregator).asset());
    lenderName = _name;
  }

  function _clone(address _aggregator, string memory _name) internal returns (address newLender) {
    // Copied from https://github.com/optionality/clone-factory/blob/master/contracts/CloneFactory.sol
    bytes20 addressBytes = bytes20(address(this));

    assembly {
      // EIP-1167 bytecode
      let clone_code := mload(0x40)
      mstore(clone_code, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
      mstore(add(clone_code, 0x14), addressBytes)
      mstore(
        add(clone_code, 0x28),
        0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000
      )
      newLender := create(0, clone_code, 0x37)
    }

    GenericLender(newLender).initialize(_aggregator, _name);
    emit Cloned(newLender);
  }
}
