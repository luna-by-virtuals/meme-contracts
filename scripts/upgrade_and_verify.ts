import { ethers, upgrades } from "hardhat";
import { run } from "hardhat";
import { getImplementationAddress } from '@openzeppelin/upgrades-core';

console.log("Starting upgrade and verify process...");

// Checking if the environment variables are set
if (!process.env.CONTRACT_CONTROLLER_PRIVATE_KEY)
  throw new Error("CONTRACT_CONTROLLER_PRIVATE_KEY not set");
if (!process.env.LAUNCHPAD_PROXY_ADDRESS)
  throw new Error("LAUNCHPAD_PROXY_ADDRESS not set");
if (!process.env.TAX_MANAGER_PROXY_ADDRESS)
  throw new Error("TAX_MANAGER_PROXY_ADDRESS not set");
if (!process.env.FFACTORY_PROXY_ADDRESS)
  throw new Error("FFACTORY_PROXY_ADDRESS not set");
if (!process.env.FROUTER_PROXY_ADDRESS)
  throw new Error("FROUTER_PROXY_ADDRESS not set");

// Setting the proxy contract controller signer
const proxyContractController = new ethers.Wallet(
  process.env.CONTRACT_CONTROLLER_PRIVATE_KEY,
  ethers.provider
);
console.log("Proxy admin signer address:", proxyContractController.address);


(async () => {
  try {
    // Setting the proxy addresses
    const taxManagerProxyAddress = process.env.TAX_MANAGER_PROXY_ADDRESS;
    const fFactoryProxyAddress = process.env.FFACTORY_PROXY_ADDRESS;
    const fRouterProxyAddress = process.env.FROUTER_PROXY_ADDRESS;
    const launchpadProxyAddress = process.env.LAUNCHPAD_PROXY_ADDRESS;
    console.log("Tax manager proxy address:", taxManagerProxyAddress);
    console.log("FFactory proxy address:", fFactoryProxyAddress);
    console.log("FRouter proxy address:", fRouterProxyAddress);
    console.log("Launchpad proxy address:", launchpadProxyAddress);

    async function upgradeContract(proxyAddress: string, contractName: string) {
      const contractFactory = await ethers.getContractFactory(contractName, proxyContractController)
      const contract = await upgrades.upgradeProxy(proxyAddress, contractFactory);
      await contract.waitForDeployment();
      await new Promise(resolve => setTimeout(resolve, 5000));
      const implementationAddress = await getImplementationAddress(ethers.provider, proxyAddress);
      console.log(`${contractName} upgraded successfully to implementation address: ${implementationAddress}`);
    }

    async function verifyContract(proxyAddress: string, contractName: string, retries: number = 5) {
      console.log(`Verifying contract ${contractName}...`);
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await run("verify:verify", {
            address: proxyAddress,
            contract: `contracts/${contractName}.sol:${contractName}`,
          });
          console.log(`${contractName} verified successfully`);
          return;
        } catch (error: any) {
          console.error(`Verification attempt ${attempt} failed for ${contractName}:`, error.message);
          
          if (attempt === retries) {
            console.error(`Failed to verify ${contractName} after ${retries} attempts`);
            throw error;
          }
          
          console.log(`Retrying verification for ${contractName} in 10 seconds... (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    await upgradeContract(taxManagerProxyAddress, "TaxManager");
    await upgradeContract(fFactoryProxyAddress, "FFactoryV2");
    await upgradeContract(fRouterProxyAddress, "FRouter");
    await upgradeContract(launchpadProxyAddress, "LaunchpadV2");

    await verifyContract(taxManagerProxyAddress, "TaxManager");
    await verifyContract(fFactoryProxyAddress, "FFactoryV2");
    await verifyContract(fRouterProxyAddress, "FRouter");
    await verifyContract(launchpadProxyAddress, "LaunchpadV2");

    // await upgradeContract(taxManagerProxyAddress, "AgentTokenV2");
    // await verifyContract(fRouterProxyAddress, "AgentTokenV2");


  } catch (error: any) {
    console.error("Error occurred during upgrade and verify process:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
})();





