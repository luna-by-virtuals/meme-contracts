# Luna.fun Meme Launchpad

Pump.fun but on **BNB Chain**. With built-in AI generated marketing content!

## AI Generated Content Instructions


### Step 1: Tag for AIGC
Write a tweet. Tag @butler_agent + your meme coin's X handle (e.g. @memecoin)

<img src="https://dev.luna.fun/assets/about1-uuhHwqaM.png" alt="About Image" width="400" />

### Step 2: Add Your Prompt
Got a meme idea? Add your prompt in your tweet.

<img src="https://dev.luna.fun/assets/about2-RhlTH5Ql.png" alt="About Image" width="400" />

### Step 3: Let the AI Cook
Luna delivers meme videos — your meme project will likely quote-repost it.

<img src="https://dev.luna.fun/assets/about3-BmMnPyAn.png" alt="About Image" width="400" />


## Tech Stack

- **Blockchain**: BNB Chain + Ethereum Chain 
- **Smart Contracts**: Solidity ^0.8.26  
- **Frontend**: React + ethers.js  
- **Development**: Hardhat, OpenZeppelin libraries, TypeScript  


## Supported Networks

- **BNB Chain Mainnet** (Chain ID: 56)  
- **BNB Chain Testnet** (Chain ID: 97)  
- **Ethereum Mainnet** (Chain ID: 1)  
- **Ethereum Sepolia Testnet** (Chain ID: 11155111)


## Contract Addresses

**BNB Mainnet**
- TaxManager: TBD
- FFactoryV2: TBD
- FRouter: TBD
- LaunchpadV2: TBD

**BNB Testnet**
- TaxManager: 0xB628636d87332B9722d734e59dFe833d6cB7e1B6
- FFactoryV2: 0xd4aDf97d7Fc2051Ae9b8881F59f21D4D1B8e6036
- FRouter: 0xd957bcccbF8CF17559E234d8a07182D1c63e40DE
- LaunchpadV2: 0xF448B98d9d6c75b82fA339F0c3Ebf789660C3BBF


## Features

- **Bonding Curve Launch**: Tokens launch with a bonding curve mechanism that gradually increases price as tokens are bought
- **Automatic Graduation**: Tokens automatically graduate to PancakeSwap when they reach a certain threshold
- **Tax System**: Configurable buy/sell taxes with automatic distribution to creators, treasury, and AIGC vault
- **Anti-Bot Protection**: Built-in bot protection mechanisms and blacklist functionality
- **Multi-Chain Support**: Deployable on any EVM-compatible network
- **Gas-Efficient Design**: Optimized for BNB Chain's low gas costs
- **Upgradeable Contracts**: All core contracts use OpenZeppelin's upgradeable proxy pattern
- **Role-Based Access Control**: Secure permission system for different contract functions
- **Liquidity Pool Management**: Automatic creation and management of trading pairs
- **Creator Rewards**: Token creators receive a share of trading fees and bonding rewards


## Core Contracts

### LaunchpadV2
The main launchpad contract that handles token creation, bonding curve mechanics, and graduation to PancakeSwap.

### AgentTokenV2  
The BEP20 token implementation with built-in tax mechanisms, anti-bot protection, and automatic liquidity management.

### FFactoryV2
Factory contract for creating token pairs and managing the bonding curve pairs.

### FRouter
Router contract that handles buy/sell operations on the bonding curve and manages graduation to PancakeSwap.

### TaxManager
Manages tax collection and distribution to creators, treasury, and AIGC vault.

## Architecture

The platform uses a bonding curve mechanism where:
1. Tokens are launched with an initial supply and bonding curve
2. Users can buy tokens at increasing prices as the curve progresses
3. When the bonding curve reaches a threshold, tokens automatically graduate to PancakeSwap
4. Trading fees are collected and distributed according to configured parameters

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env`, fill in all the variables.

3. Deploy contracts:
```bash
# For BNB
npx hardhat run ./scripts/deploy_bsc.ts --network bsc

# For BNB Testnet
npx hardhat run ./scripts/deploy_bsc.ts --network bsc_testnet
```

4. Verify contracts:
```bash
npx hardhat verify {contract address} --network bsc_testnet
```

## Security Features

- **Reentrancy Protection**: All external calls are protected against reentrancy attacks
- **Access Control**: Role-based permissions for sensitive operations
- **Upgrade Safety**: Contracts use OpenZeppelin's upgradeable proxy pattern
- **Input Validation**: Comprehensive validation of all user inputs
- **Blacklist System**: Ability to blacklist malicious addresses
- **Bot Protection**: Built-in mechanisms to prevent bot manipulation
