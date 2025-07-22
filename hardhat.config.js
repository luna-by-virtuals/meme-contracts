/** @type import('hardhat/config').HardhatUserConfig */
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("@openzeppelin/hardhat-upgrades");
require("@fireblocks/hardhat-fireblocks");
require("hardhat-contract-sizer");

const { ApiBaseUrl } = require("@fireblocks/fireblocks-web3-provider");

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  namedAccounts: {
    deployer: `privatekey://${process.env.PRIVATE_KEY}`,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  networks: {
    base: {
      url: "https://eth.drpc.org",
      accounts: [process.env.PRIVATE_KEY],
    },
    sepolia: {
      url: "https://sepolia.drpc.org",
      accounts: [process.env.PRIVATE_KEY]
    },
    local: {
      url: "http://127.0.0.1:8545",
      gasPrice: 2299996609,
    },
  },
  mocha: {
    timeout: 100000000,
  },
};
