const { ethers } = require("ethers");

const tokenAdmin = "0x6d688d8ef0bf84d6796970ff5c6f140ccf6130ec";
const uniswapRouter = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
const assetToken = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const name = "dsaj";
const ticker = "DNKLSA";
const tokenSupplyParams = "0x000000000000000000000000000000000000000000000000000000003b9aca000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003b9aca000000000000000000000000000000000000000000000000000000000000000e10000000000000000000000000e92c5a421ceb08cf962c0f9ccb687a38fa31bdc0";
const tokenTaxParams = "0x000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000064000000000000000000000000d7722d7733ef9974372f85ac79ae6ecf94c27c3a";
const contractAddress = "0x389AaFFD8862107b926c67F8F2da43AC70DE454f";

// Encode the base params (name and ticker)
const baseParams = ethers.AbiCoder.defaultAbiCoder().encode(
  ["string", "string"],
  [name, ticker]
);

// Format for hardhat verify command
// For address[3], we need to pass it as a JSON array string
const integrationAddresses = `["${tokenAdmin}","${uniswapRouter}","${assetToken}"]`;
const constructorArgs = `${integrationAddresses} ${baseParams} ${tokenSupplyParams} ${tokenTaxParams}`;

console.log("\n=== Hardhat Verify Command ===\n");
console.log(`npx hardhat verify --network bsc ${contractAddress} "${integrationAddresses}" "${baseParams}" "${tokenSupplyParams}" "${tokenTaxParams}"\n`);

console.log("\n=== Alternative: Using Constructor Arguments Format ===\n");
console.log(`npx hardhat verify --network bsc ${contractAddress} --constructor-args verify-args.ts\n`);

console.log("\n=== Constructor Arguments (for reference) ===\n");
console.log("1. integrationAddresses_ [address]:", `[${tokenAdmin}, ${uniswapRouter}, ${assetToken}]`);
console.log("2. baseParams_ (bytes):", baseParams);
console.log("3. supplyParams_ (bytes):", tokenSupplyParams);
console.log("4. taxParams_ (bytes):", tokenTaxParams);

// Generate the arguments file for use with --constructor-args flag
const fs = require('fs');
const argsContent = `["${tokenAdmin}","${uniswapRouter}","${assetToken}"]
"${baseParams}"
"${tokenSupplyParams}"
"${tokenTaxParams}"`;

fs.writeFileSync('verify-args.txt', argsContent);
console.log("\n=== Generated verify-args.txt file ===");
console.log("You can use this file with: --constructor-args verify-args.txt");
console.log(`Contents:\n${argsContent}`);

