const { ethers } = require("ethers");

const tokenAdmin = "0xb0eb22a5406c04e10e150d4bed81727d39f9d5d4";
const uniswapRouter = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
const assetToken = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const name = "TESTGRAD13";
const ticker = "TESTGRAD13";
const tokenSupplyParams = "0x000000000000000000000000000000000000000000000000000000003b9aca000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003b9aca000000000000000000000000000000000000000000000000000000000000000e10000000000000000000000000e4081063a7a68db74fc77f2f736b75f9007d8a26";
const tokenTaxParams = "0x00000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000006400000000000000000000000015b460455aa1288c73f6f6c4d887d055592ddaa0";
const contractAddress = "0x5e89f24BFd1672605299ea3C7007C23F29eA4202";

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

