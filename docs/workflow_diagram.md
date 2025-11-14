# Workflow Diagrams

## Token Launch Workflow

```
User
  │
  ├─> Launchpad.launch()
  │   ├─> Transfer asset tokens from user
  │   ├─> FFactory.createToken()
  │   │   └─> Deploy AgentToken
  │   │       ├─> Initialize token with params
  │   │       ├─> Create Uniswap V2 pair
  │   │       └─> Store pair address
  │   │
  │   ├─> FFactory.createPair()
  │   │   └─> Deploy FPair (bonding curve)
  │   │
  │   ├─> FRouter.addInitialLiquidity()
  │   │   ├─> Transfer tokens to pair
  │   │   └─> Pair.mint() (initialize reserves)
  │   │
  │   ├─> Store token info & metadata
  │   │
  │   └─> [Optional] Make initial purchase
  │       └─> Transfer tokens to creator
  │
  └─> Token launched on bonding curve
```

## Buy Flow (Bonding Curve)

```
User
  │
  ├─> Launchpad.buy(amountIn, tokenAddress, amountOutMin, deadline)
  │   │
  │   └─> FRouter.buy(amountIn, tokenAddress, buyer)
  │       │
  │       ├─> Calculate buy tax
  │       │   └─> taxAmount = (amountIn * buyTax) / 10000
  │       │
  │       ├─> Transfer asset tokens
  │       │   ├─> amountIn - tax → bonding pair
  │       │   └─> tax → TaxManager
  │       │
  │       ├─> TaxManager.recordBondingTax()
  │       │   └─> Distribute tax (bondingTaxConfig)
  │       │       ├─> Creator share → taxes[creator]
  │       │       ├─> Leaderboard share → leaderboardTaxes[token]
  │       │       ├─> ACP share → acpTaxes[token]
  │       │       └─> Treasury share → taxes[treasury]
  │       │
  │       ├─> Calculate token output (constant product)
  │       │   └─> k = reserveA * reserveB
  │       │       newReserveB = reserveB + (amountIn - tax)
  │       │       newReserveA = k / newReserveB
  │       │       amountOut = reserveA - newReserveA
  │       │
  │       ├─> Transfer tokens to buyer
  │       │
  │       ├─> Update pair reserves (Pair.swap())
  │       │
  │       └─> Check graduation threshold
  │           └─> If reserveA <= gradThreshold
  │               └─> Trigger graduation
  │
  └─> User receives tokens
```

## Sell Flow (Bonding Curve)

```
User
  │
  ├─> Launchpad.sell(amountIn, tokenAddress, amountOutMin, deadline)
  │   │
  │   └─> FRouter.sell(amountIn, tokenAddress, seller)
  │       │
  │       ├─> Calculate token output (constant product)
  │       │   └─> k = reserveA * reserveB
  │       │       newReserveA = reserveA + amountIn
  │       │       newReserveB = k / newReserveA
  │       │       amountOut = reserveB - newReserveB
  │       │
  │       ├─> Transfer tokens to pair
  │       │
  │       ├─> Calculate sell tax
  │       │   └─> taxAmount = (amountOut * sellTax) / 10000
  │       │
  │       ├─> Transfer asset tokens
  │       │   ├─> amountOut - tax → seller
  │       │   └─> tax → TaxManager
  │       │
  │       ├─> TaxManager.recordBondingTax()
  │       │   └─> Distribute tax (bondingTaxConfig)
  │       │       ├─> Creator share → taxes[creator]
  │       │       ├─> Leaderboard share → leaderboardTaxes[token]
  │       │       ├─> ACP share → acpTaxes[token]
  │       │       └─> Treasury share → taxes[treasury]
  │       │
  │       └─> Update pair reserves (Pair.swap())
  │
  └─> User receives asset tokens
```

## Graduation Workflow

```
Buy Operation
  │
  └─> Reserve check: reserveA <= gradThreshold?
      │
      └─> Launchpad._openTradingOnUniswap()
          │
          ├─> FRouter.graduate()
          │   ├─> Get bonding pair balances
          │   ├─> Transfer asset tokens → token address
          │   ├─> Transfer tokens → token address
          │   └─> TaxManager.graduate()
          │       ├─> Award bonding reward to creator
          │       └─> Mark token as graduated
          │
          ├─> FFactory.graduate()
          │   └─> AgentToken.addInitialLiquidity(address(0))
          │       ├─> Check fundedDate == 0
          │       ├─> Set fundedDate = block.timestamp
          │       ├─> Transfer tokens to Uniswap V2 pair
          │       ├─> Transfer pair tokens to Uniswap V2 pair
          │       └─> UniswapV2Pair.mint()
          │           └─> Create LP tokens (sent to address(0))
          │
          └─> Token now trades on Uniswap V2
              ├─> Name changes from "fun {name}" to "{name}"
              └─> DEX tax distribution active
```

## Tax Collection & Distribution (Bonding Curve)

```
FRouter.buy() or FRouter.sell()
  │
  ├─> Calculate tax amount
  │
  ├─> Transfer tax to TaxManager
  │
  └─> TaxManager.recordBondingTax()
      │
      ├─> Get bondingTaxConfig
      │   ├─> creatorShare
      │   ├─> leaderboardShare
      │   └─> acpShare
      │
      ├─> Calculate shares
      │   ├─> creatorAmount = (tax * creatorShare) / 10000
      │   ├─> leaderboardAmount = (tax * leaderboardShare) / 10000
      │   ├─> acpAmount = (tax * acpShare) / 10000
      │   └─> treasuryAmount = tax - creatorAmount - leaderboardAmount - acpAmount
      │
      ├─> Update balances
      │   ├─> taxes[creator] += creatorAmount
      │   ├─> leaderboardTaxes[token] += leaderboardAmount
      │   ├─> acpTaxes[token] += acpAmount
      │   └─> taxes[treasury] += treasuryAmount
      │
      └─> Emit events
```

## Tax Collection & Distribution (DEX - Uniswap V2)

```
User Transfer (to/from Uniswap V2 pair)
  │
  ├─> AgentToken._transfer()
  │   │
  │   ├─> _taxProcessing()
  │   │   ├─> Calculate tax (buy or sell)
  │   │   ├─> Add tax to contract balance
  │   │   └─> Update projectTaxPendingSwap
  │   │
  │   └─> _autoSwap()
  │       │
  │       ├─> Check swap eligibility
  │       │   ├─> Balance >= threshold?
  │       │   └─> Not during swap?
  │       │
  │       └─> _swapTax()
  │       │
  │       ├─> Swap tokens → pair token (via Uniswap V2 Router)
  │       │
  │       ├─> Transfer to TaxManager (projectTaxRecipient)
  │       │
  │       └─> TaxManager.recordTax()
  │           │
  │           ├─> Check token is graduated
  │           │
  │           ├─> Get taxConfig (different from bonding)
  │           │
  │           ├─> Calculate shares
  │           │
  │           └─> Update taxes mapping
  │
  └─> Tax distributed to recipients
```

## Tax Claiming Workflow

```
Recipient (Creator/Treasury)
  │
  ├─> TaxManager.claimTax(amount)
  │   │
  │   ├─> Check claimable balance
  │   │   └─> taxes[recipient] >= amount?
  │   │
  │   ├─> Transfer asset tokens to recipient
  │   │
  │   └─> Update balances
  │       ├─> taxes[recipient] -= amount
  │       └─> _totalClaimedTax += amount
  │
  └─> Recipient receives asset tokens
```

## Leaderboard Tax Claiming Workflow

```
Leaderboard Vault
  │
  ├─> TaxManager.claimLeaderboardTax(token, amount, recipient)
  │   │
  │   ├─> Check claimable balance
  │   │   └─> leaderboardTaxes[token] >= amount?
  │   │
  │   ├─> Verify caller is leaderboardVault
  │   │
  │   ├─> Transfer asset tokens to recipient
  │   │
  │   └─> Update balances
  │       └─> leaderboardTaxes[token] -= amount
  │
  └─> Recipient receives asset tokens
```

## ACP Tax Claiming Workflow

```
ACP Wallet
  │
  ├─> TaxManager.claimAcpTax(token, amount, recipient)
  │   │
  │   ├─> Check claimable balance
  │   │   └─> acpTaxes[token] >= amount?
  │   │
  │   ├─> Verify caller is ACP wallet for token
  │   │
  │   ├─> Transfer asset tokens to recipient
  │   │
  │   └─> Update balances
  │       └─> acpTaxes[token] -= amount
  │
  └─> Recipient receives asset tokens
```

## State Transitions

### Token Lifecycle States

```
1. CREATED
   ├─> Token deployed
   ├─> Uniswap V2 pair created (not yet funded)
   ├─> Bonding pair created
   └─> Initial liquidity added to bonding curve
   
2. BONDING_PHASE
   ├─> Trading on bonding curve only
   ├─> Uniswap V2 pair exists but fundedDate == 0
   ├─> Taxes collected via FRouter
   └─> Reserves decreasing as tokens bought
   
3. GRADUATION_TRIGGERED
   ├─> Reserve threshold reached
   ├─> Graduation process initiated
   ├─> Reserves transferred to token address
   └─> Bonding reward awarded to creator
   
4. GRADUATED
   ├─> Trading on Uniswap V2 enabled
   ├─> fundedDate set (enables DEX trading)
   ├─> Initial liquidity added to Uniswap V2
   ├─> Name changes from "fun {name}" to "{name}"
   ├─> Taxes collected via AgentToken
   └─> Different tax distribution config
```

### Tax Collection States

```
BONDING_PHASE:
  ├─> Buy/Sell → FRouter
  ├─> Tax calculated → TaxManager
  └─> Distribution: bondingTaxConfig
      ├─> Creator share
      ├─> Leaderboard share
      ├─> ACP share
      └─> Treasury share

GRADUATED (DEX Phase):
  ├─> Transfer → AgentToken
  ├─> Tax accumulated → Auto-swap
  ├─> Swapped tokens → TaxManager
  │   └─> Via Uniswap V2 Router
  └─> Distribution: taxConfig
      ├─> Creator share
      ├─> Leaderboard share
      ├─> ACP share
      └─> Treasury share
```

## Key Interactions Between Contracts

```
Launchpad
  ├─> Uses: FFactory (create tokens/pairs)
  ├─> Uses: FRouter (trading operations)
  └─> Manages: Token metadata & user profiles

FFactory
  ├─> Creates: AgentToken instances
  ├─> Creates: FPair instances (bonding curve)
  ├─> Manages: Tax parameters (buyTax, sellTax, taxVault)
  └─> Coordinates: Token graduation

FRouter
  ├─> Uses: FFactory (get pairs)
  ├─> Uses: FPair (bonding curve operations)
  ├─> Uses: TaxManager (record taxes)
  └─> Manages: Trading & liquidity

AgentToken
  ├─> Uses: Uniswap V2 Router (swaps)
  ├─> Uses: Uniswap V2 Factory (pairs)
  ├─> Uses: TaxManager (record taxes)
  └─> Manages: Token transfers & taxes

TaxManager
  ├─> Receives: Taxes from FRouter (bonding)
  ├─> Receives: Taxes from AgentToken (DEX phase)
  ├─> Uses: Launchpad (get creator info)
  └─> Manages: Tax distribution & claims
```
