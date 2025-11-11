# Workflow Diagrams

## Token Launch Workflow

```
User
  │
  ├─> LaunchpadV2.launch()
  │   ├─> Transfer asset tokens from user
  │   ├─> FFactoryV2.createToken()
  │   │   └─> Deploy AgentTokenV2
  │   │       ├─> Initialize token with params
  │   │       ├─> Create DEX pair (Uniswap/PancakeSwap)
  │   │       └─> Blacklist DEX pair
  │   │
  │   ├─> FFactoryV2.createPair()
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
  ├─> LaunchpadV2.buy(amountIn, tokenAddress)
  │   │
  │   └─> FRouter.buy(amountIn, tokenAddress, buyer)
  │       │
  │       ├─> Calculate buy tax
  │       │   └─> taxAmount = (amountIn * buyTax) / 10000
  │       │
  │       ├─> Transfer asset tokens
  │       │   ├─> amount - tax → bonding pair
  │       │   └─> tax → TaxManager
  │       │
  │       ├─> TaxManager.recordBondingTax()
  │       │   └─> Distribute tax (bondingTaxConfig)
  │       │       ├─> Creator share → taxes[creator]
  │       │       ├─> AIGC share → taxes[token]
  │       │       └─> Treasury share → taxes[treasury]
  │       │
  │       ├─> Calculate token output (constant product)
  │       │   └─> k = reserveA * reserveB
  │       │       newReserveB = reserveB + amountIn
  │       │       newReserveA = k / newReserveB
  │       │       amountOut = reserveA - newReserveA
  │       │
  │       ├─> Transfer tokens to buyer
  │       │
  │       ├─> Update pair reserves
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
  ├─> LaunchpadV2.sell(amountIn, tokenAddress)
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
  │       │
  │       └─> Update pair reserves
  │
  └─> User receives asset tokens
```

## Graduation Workflow

```
Buy/Sell Operation
  │
  └─> Reserve check: reserveA <= gradThreshold?
      │
      └─> LaunchpadV2._openTradingOnUniswap()
          │
          ├─> FRouter.graduate()
          │   ├─> Get bonding pair balances
          │   ├─> Transfer asset tokens → DEX pair (Uniswap/PancakeSwap)
          │   ├─> Transfer tokens → DEX pair
          │   └─> TaxManager.graduate()
          │       └─> Mark token as graduated
          │
          ├─> FFactoryV2.graduate()
          │   ├─> Remove blacklist from DEX pair
          │   └─> AgentTokenV2.addInitialLiquidity()
          │       ├─> Transfer tokens to DEX pair
          │       ├─> Transfer pair tokens to DEX pair
          │       └─> DEXPair.mint()
          │           └─> Create LP tokens
          │
          └─> Token now trades on DEX
              ├─> Ethereum: Uniswap V2
              └─> BSC: PancakeSwap
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
      │   └─> aigcShare
      │
      ├─> Calculate shares
      │   ├─> creatorAmount = (tax * creatorShare) / 10000
      │   ├─> aigcAmount = (tax * aigcShare) / 10000
      │   └─> treasuryAmount = tax - creatorAmount - aigcAmount
      │
      ├─> Update balances
      │   ├─> taxes[creator] += creatorAmount
      │   ├─> taxes[token] += aigcAmount
      │   └─> taxes[treasury] += treasuryAmount
      │
      └─> Emit events
```

## Tax Collection & Distribution (DEX - Uniswap/PancakeSwap)

```
User Transfer (to/from DEX pair)
  │
  ├─> AgentTokenV2._transfer()
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
  │       ├─> Swap tokens → pair token (via DEX Router)
  │       │   ├─> Ethereum: Uniswap V2 Router
  │       │   └─> BSC: PancakeSwap Router
  │       │
  │       ├─> Transfer to TaxManager (projectTaxRecipient)
  │       │
  │       └─> TaxManager.recordTax()
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
Recipient (Creator/AIGC/Treasury)
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

## State Transitions

### Token Lifecycle States

```
1. CREATED
   ├─> Token deployed
   ├─> DEX pair created (blacklisted)
   │   ├─> Ethereum: Uniswap V2 pair
   │   └─> BSC: PancakeSwap pair
   ├─> Bonding pair created
   └─> Initial liquidity added to bonding curve
   
2. BONDING_PHASE
   ├─> Trading on bonding curve only
   ├─> DEX pair blacklisted
   ├─> Taxes collected via FRouter
   └─> Reserves decreasing as tokens bought
   
3. GRADUATION_TRIGGERED
   ├─> Reserve threshold reached
   ├─> Graduation process initiated
   └─> Reserves transferred to DEX pair
   
4. GRADUATED
   ├─> Trading on DEX enabled
   │   ├─> Ethereum: Uniswap V2
   │   └─> BSC: PancakeSwap
   ├─> Blacklist removed
   ├─> Initial liquidity added to DEX
   ├─> Taxes collected via AgentTokenV2
   └─> Different tax distribution config
```

### Tax Collection States

```
BONDING_PHASE:
  ├─> Buy/Sell → FRouter
  ├─> Tax calculated → TaxManager
  └─> Distribution: bondingTaxConfig

GRADUATED (DEX Phase):
  ├─> Transfer → AgentTokenV2
  ├─> Tax accumulated → Auto-swap
  ├─> Swapped tokens → TaxManager
  │   ├─> Ethereum: Via Uniswap V2 Router
  │   └─> BSC: Via PancakeSwap Router
  └─> Distribution: taxConfig
```

## Key Interactions Between Contracts

```
LaunchpadV2
  ├─> Uses: FFactoryV2 (create tokens/pairs)
  ├─> Uses: FRouter (trading operations)
  └─> Manages: Token metadata & user profiles

FFactoryV2
  ├─> Creates: AgentTokenV2 instances
  ├─> Creates: FPair instances (bonding curve)
  ├─> Manages: Tax parameters
  └─> Coordinates: Token graduation

FRouter
  ├─> Uses: FFactoryV2 (get pairs)
  ├─> Uses: FPair (bonding curve operations)
  ├─> Uses: TaxManager (record taxes)
  └─> Manages: Trading & liquidity

AgentTokenV2
  ├─> Uses: DEX Router (swaps)
  │   ├─> Ethereum: Uniswap V2 Router
  │   └─> BSC: PancakeSwap Router
  ├─> Uses: DEX Factory (pairs)
  │   ├─> Ethereum: Uniswap V2 Factory
  │   └─> BSC: PancakeSwap Factory
  ├─> Uses: TaxManager (record taxes)
  └─> Manages: Token transfers & taxes

TaxManager
  ├─> Receives: Taxes from FRouter (bonding)
  ├─> Receives: Taxes from AgentTokenV2 (DEX phase)
  │   ├─> Ethereum: From Uniswap trades
  │   └─> BSC: From PancakeSwap trades
  ├─> Uses: Launchpad (get creator info)
  └─> Manages: Tax distribution & claims
```

