// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {Errors} from '../helpers/libraries/Errors.sol';
import {Ownable} from '../helpers/dependencies/Ownable.sol';
import {InitializableImmutableAdminUpgradeabilityProxy} from '../helpers/dependencies/InitializableImmutableAdminUpgradeabilityProxy.sol';
import {IAggregatorV2} from '../helpers/interfaces/IAggregatorV2.sol';
import {IAggregatorV2DataProvider} from '../helpers/interfaces/IAggregatorV2DataProvider.sol';
import {IGenericLender} from '../helpers/interfaces/IGenericLender.sol';
import {IFraxLender} from '../helpers/interfaces/IFraxLender.sol';
import {IAaveV3Lender} from '../helpers/interfaces/IAaveV3Lender.sol';
import {ICompoundV3Lender} from '../helpers/interfaces/ICompoundV3Lender.sol';

contract AggregatorV2Factory is Ownable {
  struct SiloData {
    // The lender type: 1 -> FraxLend, 2 -> AaveV3, 3 -> CompoundV3.
    uint8 lenderType;
    // The cloning lender address.
    address lender;
    // The Fraxlend pair's version number, the others are 0.
    uint256 version;
  }

  address private _impl;
  address private _dataProvider;

  event AggregratorCreated(address indexed newAggregator);

  constructor(address impl_, address dataProvider_) {
    _impl = impl_;
    _dataProvider = dataProvider_;
  }

  /**
   * @dev Create the upgradable aggregator V2 contract
   * - Caller is anyone
   * @param _adminFee The fee percent value for admin. 1% = 100
   * @param _protocolFee The fee precent value for protocol. 1% = 100
   * @param _minTotalIdle The minium asset amount that would be kept in 
                          the aggregator for enough wtihdrawal liquidity
   * @param _proxyAdmin The proxy contract admin address which is used to 
                        upgrade aggregator contract
   * @param _treasury The treasury address
   * @param _asset The aggregator's underlying asset address
   * @param _name The aggregator's lp token name
   * @param _symbol The aggregator's lp token symbol
   * @param _decimals The aggregator's lp token decimals
   */
  function create(
    uint256 _adminFee,
    uint256 _protocolFee,
    uint256 _minTotalIdle,
    address _proxyAdmin,
    address _treasury,
    address _asset,
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    SiloData[] memory _silos
  ) external {
    bytes memory params = abi.encodeWithSignature('initialize(address)', address(this));
    InitializableImmutableAdminUpgradeabilityProxy proxy = new InitializableImmutableAdminUpgradeabilityProxy(_proxyAdmin);
    proxy.initialize(_impl, params);

    // newAggregator init
    IAggregatorV2 newAggregator = IAggregatorV2(address(proxy));
    newAggregator.init(_asset, _name, _symbol, _decimals);
    newAggregator.setTreasury(_treasury, _protocolFee);
    newAggregator.setMinimumTotalIdle(_minTotalIdle);

    // Add silos
    _addSilos(newAggregator, _silos);

    // Register aggregator
    IAggregatorV2DataProvider(_dataProvider).addAggregator(address(newAggregator));

    // Set Admin
    newAggregator.setAdmin(msg.sender, _adminFee);

    emit AggregratorCreated(address(newAggregator));
  }

  /**
   * @dev Set the implementation(logic) contract address
   * - Caller is owner
   * @param impl_ The implementation contract address
   */
  function setImpl(address impl_) external payable onlyOwner {
    require(impl_ != address(0), Errors.AG_INVALID_CONFIGURATION);

    _impl = impl_;
  }

  /**
   * @dev Get the implementation(logic) contract address
   * @return the implementation contract address
   */
  function getImpl() external view returns (address) {
    return _impl;
  }

  /**
   * @dev Set the protocol data provider contract address
   * - Caller is owner
   * @param dataProvider_ The data provider contract address
   */
  function setDataProvider(address dataProvider_) external payable onlyOwner {
    require(dataProvider_ != address(0), Errors.AG_INVALID_CONFIGURATION);

    _dataProvider = dataProvider_;
  }

  /**
   * @dev Get the protocol data provider contract address
   * @return the data provider contract address
   */
  function getDataProvider() external view returns (address) {
    return _dataProvider;
  }

  function _addSilos(IAggregatorV2 newAggregator, SiloData[] memory _silos) internal {
    uint256 siloLength = _silos.length;
    for (uint256 i; i < siloLength; ++i) {
      address newLender;
      SiloData memory silo = _silos[i];

      if (silo.lenderType == 1) {
        // Fraxlend
        newLender = IFraxLender(silo.lender).cloneFraxLender(
          address(newAggregator), 
          IGenericLender(silo.lender).name(), 
          IGenericLender(silo.lender).POOL(), 
          silo.version
        );
      } else if (silo.lenderType == 2) {
        // Aave V3
        newLender = IAaveV3Lender(silo.lender).cloneAaveV3Lender(
          address(newAggregator), 
          IGenericLender(silo.lender).name(), 
          IGenericLender(silo.lender).POOL()
        );
      } else if (silo.lenderType == 3) {
        // Compound V3
        newLender = ICompoundV3Lender(silo.lender).cloneCompoundV3Lender(
          address(newAggregator), 
          IGenericLender(silo.lender).name(), 
          IGenericLender(silo.lender).POOL()
        );
      } else {
        require(false, Errors.AG_INVALID_CONFIGURATION);
      }

      newAggregator.addLender(newLender, 0);
    }
  }
}
