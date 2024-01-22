// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {SturdyERC4626} from '../helpers/tokens/SturdyERC4626.sol';
import {SturdyERC20} from '../helpers/tokens/SturdyERC20.sol';
import {Errors} from '../helpers/libraries/Errors.sol';
import {IERC20} from '../helpers/interfaces/IERC20.sol';
import {IGenericLender} from '../helpers/interfaces/IGenericLender.sol';
import {IAggregatorV2} from '../helpers/interfaces/IAggregatorV2.sol';
import {SafeERC20} from '../helpers/libraries/SafeERC20.sol';
import {IERC20Detailed} from '../helpers/interfaces/IERC20Detailed.sol';
import {VersionedInitializable} from '../helpers/dependencies/VersionedInitializable.sol';
import {ReentrancyGuard} from '../helpers/dependencies/ReentrancyGuard.sol';
import {Math} from '../helpers/libraries/Math.sol';
import {PercentageMath} from '../helpers/libraries/PercentageMath.sol';

contract AggregatorV2 is VersionedInitializable, SturdyERC4626, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;
  using Math for uint256;

  uint256 private constant REVISION = 0x1;

  address internal admin;
  address internal treasury;
  address internal manager;

  uint256 internal adminFee;
  uint256 internal protocolFee;

  // lender -> LenderData;
  mapping(address => IAggregatorV2.LenderData) internal lenderDatas;
  address[] internal lenders;
  
  // Total amount of assets that has been deposited in lenders.
  uint256 internal totalDebt;
  // Minimum amount of assets that should be kept in this contract to allow for fast, cheap redeems.
  uint256 internal minimumTotalIdle;
  // State of the vault - if set to true, only withdrawals will be available. It can't be reverted.
  bool internal shutdown;

  event UpdatedAdmin(address admin);
  event UpdatedManager(address manager);
  event Shutdown(bool isShutdown);
  event DebtUpdated(address indexed lender, uint256 currentDebt, uint256 newDebt);
  event DebtPurchased(address indexed lender, uint256 amount);

  modifier onlyAdmin() {
    require(msg.sender == manager || msg.sender == admin, Errors.AG_CALLER_NOT_ADMIN);
    _;
  }

  constructor(IERC20Detailed asset_) SturdyERC4626(asset_) SturdyERC20('', '', 18) {}

  /**
   * @dev Function is invoked by the proxy contract when this contract is deployed.
   * - Caller is initializer (AggregatorV2Factory)
   * @param _admin The address of the admin
   **/
  function initialize(address _admin) external initializer {
    admin = _admin;
  }

  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }

  /**
   * @dev init the asset and lptoken name, symbol
   * - Caller is Admin
   * @param _asset - The underlying asset address
   * @param _name - The lptoken name
   * @param _symbol - The lptoken symbol
   * @param decimals The lp token decimals
   */
  function init(
    address _asset,
    string memory _name,
    string memory _symbol,
    uint8 decimals
  ) external payable onlyAdmin {
    _setAsset(IERC20Detailed(_asset));
    _setName(_name);
    _setSymbol(_symbol);
    _setDecimals(decimals);
  }

  /**
   * @dev Set the admin address and fee value.
   * - Caller is Admin
   * @param _admin The address of admin.
   * @param _adminFee The fee value of admin.
   */
  function setAdmin(address _admin, uint256 _adminFee) external payable onlyAdmin {
    require(_admin != address(0), Errors.AG_INVALID_CONFIGURATION);
    require(_adminFee < PercentageMath.PERCENTAGE_FACTOR, Errors.AG_FEE_TOO_BIG);
    
    admin = _admin;
    adminFee = _adminFee;

    emit UpdatedAdmin(_admin);
  }

  /**
   * @dev Set the treasury address and protocol fee value.
   * - Caller is Admin
   * @param _treasury The address of treasury.
   * @param _protocolFee The fee value of protocol.
   */
  function setTreasury(address _treasury, uint256 _protocolFee) external payable onlyAdmin {
    require(_treasury != address(0), Errors.AG_INVALID_CONFIGURATION);
    require(_protocolFee < PercentageMath.PERCENTAGE_FACTOR, Errors.AG_FEE_TOO_BIG);

    treasury = _treasury;
    protocolFee = _protocolFee;
  }

  /**
   * @dev Set the debt manager contract address.
   * - Caller is Admin
   * @param _manager The address of debt manager contract.
   */
  function setManager(address _manager) external payable onlyAdmin {
    require(_manager != address(0), Errors.AG_INVALID_CONFIGURATION);
    
    manager = _manager;

    emit UpdatedManager(_manager);
  }

  /**
   * @dev Set the vault operation status. If status is true, only withdraw is possible.
   * - Caller is Admin
   * @param isShutdown The vault status.
   */
  function setShutdown(bool isShutdown) external payable onlyAdmin {
    require(shutdown != isShutdown, Errors.AG_INVALID_CONFIGURATION);

    shutdown = isShutdown;
    emit Shutdown(isShutdown);
  }

  /**
   * @dev Set the new minimum total idle.
   * - Caller is Admin
   * @param _minTotalIdle The new minimum total idle.
   */
  function setMinimumTotalIdle(uint256 _minTotalIdle) external payable onlyAdmin {
    minimumTotalIdle = _minTotalIdle;
  }

  /**
   * @dev Update the max debt for a lender.
   * - Caller is Admin
   * @param lender The lender to update the max debt for.
   * @param newMaxDebt The new max debt for the lender.
   */
  function updateMaxDebtForLender(address lender, uint256 newMaxDebt) external payable onlyAdmin {
    require(lenderDatas[lender].activation != 0, Errors.AG_INVALID_CONFIGURATION);

    lenderDatas[lender].maxDebt = newMaxDebt;
  }

  /**
   * @dev Get the admin address.
   * @return the address of admin.
   */
  function ADMIN() external view returns (address) {
    return admin;
  }

  /**
   * @dev Get the treasury address.
   * @return the address of treasury.
   */
  function TREASURY() external view returns (address) {
    return treasury;
  }

  /**
   * @dev Get the admin address.
   * @return the address of admin.
   */
  function MANAGER() external view returns (address) {
    return manager;
  }

  /**
   * @dev Get the fee of admin. 1% = 1_00, admin will own the fee.
   * @return the fee of admin.
   */
  function ADMIN_FEE() external view returns (uint256) {
    return adminFee;
  }

  /**
   * @dev Get the fee of protocol. 1% = 1_00, treasury will own the fee.
   * @return the fee of protocol.
   */
  function PROTOCOL_FEE() external view returns (uint256) {
    return protocolFee;
  }

  /**
   * @dev Get total amount of assets that has been deposited in lenders.
   * @return the current total debt amount based on last processReport().
   */
  function TOTAL_DEBT() external view returns (uint256) {
    return totalDebt;
  }

  /**
   * @dev Get minimum amount of assets that should be kept in this contract 
   *      to allow for fast, cheap redeems.
   * @return the minimum amount of assets that should be kept in this contract.
   */
  function MINIMUM_TOTAL_IDLE() external view returns (uint256) {
    return minimumTotalIdle;
  }

  /**
   * @dev Get the array of lender addresses.
   * @return the array of lender addresses.
   */
  function getLenders() external view returns (address[] memory) {
    uint256 lenderCount = lenders.length;
    address[] memory _activeLenders = new address[](lenderCount);

    for (uint256 i; i < lenderCount; ++i) {
      _activeLenders[i] = lenders[i];
    }
    return _activeLenders;
  }

  /**
   * @dev Get the data of lender.
   * @param lender The lender address.
   * @return the data of lender.
   */
  function getLenderData(address lender) external view returns (IAggregatorV2.LenderData memory) {
    return lenderDatas[lender];
  }

  /**
   * @dev check the status
   *      if set to true, only withdrawals will be available. It can't be reverted.
   */
  function isShutdown() external view returns (bool) {
    return shutdown;
  }

  /**
   * @dev Add a new lender.
   * - Caller is Admin
   * @param newLender The new lender to add.
   * @param newMaxDebt The new max debt for the lender.
   */
  function addLender(address newLender, uint256 newMaxDebt) external payable onlyAdmin {
    require(newLender != address(0), Errors.AG_INVALID_CONFIGURATION);
    require(IGenericLender(newLender).ASSET() == address(_asset), Errors.AG_INVALID_CONFIGURATION);
    require(lenderDatas[newLender].activation == 0, Errors.AG_INVALID_CONFIGURATION);

    uint256 lenderCount = lenders.length;
    for (uint256 i; i < lenderCount; ++i) {
      require(newLender != lenders[i], Errors.AG_INVALID_CONFIGURATION);
    }

    lenders.push(newLender);
    lenderDatas[newLender] = IAggregatorV2.LenderData(
      block.timestamp,
      0,
      newMaxDebt
    );
  }

  /**
   * @dev Remove a new lender.
   * - Caller is Admin
   * @param lender The lender to remove.
   * @param force if true, force remove with full loss
   */
  function removeLender(address lender, bool force) external payable onlyAdmin {
    require(lenderDatas[lender].activation != 0, Errors.AG_INVALID_CONFIGURATION);

    // If force remove a lender, it will cause a loss.
    uint256 loss;
    uint256 currentDebt = lenderDatas[lender].currentDebt;
    if (currentDebt != 0) {
      require(force, Errors.AG_INVALID_CONFIGURATION);
      // realizes the full loss of outstanding debt.
      loss = currentDebt;
      totalDebt -= loss;
    }

    // Set lender params all back to 0 (WARNING: it can be readded).
    delete lenderDatas[lender];

    uint256 lenderCount = lenders.length;
    for (uint256 i; i < lenderCount; ++i) {
      if (lender == lenders[i]) {
        if (i != lenderCount - 1) {
          lenders[i] = lenders[lenderCount - 1];
        }

        lenders.pop();
        return;
      }
    }

    require(false, Errors.AG_INVALID_CONFIGURATION);
  }

  /**
   * @dev Update the debt for a lender.
   *      The vault will re-balance the debt vs target debt. Target debt must be
   *      smaller or equal to lender's max_debt. This function will compare the 
   *      current debt with the target debt and will take funds or deposit new 
   *      funds to the lender. 
   *      The lender can require a maximum amount of funds that it wants to receive
   *      to invest. The lender can also reject freeing funds if they are locked.
   * - Caller is Admin
   * @param lender The lender to update debt for.
   * @param targetDebt The target debt for the lender
   * @return The amount of debt added or removed
   */
  function updateDebt(address lender, uint256 targetDebt) external payable nonReentrant onlyAdmin returns (uint256) {
    IERC20 asset = IERC20(_asset);

    // How much we want the lender to have.
    uint256 newDebt = targetDebt;
    
    // How much the lender currently has.
    uint256 currentDebt = lenderDatas[lender].currentDebt;

    // If shutdown we can only pull funds.
    if (shutdown) newDebt = 0;

    require(newDebt != currentDebt, Errors.AG_INVALID_CONFIGURATION);

    if (currentDebt > newDebt) {
      // Reduce debt.
      uint256 assetsToWithdraw;
      unchecked { 
        assetsToWithdraw = currentDebt - newDebt;
      }

      // Ensure we always have minimumTotalIdle when updating debt.
      uint256 minTotalIdle = minimumTotalIdle;
      uint256 totalIdle = asset.balanceOf(address(this));

      // Respect minimum total idle in this contract
      if (totalIdle + assetsToWithdraw < minTotalIdle) {
        unchecked {
          assetsToWithdraw = minTotalIdle - totalIdle; 
        }

        if (assetsToWithdraw > currentDebt) assetsToWithdraw = currentDebt;
      }

      // Check how much we are able to withdraw.
      uint256 withdrawable = IGenericLender(lender).maxWithdraw(address(this));
      require (withdrawable != 0, Errors.AG_INVALID_CONFIGURATION);

      // If insufficient withdrawable, withdraw what we can.
      if (withdrawable < assetsToWithdraw) assetsToWithdraw = withdrawable;

      // If there are unrealised losses we don't let the vault reduce its debt until there is a new report
      require (_assessShareOfUnrealisedLosses(lender, assetsToWithdraw) == 0, Errors.AG_INVALID_CONFIGURATION);
      
      // Always check the actual amount withdrawn.
      uint256 preBalance = asset.balanceOf(address(this));
      IGenericLender(lender).withdraw(assetsToWithdraw, address(this), address(this));
      uint256 postBalance = asset.balanceOf(address(this));
      
      /// making sure we are changing according to the real result no matter what. 
      /// This will spend more gas but makes it more robust. Also prevents issues
      /// from a faulty lender that either under or over delievers 'assetsToWithdraw'
      assetsToWithdraw = Math.min(postBalance - preBalance, currentDebt);

      totalDebt -= assetsToWithdraw;
      newDebt = currentDebt - assetsToWithdraw;
    } else {
      // We are increasing the lenders debt
      if (lenderDatas[lender].maxDebt != 0) {
        // Revert if targetDebt cannot be achieved due to configured max_debt for given lender
        require (newDebt <= lenderDatas[lender].maxDebt, Errors.AG_HIGHER_DEBT);
      }

      // This is increasing debt with the lender by sending more funds.
      uint256 maxDeposit = IGenericLender(lender).maxDeposit(address(this));
      require (maxDeposit != 0, Errors.AG_INVALID_CONFIGURATION);

      // Deposit the difference between desired and current.
      uint256 assetsToDeposit = newDebt - currentDebt;
      if (assetsToDeposit > maxDeposit) {
        // Deposit as much as possible.
        assetsToDeposit = maxDeposit;
      }
      
      // Ensure we always have minimumTotalIdle when updating debt.
      uint256 minTotalIdle = minimumTotalIdle;
      uint256 totalIdle = asset.balanceOf(address(this));

      require (totalIdle > minTotalIdle, Errors.AG_INSUFFICIENT_ASSETS);
      
      uint256 availableIdle;
      unchecked {
        availableIdle = totalIdle - minTotalIdle;
      }

      // If insufficient funds to deposit, transfer only what is free.
      if (assetsToDeposit > availableIdle) assetsToDeposit = availableIdle;

      // Can't Deposit 0.
      if (assetsToDeposit > 0) {
        // Approve the lender to pull only what we are giving it.
        asset.safeApprove(lender, assetsToDeposit);

        // Always update based on actual amounts deposited.
        uint256 preBalance = asset.balanceOf(address(this));
        IGenericLender(lender).deposit(assetsToDeposit, address(this));
        uint256 postBalance = asset.balanceOf(address(this));

        // Make sure our approval is always back to 0.
        asset.safeApprove(lender, 0);

        /// Making sure we are changing according to the real result no 
        /// matter what. This will spend more gas but makes it more robust.
        assetsToDeposit = preBalance - postBalance;
        totalDebt += assetsToDeposit;
      }
      newDebt = currentDebt + assetsToDeposit;
    }

    lenderDatas[lender].currentDebt = newDebt;

    emit DebtUpdated(lender, currentDebt, newDebt);

    return newDebt;
  }

  /**
   * @dev Used to buy bad debt from this contract.
   *      This should only ever be used in an emergency in place
   *      of force removing a lender in order to not report a loss.
   *      It allows the admin role to buy the lenders debt
   *      for an equal amount of `asset`. It's important to note that 
   *      this does rely on the lenders `convertToShares` function to
   *      determine the amount of shares to buy
   * - Caller is Admin
   * @param lender The lender to buy the debt for.
   * @param amount The amount of debt to buy from this contract.
   */
  function buyDebt(address lender, uint256 amount) external payable onlyAdmin {
    require (lenderDatas[lender].activation != 0, Errors.AG_INVALID_CONFIGURATION);
    
    // Cache the current debt.
    uint256 currentDebt = lenderDatas[lender].currentDebt;
    
    require (currentDebt > 0, Errors.AG_INVALID_CONFIGURATION);
    require (amount > 0, Errors.AG_INVALID_CONFIGURATION);

    // Get the current shares value for the amount.
    uint256 shares = IGenericLender(lender).convertToShares(amount);

    require (shares > 0, Errors.AG_INVALID_CONFIGURATION);
    require (shares <= IGenericLender(lender).balanceOf(address(this)), Errors.AG_INVALID_CONFIGURATION);

    IERC20(_asset).safeTransferFrom(msg.sender, address(this), amount);

    // Adjust if needed to not underflow on math
    uint256 bought = Math.min(currentDebt, amount);

    // Lower lender debt
    lenderDatas[lender].currentDebt -= bought;
    // lower total debt
    totalDebt -= bought;

    emit DebtUpdated(lender, currentDebt, currentDebt - bought);

    // Transfer the lenders shares out.
    IGenericLender(lender).transferShares(msg.sender, shares);

    emit DebtPurchased(lender, bought);
  }

  /**
   * @dev Processing a report means comparing the debt that the lender has taken 
   *      with the current amount of funds it is reporting. If the lender owes 
   *      less than it currently has, it means it has had a profit, else (assets < debt) 
   *      it has had a loss.
   *      Different lenders might choose different reporting lenders: pessimistic, 
   *      only realised P&L, ... The best way to report depends on the lender.
   *      Any applicable fees are charged and distributed during the report as well
   *      to the specified recipients.
   * - Caller is Admin
   * @param lender The lender to process report for
   */
  function processReport(address lender) external payable nonReentrant onlyAdmin returns (uint256, uint256) {
    // Make sure we have a valid lender.
    require (lenderDatas[lender].activation != 0, Errors.AG_INVALID_CONFIGURATION);

    /// This asseses profits using 4626 compliant interface. 
    /// NOTE: It is important that a lender `totalAssets` implementation
    /// cannot be manipulated or else could report incorrect gains/losses.
    /// How much the position is worth.
    uint256 totalAssets = IGenericLender(lender).totalAssets();
    // How much this had deposited to the lender.
    uint256 currentDebt = lenderDatas[lender].currentDebt;

    uint256 gain;
    uint256 loss;

    // Compare reported assets vs. the current debt.
    unchecked {
      if (totalAssets > currentDebt) {
        // We have a gain.
        gain = totalAssets - currentDebt;
      } else {
        // We have a loss.
        loss = currentDebt - totalAssets;
      }
    }

    // Record any reported gains.
    if (gain != 0) {
      // fee process
      _processFee(gain);

      // NOTE: this will increase totalAssets
      lenderDatas[lender].currentDebt += gain;
      totalDebt += gain;
    }

    // Lender is reporting a loss
    if (loss != 0) {
      lenderDatas[lender].currentDebt -= loss;
      totalDebt -= loss;
    }

    return (gain, loss);
  }

  /**
   * @dev Assess the share of unrealised losses that a lender has.
   * @param lender The address of the lender.
   * @param assetsNeeded The amount of assets needed to be withdrawn.
   * @return The share of unrealised losses that the lenderf has.
   */
  function assessShareOfUnrealisedLosses(address lender, uint256 assetsNeeded) external view returns (uint256) {
    require(lenderDatas[lender].currentDebt >= assetsNeeded, Errors.AG_INVALID_CONFIGURATION);

    return _assessShareOfUnrealisedLosses(lender, assetsNeeded);
  }

  /// -----------------------------------------------------------------------
  /// ERC4626 overrides
  /// -----------------------------------------------------------------------
  function totalAssets() public view override returns (uint256) {
    return IERC20(_asset).balanceOf(address(this)) + totalDebt;
  }

  function maxDeposit(address) public view override returns (uint256) {
    if (shutdown) return 0;

    return type(uint256).max;
  }

  function maxMint(address) public view override returns (uint256) {
    if (shutdown) return 0;

    return type(uint256).max;
  }

  function maxWithdraw(address owner) public view override returns (uint256) {
    return convertToAssets(balanceOf(owner));
  }

  function maxRedeem(address owner) public view override returns (uint256) {
    return balanceOf(owner);
  }

  function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
    require(!shutdown, Errors.AG_INVALID_CONFIGURATION);

    return super.deposit(assets, receiver);
  }

  function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
    require(!shutdown, Errors.AG_INVALID_CONFIGURATION);

    return super.mint(shares, receiver);
  }

  function withdraw(
    uint256 assets,
    address receiver,
    address owner
  ) public override nonReentrant returns (uint256) {
    return super.withdraw(assets, receiver, owner);
  }

  function redeem(
    uint256 shares,
    address receiver,
    address owner
  ) public override nonReentrant returns (uint256) {
    return super.redeem(shares, receiver, owner);
  }

  function _withdraw(
    address caller,
    address receiver,
    address owner,
    uint256 assets,
    uint256 shares
  ) internal override {
    _redeem(caller, receiver, owner, assets, shares);
  }

  /**
   * @dev This will attempt to free up the full amount of assets equivalent to
   *      `shares` and transfer them to the `receiver`. If this contract does
   *      not have enough idle funds it will go through any lenders to free up 
   *      enough funds to service the request.
   *      Any losses realized during the withdraw from a lender will be passed on
   *      to the user that is redeeming their vault shares.
   */
  function _redeem(
    address caller,
    address receiver,
    address owner,
    uint256 assets,
    uint256 shares
  ) internal returns (uint256) {
    IERC20 asset = IERC20(_asset);

    if (caller != owner) {
      _spendAllowance(owner, caller, shares);
    }

    uint256 requestedAssets = _processAssets(asset, assets);

    // First burn the corresponding shares from the redeemer.
    _burn(owner, shares);

    // Transfer the requested amount to the receiver.
    asset.safeTransfer(receiver, requestedAssets);

    emit Withdraw(caller, receiver, owner, requestedAssets, shares);

    return requestedAssets;
  }

  function _processAssets(
    IERC20 asset,
    uint256 assets
  ) internal returns (uint256) {
    uint256 requestedAssets = assets;
    uint256 currTotalIdle = asset.balanceOf(address(this));

    if (requestedAssets <= currTotalIdle) return requestedAssets;
    
    /// If there are not enough assets in the contract, we try to free 
    /// funds from lenders.
    uint256 currTotalDebt = totalDebt;
    uint256 lenderCount = lenders.length;
    
    /// Withdraw from lenders only what idle doesn't cover.
    /// `assetsNeeded` is the total amount we need to fill the request.
    uint256 assetsNeeded;
    unchecked {
      assetsNeeded = requestedAssets - currTotalIdle; 
    }
    // `assetsToWithdraw` is the amount to request from the current lender.
    uint256 assetsToWithdraw;

    // To compare against real withdrawals from lenders
    uint256 prevBalance = asset.balanceOf(address(this));

    for (uint256 i; i < lenderCount; ++i) {
      address lender = lenders[i];
      require(lenderDatas[lender].activation != 0, Errors.AG_INVALID_LENDER);

      // How much should the lender have.
      uint256 currentDebt = lenderDatas[lender].currentDebt;

      // What is the max amount to withdraw from this lender.
      assetsToWithdraw = Math.min(assetsNeeded, currentDebt);

      // Cache maxWithdraw now for use if unrealized loss > 0
      uint256 maxWithdraw = IGenericLender(lender).maxWithdraw(address(this));

      /// CHECK FOR UNREALISED LOSSES
      /// If unrealised losses > 0, then the user will take the proportional share 
      /// and realize it (required to avoid users withdrawing from lossy lenders).
      /// NOTE: lenders need to manage the fact that realising part of the loss can 
      /// mean the realisation of 100% of the loss!! (i.e. if for withdrawing 10% of the
      /// lender it needs to unwind the whole position, generated losses might be bigger)
      uint256 unrealisedLossesShare = _assessShareOfUnrealisedLosses(lender, assetsToWithdraw);

      if (unrealisedLossesShare > 0) {
        /// If max withdraw is limiting the amount to pull, we need to adjust the portion of 
        /// the unrealized loss the user should take.
        uint256 wanted = assetsToWithdraw - unrealisedLossesShare;
        if (maxWithdraw < wanted) {
          // Get the proportion of unrealised comparing what we want vs. what we can get
          unrealisedLossesShare = unrealisedLossesShare * maxWithdraw / wanted;
          // Adjust assetsToWithdraw so all future calcultations work correctly
          assetsToWithdraw = maxWithdraw + unrealisedLossesShare;
        }

        // User now "needs" less assets to be unlocked (as he took some as losses)
        assetsToWithdraw -= unrealisedLossesShare;
        requestedAssets -= unrealisedLossesShare;

        /// NOTE: done here instead of waiting for regular update of these values 
        /// because it's a rare case (so we can save minor amounts of gas)
        assetsNeeded -= unrealisedLossesShare;
        currTotalDebt -= unrealisedLossesShare;

        /// If max withdraw is 0 and unrealised loss is still > 0 then the lender likely
        /// realized a 100% loss and we will need to realize that loss before moving on.
        if (maxWithdraw == 0 && unrealisedLossesShare > 0) {
          // Adjust the lender debt accordingly.
          uint256 newDebt = currentDebt - unrealisedLossesShare;
          lenderDatas[lender].currentDebt = newDebt;
          emit DebtUpdated(lender, currentDebt, newDebt);
        }
      }

      // Adjust based on the max withdraw of the lender.
      assetsToWithdraw = Math.min(assetsToWithdraw, maxWithdraw);

      // Can't withdraw 0.
      if (assetsToWithdraw == 0) continue;

      /// WITHDRAW FROM LENDER
      /// Need to get shares since we use redeem to be able to take on losses.
      {
        uint256 sharesToWithdraw = Math.min(
          // Use previewWithdraw since it should round up
          IGenericLender(lender).previewWithdraw(assetsToWithdraw),
          // And check against our actual balance.
          IGenericLender(lender).balanceOf(address(this))
        );
        IGenericLender(lender).redeem(sharesToWithdraw, address(this), address(this));
      }

      uint256 postBalance = asset.balanceOf(address(this));

      // Always check withdrawn against the real amounts.
      uint256 withdrawn = postBalance - prevBalance;
      uint256 loss;

      // Check if we redeemed to much.
      if (withdrawn > assetsToWithdraw) {
        // Make sure we don't underlfow in debt updates.
        if (withdrawn > currentDebt) {
          // Can't withdraw more than our debt.
          assetsToWithdraw = currentDebt;
        } else {
          assetsToWithdraw = withdrawn;
        }
      }

      // If we have not received what we expected, we consider the difference a loss.
      else if (withdrawn < assetsToWithdraw) {
        unchecked {
          loss = assetsToWithdraw - withdrawn; 
        }
      }

      /// NOTE: lender's debt decreases by the full amount but the total idle increases 
      /// by the actual amount only (as the difference is considered lost).
      currTotalIdle += assetsToWithdraw - loss;
      requestedAssets -= loss;
      currTotalDebt -= assetsToWithdraw;

      /// This contract will reduce debt because the unrealised loss has been taken by user
      {
        uint256 newDebt = currentDebt - (assetsToWithdraw + unrealisedLossesShare);
        lenderDatas[lender].currentDebt = newDebt;
        emit DebtUpdated(lender, currentDebt, newDebt);
      }

      // Break if we have enough total idle to serve initial request.
      if (requestedAssets <= currTotalIdle) break;

      // We update the previous balance variable here to save gas in next iteration.
      prevBalance = postBalance;

      /// Reduce what we still need. Safe to use assetsToWithdraw 
      /// here since it has been checked against requestedAssets
      assetsNeeded -= assetsToWithdraw;
    }

    // If we exhaust the queue and still have insufficient total idle, revert.
    require(currTotalIdle >= requestedAssets, Errors.AG_INSUFFICIENT_ASSETS);

    totalDebt = currTotalDebt;

    return requestedAssets;
  }

  function _processFee(uint256 gain) internal {
    uint256 adminFeeAssets = gain.percentMul(adminFee);
    uint256 protocolFeeAssets = gain.percentMul(protocolFee);
    uint256 gainWithoutFee;
    unchecked {
      gainWithoutFee = gain - (adminFeeAssets + protocolFeeAssets);
    } 

    uint256 supply = totalSupply();
    uint256 assets = totalAssets() + gainWithoutFee;
    
    _mint(admin, adminFeeAssets.mulDiv(supply, assets, Math.Rounding.Down));
    _mint(treasury, protocolFeeAssets.mulDiv(supply, assets, Math.Rounding.Down));
  }

  /**
   * @dev Returns the share of losses that a user would take if withdrawing from this lender
   *      e.g. if the lender has unrealised losses for 10% of its current debt and the user 
   *      wants to withdraw 1000 tokens, the losses that he will take are 100 token
   */
  function _assessShareOfUnrealisedLosses(address lender, uint256 assetsNeeded) internal view returns (uint256) {
    // Minimum of how much debt the debt should be worth.
    uint256 lenderCurrentDebt = lenderDatas[lender].currentDebt;
    // The actual amount that the debt is currently worth.
    uint256 lenderAssets = IGenericLender(lender).totalAssets();

    // If no losses, return 0
    if (lenderAssets >= lenderCurrentDebt || lenderCurrentDebt == 0) return 0;

    /// Users will withdraw assetsToWithdraw divided by loss ratio (lenderAssets / lenderCurrentDebt - 1),
    /// but will only receive assetsToWithdraw.
    /// NOTE: If there are unrealised losses, the user will take his share.
    uint256 numerator = assetsNeeded * lenderAssets;
    uint256 lossesUserShare = assetsNeeded - numerator / lenderCurrentDebt;
    
    // Always round up
    if (numerator % lenderCurrentDebt != 0) lossesUserShare++;

    return lossesUserShare;
  }
}
