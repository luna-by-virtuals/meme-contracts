# System Overview

## Architecture

The Meme Launchpad system is a decentralized token launch platform that enables users to create and trade tokens through a bonding curve mechanism before graduating to a DEX (Decentralized Exchange). The system consists of four main contracts that work together to provide a complete token launch and trading experience.

**Multi-Chain Support**:
- **Ethereum**: Tokens graduate to Uniswap V2
- **BSC (Binance Smart Chain)**: Tokens graduate to PancakeSwap

The contracts use generic Uniswap V2-compatible interfaces (`IUniswapV2Router02`, `IUniswapV2Factory`) that work with both Uniswap and PancakeSwap, making the system chain-agnostic.

## Core Contracts

### 1. LaunchpadV2

**Purpose**: The main entry point for users to launch tokens and interact with the platform.

**Key Features**:
- Token creation and launch management
- Bonding curve trading (buy/sell operations)
- Token graduation to DEX (Uniswap on Ethereum, PancakeSwap on BSC) when threshold is reached
- User profile and token metadata management

**Key Functions**:
- `launch()`: Creates a new token with metadata, initializes bonding curve, and makes optional initial purchase
- `buy()`: Allows users to purchase tokens from the bonding curve
- `sell()`: Allows users to sell tokens back to the bonding curve
- `_openTradingOnUniswap()`: Graduates token to DEX (Uniswap/PancakeSwap) when reserve threshold is met

**Key Parameters**:
- `initialSupply`: Initial token supply for new launches
- `gradThreshold`: Reserve threshold that triggers graduation
- `K`: Constant used in bonding curve formula (4,500,000,000)

**State Management**:
- Maintains `tokenInfo` mapping with token metadata, creator info, and trading status
- Tracks user profiles and their created tokens
- Prevents duplicate tickers using `tickerExists` mapping

### 2. FFactoryV2

**Purpose**: Factory contract responsible for creating token instances and trading pairs.

**Key Features**:
- Token creation with salt
- Pair creation for bonding curve trading
- Tax parameter management
- Token graduation coordination

**Key Functions**:
- `createToken()`: Deploys new `AgentTokenV2` instances with encoded parameters
- `createPair()`: Creates `FPair` instances for bonding curve trading
- `graduate()`: Removes blacklist restrictions and enables DEX trading (Uniswap/PancakeSwap)
- `setTaxParams()`: Configures bonding curve tax rates

**Access Control**:
- `CREATOR_ROLE`: Can create tokens and pairs, graduate tokens
- `ADMIN_ROLE`: Can set tax parameters and router address

**Tax Configuration**:
- `buyTax`: Tax rate for purchases on bonding curve
- `sellTax`: Tax rate for sales on bonding curve
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
- `graduate()`: Transfers all reserves from bonding curve to DEX pair (Uniswap/PancakeSwap)
- `getAmountsOut()`: Calculates output amounts using constant product formula (k = reserveA * reserveB)

**Tax Collection**:
- Collects taxes on both buy and sell operations
- Records taxes in TaxManager via `recordBondingTax()`
- Transfers tax amounts to TaxManager contract

**Access Control**:
- `EXECUTOR_ROLE`: Can execute trades, add liquidity, and graduate tokens
- `ADMIN_ROLE`: Can manage router configuration

### 4. AgentTokenV2

**Purpose**: The ERC20 token contract with advanced tax and liquidity pool management features.

**Key Features**:
- Standard ERC20 functionality with tax mechanics
- Automatic tax swapping to pair token
- Liquidity pool management
- Blacklist functionality for bonding curve phase
- Bot protection mechanisms

**Key Functions**:
- `transfer()` / `transferFrom()`: Standard transfers with tax processing
- `_taxProcessing()`: Applies buy/sell taxes based on liquidity pool interactions
- `_autoSwap()`: Automatically swaps accumulated taxes to pair token
- `addInitialLiquidity()`: Adds liquidity to DEX pair (Uniswap/PancakeSwap) after graduation
- `addBlacklistAddress()` / `removeBlacklistAddress()`: Manages blacklist during bonding phase

**Tax Mechanics**:
- Buy tax: Applied when tokens are received from a liquidity pool
- Sell tax: Applied when tokens are sent to a liquidity pool
- Tax rates: Configurable in basis points (BP_DENOM = 1,000,000)
- Auto-swap: Automatically swaps accumulated taxes when threshold is reached

**Liquidity Pool Management**:
- Tracks multiple liquidity pools via EnumerableSet
- Automatically detects DEX pairs (Uniswap on Ethereum, PancakeSwap on BSC)
- Prevents trading before initial liquidity is added

**State Variables**:
- `fundedDate`: Timestamp when initial liquidity was added (0 = not yet funded)
- `projectBuyTaxBasisPoints` / `projectSellTaxBasisPoints`: Tax rates
- `swapThresholdBasisPoints`: Threshold for triggering auto-swap
- `projectTaxRecipient`: Address that receives swapped tax tokens (TaxManager)

### 5. TaxManager (Supporting Contract)

**Purpose**: Manages tax collection, distribution, and claims for both bonding curve and DEX (Uniswap/PancakeSwap) phases.

**Key Features**:
- Records taxes from both bonding curve and DEX trading (Uniswap/PancakeSwap)
- Distributes taxes to creators, AIGC vault, and treasury
- Handles token graduation status
- Provides tax claiming functionality

**Tax Distribution**:
- **Bonding Phase**: Uses `bondingTaxConfig` (creator share + AIGC share)
- **Uniswap Phase**: Uses `taxConfig` (creator share + AIGC share)
- Remaining amount goes to treasury

**Key Functions**:
- `recordBondingTax()`: Records taxes from bonding curve trades (called by FRouter)
- `recordTax()`: Records taxes from DEX trades (called by AgentTokenV2)
- `graduate()`: Marks token as graduated, switches to DEX tax config
- `claimTax()`: Allows recipients to claim their accumulated taxes

## System Flow

### Token Launch Flow

1. User calls `LaunchpadV2.launch()` with token metadata and initial purchase amount
2. Launchpad transfers asset tokens from user to contract
3. `FFactoryV2.createToken()` deploys new `AgentTokenV2` instance
4. `FFactoryV2.createPair()` creates bonding curve pair
5. Launchpad adds initial liquidity to bonding curve via `FRouter.addInitialLiquidity()`
6. Token info is stored in Launchpad with metadata
7. If initial purchase > 0, purchase is executed and tokens sent to creator

### Trading Flow (Bonding Curve)

**Buy Flow**:
1. User calls `LaunchpadV2.buy()` with asset token amount
2. Launchpad calls `FRouter.buy()`
3. Router calculates output using constant product formula
4. Router collects buy tax and transfers to TaxManager
5. Router transfers tokens to buyer
6. Router updates pair reserves
7. If reserve threshold reached, triggers graduation

**Sell Flow**:
1. User calls `LaunchpadV2.sell()` with token amount
2. Launchpad calls `FRouter.sell()`
3. Router calculates output using constant product formula
4. Router collects sell tax and transfers to TaxManager
5. Router transfers asset tokens to seller
6. Router updates pair reserves

### Graduation Flow

1. When bonding curve reserve reaches `gradThreshold`, `_openTradingOnUniswap()` is called
2. `FRouter.graduate()` transfers all reserves from bonding curve pair to DEX pair
3. `FFactoryV2.graduate()` removes blacklist and calls `AgentTokenV2.addInitialLiquidity()`
4. `TaxManager.graduate()` marks token as graduated (switches tax config)
5. Token can now trade on DEX (Uniswap on Ethereum, PancakeSwap on BSC) with different tax distribution

### Tax Distribution Flow

**Bonding Curve Phase**:
1. Taxes collected by FRouter on buy/sell
2. Taxes sent to TaxManager via `recordBondingTax()`
3. TaxManager distributes using `bondingTaxConfig`:
   - Creator share → `taxes[creator]`
   - AIGC share → `taxes[token]`
   - Treasury share → `taxes[treasury]`

**DEX Phase (Uniswap/PancakeSwap)**:
1. AgentTokenV2 collects taxes on transfers to/from DEX pair
2. Taxes accumulated in contract, auto-swapped to pair token
3. Swapped tokens sent to TaxManager (projectTaxRecipient)
4. TaxManager receives via `recordTax()`
5. TaxManager distributes using `taxConfig`:
   - Creator share → `taxes[creator]`
   - AIGC share → `taxes[token]`
   - Treasury share → `taxes[treasury]`

## Key Design Patterns

### Upgradeable Contracts
- LaunchpadV2, FFactoryV2, and FRouter use OpenZeppelin's upgradeable pattern
- Allows for future improvements without migration

### Access Control
- Role-based access control using OpenZeppelin's AccessControl
- Clear separation of admin, creator, and executor roles

### Reentrancy Protection
- All critical functions protected with `nonReentrant` modifier
- Prevents reentrancy attacks during swaps and transfers

### Constant Product Formula
- Bonding curve uses k = reserveA * reserveB formula
- Price increases as tokens are bought, decreases as tokens are sold
- Ensures liquidity is always available

## Security Features

1. **Blacklist Mechanism**: Prevents trading on DEX pair (Uniswap/PancakeSwap) during bonding phase
2. **Bot Protection**: Configurable duration to prevent front-running
3. **Slippage Protection**: Users can specify minimum output amounts
4. **Tax Validation**: Ensures recorded taxes don't exceed actual balances
5. **Access Control**: Strict role-based permissions for sensitive operations

## Constants and Parameters

- `K = 4,500,000,000`: Bonding curve constant
- `BP_DENOM = 1,000,000`: Basis points denominator
- `MAX_SWAP_THRESHOLD_MULTIPLE = 20`: Maximum swap size multiplier
- `CALL_GAS_LIMIT = 50,000`: Gas limit for external calls

