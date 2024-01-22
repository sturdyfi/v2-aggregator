# Overview

Sturdy V2 is a lending protocol based on a novel two-tier architecture. This repository contains the codebase for the aggregation layer. You can find an overview of the protocol [here](https://docs.sturdy.finance/overview/what-is-sturdy), and a description of the specific functions below.

# Dev Environment
- Configure environment file (.env)
```
ALCHEMY_KEY="xxx"
```

- Install
```
yarn install
```

- Compile
```
yarn compile
```

- Run the hardhat node on localhost.
```
FORK=main yarn hardhat node
```

- For test, run the following task 
```
yarn test
```

# Aggregator

## User Action

### Deposit

Deposit `assets` into the vault.

- @param `assets` The amount of assets to deposit.
- @param `receiver` The address to receive the shares.
  ```
  function deposit(uint256 assets, address receiver) external;
  ```

### Mint

Mint `shares` for the receiver.

- @param `shares` The amount of shares to mint.
- @param `receiver` The address to receive the shares.
  ```
  function mint(uint256 shares, address receiver) external;
  ```

### Withdraw

Withdraw an amount of asset to `receiver` burning `owner`s shares.

- @param `assets` The amount of asset to withdraw.
- @param `receiver` The address to receive the assets.
- @param `owner` The address who's shares are being burnt.
  ```
  function withdraw(
    uint256 assets,
    address receiver,
    address owner
  ) external;
  ```

### Redeem

Redeems an amount of shares of `owners` shares sending funds to `receiver`.

- @param `shares` The amount of shares to burn.
- @param `receiver` The address to receive the assets.
- @param `owner` The address who's shares are being burnt.
  ```
  function redeem(
    uint256 shares,
    address receiver,
    address owner
  ) external;
  ```

### AssessShareOfUnrealisedLosses

Returns the share of losses that a user would take if withdrawing from this lender.
e.g. if the lender has unrealised losses for 10% of its current debt and the user wants 
  to withdraw 1000 tokens, the losses that he will take are 100 token.

- @param `lender` The address of the lender.
- @param `assetsNeeded` The amount of assets needed to be withdrawn.
- @return The share of unrealised losses that the lenderf has.

  ```
  function assessShareOfUnrealisedLosses(address lender, uint256 assetsNeeded) external view returns (uint256);
  ```

## Admin Action

### Init

Init the lp token name, symbol, decimals.

- @param `_name` The lp token name.
- @param `_symbol` The lp token symbol.
- @param `decimals` The lp token decimals.
  ```
  function init(
    string memory _name,
    string memory _symbol,
    uint8 decimals
  ) external;
  ```

### SetAdmin

Set the admin address.

- @param `_admin` The address of admin.
  ```
  function setAdmin(address _admin) external;
  ```

### SetTreasury

Set the treasury address and protocol fee value.

- @param `_treasury` The address of treasury.
- @param `_protocolFee` The address of treasury.
  ```
  function setTreasury(address _treasury, uint256 _protocolFee) external;
  ```

### SetShutdown

Set the vault operation status. If status is true, only withdraw is possible.

- @param `isShutdown` The vault status.
  ```
  function setShutdown(bool isShutdown) external;
  ```

### SetMinimumTotalIdle

Set the new minimum total idle.

- @param `minTotalIdle` The new minimum total idle.
  ```
  function setMinimumTotalIdle(uint256 minTotalIdle) external;
  ```

### UpdateMaxDebtForLender

Update the max debt for a lender.

- @param `lender` The lender to update the max debt for.
- @param `newMaxDebt` The new max debt for the lender.
  ```
  function updateMaxDebtForLender(address lender, uint256 newMaxDebt) external;
  ```

### AddLender

Add a new lender.

- @param `newLender` The new lender to add.
- @param `newMaxDebt` The new max debt for the lender.
  ```
  function addLender(address newLender, uint256 newMaxDebt) external;
  ```

### RemoveLender

Remove a new lender.

- @param `lender` The lender to remove.
- @param `force` if true, force remove with full loss
  ```
  function removeLender(address lender, bool force) external;
  ```

### UpdateDebt

Update the debt for a lender.
The vault will re-balance the debt vs target debt. Target debt must be
  smaller or equal to lender's max_debt. This function will compare the 
  current debt with the target debt and will take funds or deposit new 
  funds to the lender. 
The lender can require a maximum amount of funds that it wants to receive
  to invest. The lender can also reject freeing funds if they are locked.

- @param `lender` The lender to update debt for.
- @param `targetDebt` The target debt for the lender
- @return The amount of debt added or removed
  ```
  function updateDebt(address lender, uint256 targetDebt) external;
  ```

### BuyDebt

Used to buy bad debt from this contract.
This should only ever be used in an emergency in place
  of force removing a lender in order to not report a loss.
It allows the admin role to buy the lenders debt for an equal amount of `asset`. 
It's important to note that this does rely on the lenders `convertToShares` 
  function to determine the amount of shares to buy.

- @param `lender` The lender to buy the debt for.
- @param `amount` The amount of debt to buy from this contract.
  ```
  function buyDebt(address lender, uint256 amount) external;
  ```

### ProcessReport

Processing a report means comparing the debt that the lender has taken 
  with the current amount of funds it is reporting. If the lender owes 
  less than it currently has, it means it has had a profit, else (assets < debt) 
  it has had a loss.
Different lenders might choose different reporting lenders: pessimistic, 
  only realised P&L, ... The best way to report depends on the lender.
Any applicable fees are charged and distributed during the report as well
  to the specified recipients.

- @param `lender` The lender to process report for
  ```
  function processReport(address lender) external;
  ```

# Debt Manager

## User Action

### RemoveLender

Remove lender from list.

- @param `_lender`` The lender to manage debt.
```
function removeLender(address _lender) external;
```

## Admin Action

### AddLender

Add lender to list.

- @param `_lender` The lender to manage debt.
```
function addLender(address _lender) external;
```

### SetPairToLender

Set the lender's external pool address.

- @param `_pair` The external pool address.
- @param `_lender` The lender address to manage debt.
```
function setPairToLender(address _pair, address _lender) external;
```

### SetWhitelistedGateway

Set the whitelisted gateway.

- @param `_gateway` The Silo Gateway address.
- @param `_enabled` True if whitelisted gateway, else false.
```
function setWhitelistedGateway(address _gateway, bool _enabled) external;
```

### SetZKVerifier

Set the zero knowledge verifier address.

- @param `_verifier` The zero knowledge verifier address.
```
function setZKVerifier(address _verifier) external;
```

### ManualAllocation

Manual update the allocations.
Calculate the newAPR, curAPR and if newAPR < curAPR then it would be failed.
The `_newPositions` list should be in order of decreasing debt and increasing debt.

- @param _`newPositions` The list of position info.
```
function manualAllocation(LenderAllocation[] memory _newPositions) external;
```

## ZK Verifier Action

### ZKAllocation

Manual update the allocations from zk verifier.
ZK verifer guarantee newAPR > curAPR and it is optimal allocations as well.
The `_newPositions` list should be in order of decreasing debt and increasing debt.

- @param _`newPositions` The list of position info.
```
function zkAllocation(LenderAllocation[] memory _newPositions) external;
```

## Silo Gateway Action

### RequestLiquidity

Process the just in time liquidity.
If the sturdy silos have not enough liquidity in case of borrowing,
silos would request liquidity by reducing debts from other lenders.

- @param `_amount` The required liquidity amount.
- @param `_pair` The silo address.
```
function requestLiquidity(uint256 _amount, address _pair) external;
```

# Silo Gateway

## User Action

### BorrowAsset

Borrow asset from `_silo`.
If there is not enough liquidity in silo, it would try to make enough liquidity via aggregator.

- @param `_silo` The silo address.
- @param `_borrowAmount` The borrowing amount.
- @param `_collateralAmount` The collateral amount, if not zero, perform deposit collateral first.
- @param `_receiver` The receiver address of borrowing asset.
```
function borrowAsset(
  address _silo, 
  uint256 _borrowAmount,
  uint256 _collateralAmount,
  address _receiver
) external;
```

## Admin Action

### SetUtilizationLimit

Set the utilization limit value for the just in-time liquidity.

- @param `utilizationLimit_` The utilization limit value. 1% = 1000
```
function setUtilizationLimit(uint256 utilizationLimit_) external;
```

# Aggregator Factory

## User Action

### Create

Create the upgradable aggregator V2 contract.

- @param `_adminFee` The fee percent value for admin 1% = 100.
- @param `_protocolFee` The fee precent value for protocol 1% = 100.
- @param `_minTotalIdle` The minium asset amount that would be kept in 
                         the aggregator for enough wtihdrawal liquidity.
- @param `_proxyAdmin` The proxy contract admin address which is used to 
                       upgrade aggregator contract.
- @param `_treasury` The treasury address.
- @param `_asset` The aggregator's underlying asset address.
- @param `_name` The aggregator's lp token name.
- @param `_symbol` The aggregator's lp token symbol.
- @param `_decimals` The aggregator's lp token decimals.
```
function create(
  uint256 _adminFee,
  uint256 _protocolFee,
  uint256 _minTotalIdle,
  address _proxyAdmin,
  address _treasury,
  address _asset,
  string memory _name,
  string memory _symbol,
  uint8 _decimals
) external;
```

## Admin Action

### SetImpl

Set the implementation(logic) contract address.

- @param `impl_` The implementation contract address.
```
function setImpl(address impl_) external;
```
