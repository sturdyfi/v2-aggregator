# Overview

Sturdy V2 is a lending protocol based on a novel two-tier architecture. This repository contains the codebase for the aggregation layer. You can find an overview of the protocol [here](https://docs.sturdy.finance/overview/what-is-sturdy), and a description of the specific functions below.

# Dev Environment

Configure environment file (.env)
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

### set_accountant

Set the new accountant address.
ACCOUNTANT_MANAGER can call this function.

- @param `new_accountant` The new accountant address.
  ```
  function set_accountant(address new_accountant) external;
  ```

### process_report

Process the report of a strategy.
REPORTING_MANAGER can call this function.
Processing a report means comparing the debt that the strategy has taken 
 with the current amount of funds it is reporting. If the strategy owes 
 less than it currently has, it means it has had a profit, else (assets < debt) 
 it has had a loss.

Different strategies might choose different reporting strategies: pessimistic, 
 only realised P&L, ... The best way to report depends on the strategy.

The profit will be distributed following a smooth curve over the vaults 
 profit_max_unlock_time seconds. Losses will be taken immediately, first from the 
 profit buffer (avoiding an impact in pps), then will reduce pps.

Any applicable fees are charged and distributed during the report as well
 to the specified recipients.

- @param `strategy` The strategy to process the report for.
  ```
  function process_report(address strategy) external;
  ```

### add_strategy

Add a new strategy.
ADD_STRATEGY_MANAGER can call this function.

- @param `new_strategy` The new strategy to add.
  ```
  function add_strategy(address new_strategy) external;
  ```

### revoke_strategy

Revoke a strategy.
REVOKE_STRATEGY_MANAGER can call this function.

- @param `strategy` The strategy to revoke.
  ```
  function revoke_strategy(address strategy) external;
  ```

### force_revoke_strategy

Force revoke a strategy.
FORCE_REVOKE_MANAGER can call this function.
The vault will remove the strategy and write off any debt left 
 in it as a loss. This function is a dangerous function as it can force a 
 strategy to take a loss. All possible assets should be removed from the 
 strategy first via update_debt. If a strategy is removed erroneously it 
 can be re-added and the loss will be credited as profit. Fees will apply.

- @param `strategy` The strategy to revoke.
  ```
  function force_revoke_strategy(address strategy) external;
  ```

### update_max_debt_for_strategy

Update the max debt for a strategy.
MAX_DEBT_MANAGER can call this function.

- @param `strategy` The strategy to update the max debt for.
- @param `new_max_debt` The new max debt for the strategy.
  ```
  function update_max_debt_for_strategy(address strategy, uint256 new_max_debt) external;
  ```

### update_debt

Update the debt for a strategy.
DEBT_MANAGER can call this function.
The vault will re-balance the debt vs target debt. Target debt must be
 smaller or equal to strategy's max_debt. This function will compare the 
 current debt with the target debt and will take funds or deposit new 
 funds to the strategy. 

The strategy can require a maximum amount of funds that it wants to receive
 to invest. The strategy can also reject freeing funds if they are locked.

- @param `strategy` The strategy to update the debt for.
- @param `target_debt` The target debt for the strategy.
- @return The amount of debt added or removed.
  ```
  function update_debt(address strategy, uint256 target_debt) external;
  ```

### shutdown_vault

Shutdown the vault.
EMERGENCY_MANAGER can call this function.

  ```
  function shutdown_vault() external;
  ```

# AggregatorAccountant

### updateDefaultConfig

Update the default config used for all strategies.
Only FeeManager can call this function.

- @param `_defaultManagement` Default annual management fee to charge.
- @param `_defaultPerformance` Default performance fee to charge.
- @param `_defaultRefund` Default refund ratio to give back on losses.
- @param `_defaultMax` Default max fee to allow as a percent of gain.
  ```
  function updateDefaultConfig(
      uint16 _defaultManagement,
      uint16 _defaultPerformance,
      uint16 _defaultRefund,
      uint16 _defaultMax
  ) external;
  ```
