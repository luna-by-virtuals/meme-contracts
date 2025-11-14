# System Overview

## Architecture

The Meme Launchpad system is a decentralized token launch platform that enables users to create and trade tokens through a bonding curve mechanism before graduating to Uniswap V2. The system consists of five main contracts that work together to provide a complete token launch and trading experience.

**Chain Support**:
- **Ethereum**: Tokens graduate to Uniswap V2

The contracts use Uniswap V2-compatible interfaces (`IUniswapV2Router02`, `IUniswapV2Factory`) for DEX integration.

## Core Contracts

### 1. Launchpad

**Purpose**: The main entry point for users to launch tokens and interact with the platform.

**Key Features**:
- Token creation and launch management
- Bonding curve trading (buy/sell operations)
- Token graduation to Uniswap V2 when threshold is reached
- User profile and token metadata management
- ACP (Agent Creator Program) wallet management

**Key Functions**:
- `launch()`: Creates a new token with metadata, initializes bonding curve, and makes optional initial purchase
- `buy()`: Allows users to purchase tokens from the bonding curve
- `sell()`: Allows users to sell tokens back to the bonding curve
- `_openTradingOnUniswap()`: Graduates token to Uniswap V2 when reserve threshold is met
- `setAcpWallet()`: Sets ACP wallet for a token (ACP manager only)

**Key Parameters**:
- `initialSupply`: Initial token supply for new launches
- `gradThreshold`: Reserve threshold that triggers graduation
- `K`: Constant used in bonding curve formula (3,000,000,000)

**State Management**:
- Maintains `tokenInfo` mapping with token metadata, creator info, and trading status
- Tracks user profiles and their created tokens
- Manages ACP wallets via `acpWallets` mapping

### 2. FFactory

**Purpose**: Factory contract responsible for creating token instances and trading pairs.

**Key Features**:
- Token creation with salt
- Pair creation for bonding curve trading
- Tax parameter management
- Token graduation coordination

**Key Functions**:
- `createToken()`: Deploys new `AgentToken` instances with encoded parameters
- `createPair()`: Creates `FPair` instances for bonding curve trading
- `graduate()`: Calls `AgentToken.addInitialLiquidity()` to enable DEX trading
- `setTaxParams()`: Configures bonding curve tax rates

**Access Control**:
- `CREATOR_ROLE`: Can create tokens and pairs, graduate tokens
- `ADMIN_ROLE`: Can set tax parameters and router address

**Tax Configuration**:
- `buyTax`: Tax rate for purchases on bonding curve (basis points, 10000 = 100%)
- `sellTax`: Tax rate for sales on bonding curve (basis points, 10000 = 100%)
- `taxVault`: Address where taxes are collected (TaxManager)

### 3. FRouter

**Purpose**: Handles all trading operations on the bonding curve and manages liquidity.

**Key Features**:
- Bonding curve swap calculations using constant product formula
- Buy/sell execution with tax collection
- Initial liquidity management
- Token graduation process

**Key Functions**:
- `buy()`: Executes token purchase, collects buy tax, transfers tokens to buyer
- `sell()`: Executes token sale, collects sell tax, transfers asset tokens to seller
- `addInitialLiquidity()`: Adds initial liquidity to bonding curve pair
- `graduate()`: Transfers all reserves from bonding curve to token address, then calls TaxManager
- `getAmountsOut()`: Calculates output amounts using constant product formula (k = reserveA * reserveB)

**Tax Collection**:
- Collects taxes on both buy and sell operations
- Records taxes in TaxManager via `recordBondingTax()`
- Transfers tax amounts to TaxManager contract

**Access Control**:
- `EXECUTOR_ROLE`: Can execute trades, add liquidity, and graduate tokens
- `ADMIN_ROLE`: Can manage router configuration

### 4. AgentToken

**Purpose**: The ERC20 token contract with advanced tax and liquidity pool management features.

**Key Features**:
- Standard ERC20 functionality with tax mechanics
- Automatic tax swapping to pair token
- Liquidity pool management
- Bot protection mechanisms
- Name changes from "fun {name}" to "{name}" after initial liquidity is added

**Key Functions**:
- `transfer()` / `transferFrom()`: Standard transfers with tax processing
- `_taxProcessing()`: Applies buy/sell taxes based on liquidity pool interactions
- `_autoSwap()`: Automatically swaps accumulated taxes to pair token
- `addInitialLiquidity()`: Adds liquidity to Uniswap V2 pair after graduation
- `addLiquidityPool()` / `removeLiquidityPool()`: Manages liquidity pool addresses

**Tax Mechanics**:
- Buy tax: Applied when tokens are received from a liquidity pool
- Sell tax: Applied when tokens are sent to a liquidity pool
- Tax rates: Configurable in basis points (BP_DENOM = 1,000,000)
- Auto-swap: Automatically swaps accumulated taxes when threshold is reached

**Liquidity Pool Management**:
- Tracks multiple liquidity pools via EnumerableSet
- Automatically detects Uniswap V2 pairs
- Prevents trading before initial liquidity is added (via `fundedDate` check)

**State Variables**:
- `fundedDate`: Timestamp when initial liquidity was added (0 = not yet funded)
- `projectBuyTaxBasisPoints` / `projectSellTaxBasisPoints`: Tax rates
- `swapThresholdBasisPoints`: Threshold for triggering auto-swap
- `projectTaxRecipient`: Address that receives swapped tax tokens (TaxManager)
- `uniswapV2Pair`: The Uniswap V2 pair address (created on construction)

### 5. TaxManager (Supporting Contract)

**Purpose**: Manages tax collection, distribution, and claims for both bonding curve and DEX phases.

**Key Features**:
- Records taxes from both bonding curve and DEX trading
- Distributes taxes to creators, leaderboard vault, ACP wallets, and treasury
- Handles token graduation status
- Provides tax claiming functionality
- Awards bonding reward to creator on graduation

**Tax Distribution**:
- **Bonding Phase**: Uses `bondingTaxConfig` (creator share + leaderboard share + ACP share)
- **Uniswap Phase**: Uses `taxConfig` (creator share + leaderboard share + ACP share)
- Remaining amount goes to treasury

**Key Functions**:
- `recordBondingTax()`: Records taxes from bonding curve trades (called by FRouter, launchpadRouter only)
- `recordTax()`: Records taxes from DEX trades (called by AgentToken, requires graduated token)
- `graduate()`: Marks token as graduated, awards bonding reward to creator, switches to DEX tax config
- `claimTax()`: Allows recipients to claim their accumulated taxes
- `claimLeaderboardTax()`: Allows leaderboard vault to claim leaderboard taxes
- `claimAcpTax()`: Allows ACP wallet to claim ACP taxes

**Tax Recipients**:
- Creator: Receives creator share of taxes
- Leaderboard Vault: Receives leaderboard share of taxes
- ACP Wallet: Receives ACP share of taxes (per token)
- Treasury: Receives remaining taxes after all shares

## System Flow

### Token Launch Flow

1. User calls `Launchpad.launch()` with token metadata and initial purchase amount
2. Launchpad transfers asset tokens from user to contract
3. `FFactory.createToken()` deploys new `AgentToken` instance (creates Uniswap V2 pair on construction)
4. `FFactory.createPair()` creates bonding curve pair
5. Launchpad adds initial liquidity to bonding curve via `FRouter.addInitialLiquidity()`
6. Token info is stored in Launchpad with metadata
7. If initial purchase > 0, purchase is executed and tokens sent to creator

### Trading Flow (Bonding Curve)

**Buy Flow**:
1. User calls `Launchpad.buy()` with asset token amount
2. Launchpad calls `FRouter.buy()`
3. Router calculates buy tax and transfers tax to TaxManager
4. Router transfers remaining asset tokens to bonding pair
5. Router calculates token output using constant product formula
6. Router transfers tokens to buyer
7. Router updates pair reserves via `swap()`
8. If reserve threshold reached, triggers graduation

**Sell Flow**:
1. User calls `Launchpad.sell()` with token amount
2. Launchpad calls `FRouter.sell()`
3. Router transfers tokens to bonding pair
4. Router calculates asset token output using constant product formula
5. Router calculates sell tax
6. Router transfers asset tokens (amount - tax) to seller
7. Router transfers tax to TaxManager
8. Router records tax via `TaxManager.recordBondingTax()`
9. Router updates pair reserves via `swap()`

### Graduation Flow

1. When bonding curve reserve reaches `gradThreshold`, `_openTradingOnUniswap()` is called
2. `FRouter.graduate()` transfers all reserves from bonding curve pair to token address
3. `FRouter.graduate()` calls `TaxManager.graduate()` which:
   - Awards bonding reward to creator
   - Marks token as graduated
4. `FFactory.graduate()` calls `AgentToken.addInitialLiquidity()` which:
   - Adds liquidity to Uniswap V2 pair
   - Sets `fundedDate` (enables DEX trading)
   - Transfers LP tokens to address(0)
5. Token can now trade on Uniswap V2 with different tax distribution

### Tax Distribution Flow

**Bonding Curve Phase**:
1. Taxes collected by FRouter on buy/sell
2. Taxes sent to TaxManager via `recordBondingTax()`
3. TaxManager distributes using `bondingTaxConfig`:
   - Creator share → `taxes[creator]`
   - Leaderboard share → `leaderboardTaxes[token]`
   - ACP share → `acpTaxes[token]`
   - Treasury share → `taxes[treasury]`

**DEX Phase (Uniswap V2)**:
1. AgentToken collects taxes on transfers to/from Uniswap V2 pair
2. Taxes accumulated in contract, auto-swapped to pair token
3. Swapped tokens sent to TaxManager (projectTaxRecipient)
4. TaxManager receives via `recordTax()` (requires graduated token)
5. TaxManager distributes using `taxConfig`:
   - Creator share → `taxes[creator]`
   - Leaderboard share → `leaderboardTaxes[token]`
   - ACP share → `acpTaxes[token]`
   - Treasury share → `taxes[treasury]`

## Key Design Patterns

### Upgradeable Contracts
- Launchpad, FFactory, FRouter, and TaxManager use OpenZeppelin's upgradeable pattern
- Allows for future improvements without migration

### Access Control
- Role-based access control using OpenZeppelin's AccessControl
- Clear separation of admin, creator, executor, and owner roles

### Reentrancy Protection
- All critical functions protected with `nonReentrant` modifier
- Prevents reentrancy attacks during swaps and transfers

### Constant Product Formula
- Bonding curve uses k = reserveA * reserveB formula
- Price increases as tokens are bought, decreases as tokens are sold
- Ensures liquidity is always available

## Security Features

1. **Funding Date Check**: Prevents trading on Uniswap V2 pair before initial liquidity is added
2. **Bot Protection**: Configurable duration to prevent front-running
3. **Slippage Protection**: Users can specify minimum output amounts
4. **Tax Validation**: Ensures recorded taxes don't exceed actual balances
5. **Access Control**: Strict role-based permissions for sensitive operations
6. **Graduation Check**: DEX tax recording requires token to be graduated

## Constants and Parameters

- `K = 3,000,000,000`: Bonding curve constant
- `BP_DENOM = 1,000,000`: Basis points denominator (for AgentToken taxes)
- `DENOM = 10,000`: Denominator for tax distribution (for TaxManager)
- `MAX_SWAP_THRESHOLD_MULTIPLE = 20`: Maximum swap size multiplier
- `CALL_GAS_LIMIT = 50,000`: Gas limit for external calls
