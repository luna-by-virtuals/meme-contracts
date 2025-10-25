import { parseEther } from "ethers";
import { ethers, upgrades } from "hardhat";


const adminSigner = new ethers.Wallet(
  process.env.ADMIN_PRIVATE_KEY,
  ethers.provider
);

const deployerSigner = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  ethers.provider
);

(async () => {
  try {
    // Use mockWBNB address instead of process.env.WBNB
    const wbnbAddress = process.env.WBNB;
    console.log("Using WBNB address:", wbnbAddress);
    
    console.log("Starting deployment process...");
    console.log("Environment variables check:");
    console.log("- DEPLOYER:", process.env.DEPLOYER);
    console.log("- ADMIN:", process.env.ADMIN);
    console.log("- CONTRACT_CONTROLLER:", process.env.CONTRACT_CONTROLLER);
    console.log("- TREASURY:", process.env.TREASURY);
    console.log("- AIGC_VAULT:", process.env.AIGC_VAULT);
    console.log("- BONDING_REWARD:", process.env.BONDING_REWARD);
    console.log("- RPC:", process.env.RPC);
    
    // Verify that deployer and admin addresses match the signers
    console.log("Signer verification:");
    console.log("- Deployer signer address:", deployerSigner.address);
    console.log("- Admin signer address:", adminSigner.address);
    console.log("- DEPLOYER env matches deployer signer:", process.env.DEPLOYER === deployerSigner.address);
    console.log("- ADMIN env matches admin signer:", process.env.ADMIN === adminSigner.address);

    // Check deployer balance
    const deployerBalance = await ethers.provider.getBalance(deployerSigner.address);
    console.log("Deployer balance:", ethers.formatEther(deployerBalance), "BNB");
    
    // Check admin balance
    const adminBalance = await ethers.provider.getBalance(adminSigner.address);
    console.log("Admin balance:", ethers.formatEther(adminBalance), "BNB");

    // 1. deploy taxManager
    // Note on ownership:
    // - initialOwner (CONTRACT_CONTROLLER): Controls proxy upgrades
    // - initialize owner param (DEPLOYER): Controls business logic (onlyOwner functions)
    console.log("Deploying TaxManager...");
    const taxManager = await upgrades.deployProxy(
      await ethers.getContractFactory("TaxManager"),
      [
        process.env.ADMIN, // Business logic owner (can call setLaunchpad, setConfigs, etc.)
        wbnbAddress,
        process.env.AIGC_VAULT,
        process.env.TREASURY,
        process.env.BONDING_REWARD,
      ],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER, // Proxy admin (can upgrade contract)
      }
    );
    console.log("TaxManager proxy deployment initiated, waiting for deployment...");
    await taxManager.waitForDeployment();
    const taxManagerAddress = await taxManager.getAddress();
    console.log("TaxManager deployed to:", taxManagerAddress);
    console.log("TaxManager deployment completed successfully");

    console.log("Setting TaxManager configs...");
    await taxManager.connect(adminSigner).setConfigs(
      {
        creatorShare: process.env.BONDING_CREATOR_SHARE,
        aigcShare: process.env.BONDING_AIGC_SHARE,
      },
      {
        creatorShare: process.env.CREATOR_SHARE,
        aigcShare: process.env.AIGC_SHARE,
      }
    );
    console.log("TaxManager configs set successfully");

    // 2. deploy fFactoryV2
    console.log("Deploying FFactoryV2...");
    const fFactoryV2 = await upgrades.deployProxy(
      await ethers.getContractFactory("FFactoryV2"),
      [taxManagerAddress, process.env.BONDING_TAX, process.env.BONDING_TAX],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    console.log("FFactoryV2 proxy deployment initiated, waiting for deployment...");
    await fFactoryV2.waitForDeployment();
    const fFactoryV2Address = await fFactoryV2.getAddress();
    console.log("FFactoryV2 deployed to:", fFactoryV2Address);
    console.log("FFactoryV2 deployment completed successfully");
    
    // Check initial roles after deployment
    console.log("Checking FFactoryV2 initial roles:");
    const defaultAdminRole = await fFactoryV2.DEFAULT_ADMIN_ROLE();
    const adminRole = await fFactoryV2.ADMIN_ROLE();
    const creatorRole = await fFactoryV2.CREATOR_ROLE();
    
    console.log("DEFAULT_ADMIN_ROLE:", defaultAdminRole);
    console.log("ADMIN_ROLE:", adminRole);
    console.log("CREATOR_ROLE:", creatorRole);
    
    const deployerHasDefaultAdmin = await fFactoryV2.hasRole(defaultAdminRole, deployerSigner.address);
    const contractControllerHasDefaultAdmin = await fFactoryV2.hasRole(defaultAdminRole, process.env.CONTRACT_CONTROLLER);
    
    console.log("Deployer has DEFAULT_ADMIN_ROLE:", deployerHasDefaultAdmin);
    console.log("CONTRACT_CONTROLLER has DEFAULT_ADMIN_ROLE:", contractControllerHasDefaultAdmin);

    // 3. deploy fRouter
    console.log("Deploying FRouter...");
    const fRouter = await upgrades.deployProxy(
      await ethers.getContractFactory("FRouter"),
      [fFactoryV2Address, wbnbAddress],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    console.log("FRouter proxy deployment initiated, waiting for deployment...");
    await fRouter.waitForDeployment();
    const fRouterAddress = await fRouter.getAddress();
    console.log("FRouter deployed to:", fRouterAddress);
    console.log("FRouter deployment completed successfully");

    // Grant ADMIN_ROLE to admin before calling setRouter
    console.log("Granting ADMIN_ROLE to admin and setting router...");
    console.log("Deployer address:", deployerSigner.address);
    console.log("Admin address:", adminSigner.address);
    console.log("ADMIN_ROLE:", await fFactoryV2.ADMIN_ROLE());
    
    // Check if deployer has DEFAULT_ADMIN_ROLE before trying to grant roles
    const deployerCanGrant = await fFactoryV2.hasRole(await fFactoryV2.DEFAULT_ADMIN_ROLE(), deployerSigner.address);
    console.log("Deployer can grant roles (has DEFAULT_ADMIN_ROLE):", deployerCanGrant);
    
    if (!deployerCanGrant) {
      console.log("Deployer doesn't have DEFAULT_ADMIN_ROLE, trying to use CONTRACT_CONTROLLER...");
      // Try to use CONTRACT_CONTROLLER to grant the role
      const contractControllerSigner = new ethers.Wallet(
        process.env.CONTRACT_CONTROLLER_PRIVATE_KEY!,
        ethers.provider
      );
      const grantTx = await fFactoryV2.connect(contractControllerSigner).grantRole(await fFactoryV2.ADMIN_ROLE(), process.env.ADMIN);
      console.log("Grant role transaction hash:", grantTx.hash);
      await grantTx.wait();
    } else {
      const grantTx = await fFactoryV2.connect(deployerSigner).grantRole(await fFactoryV2.ADMIN_ROLE(), process.env.ADMIN);
      console.log("Grant role transaction hash:", grantTx.hash);
      await grantTx.wait(); // Wait for the transaction to be confirmed
    }
    
    console.log("ADMIN_ROLE granted successfully");
    
    // Verify the role was granted
    const hasRole = await fFactoryV2.hasRole(await fFactoryV2.ADMIN_ROLE(), process.env.ADMIN);
    console.log("Admin has ADMIN_ROLE:", hasRole);
    
    if (!hasRole) {
      throw new Error("ADMIN_ROLE was not granted successfully");
    }
    
    await fFactoryV2.connect(adminSigner).setRouter(fRouterAddress);
    console.log("fFactoryV2 set router to:", fRouterAddress);
    console.log("Router setup completed successfully");

    // 4. deploy launchpadV2
    console.log("Deploying LaunchpadV2...");
    const launchpadV2 = await upgrades.deployProxy(
      await ethers.getContractFactory("LaunchpadV2"),
      [
        fFactoryV2Address,
        fRouterAddress,
        process.env.TOKEN_INITIAL_SUPPLY,
        parseEther(process.env.GRAD_THRESHOLD!),
      ],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    console.log("LaunchpadV2 proxy deployment initiated, waiting for deployment...");
    await launchpadV2.waitForDeployment();
    const launchpadV2Address = await launchpadV2.getAddress();
    console.log("LaunchpadV2 deployed to:", launchpadV2Address);
    console.log("LaunchpadV2 deployment completed successfully");

    console.log("Setting launchpad in TaxManager...");
    await taxManager.connect(adminSigner).setLaunchpad(launchpadV2Address);
    console.log("taxManager set launchpad to:", launchpadV2Address);
    console.log("Launchpad set in TaxManager successfully");

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const supplyParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "uint256", "address"],
      [
        process.env.TOKEN_INITIAL_SUPPLY,
        0,
        process.env.TOKEN_INITIAL_SUPPLY,
        process.env.BOT_PROTECTION,
        launchpadV2Address,
      ]
    );
    const taxParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "address"],
      [
        process.env.TAX,
        process.env.TAX,
        process.env.SWAP_THRESHOLD,
        taxManagerAddress,
      ]
    );
    console.log("Setting deploy params for LaunchpadV2...");
    await launchpadV2.connect(deployerSigner).setDeployParams([
      process.env.ADMIN,
      process.env.UNISWAP_ROUTER,
      supplyParams,
      taxParams,
    ]);
    console.log("launchpadV2 setDeployParams successfully");
    console.log("Deploy params set successfully");

    console.log("Granting roles to LaunchpadV2...");
    await fFactoryV2
      .connect(deployerSigner)
      .grantRole(await fFactoryV2.CREATOR_ROLE(), launchpadV2Address);
    await fRouter
      .connect(deployerSigner)
      .grantRole(await fRouter.EXECUTOR_ROLE(), launchpadV2Address);
    console.log("Roles granted successfully");

    // 5. Transfer business logic ownership to ADMIN
    // Note: Proxy admin (CONTRACT_CONTROLLER) remains unchanged and can still upgrade contracts
    console.log("\n=== Transferring Business Logic Ownership ===");
    console.log("Starting ownership transfer process...");
    // TaxManager already owned by ADMIN (set during initialization)
    console.log("TaxManager already owned by:", process.env.ADMIN);
    console.log("TaxManager ownership already correct");

    console.log("Transferring FFactoryV2 DEFAULT_ADMIN_ROLE...");
    await fFactoryV2
      .connect(deployerSigner)
      .grantRole(await fFactoryV2.DEFAULT_ADMIN_ROLE(), process.env.ADMIN);
    await fFactoryV2
      .connect(deployerSigner)
      .renounceRole(
        await fFactoryV2.DEFAULT_ADMIN_ROLE(),
        process.env.DEPLOYER
      );
    console.log(
      "FFactoryV2 DEFAULT_ADMIN_ROLE transferred to:",
      process.env.ADMIN
    );
    console.log("FFactoryV2 ownership transfer completed");

    console.log("Transferring FRouter DEFAULT_ADMIN_ROLE...");
    await fRouter
      .connect(deployerSigner)
      .grantRole(await fRouter.DEFAULT_ADMIN_ROLE(), process.env.ADMIN);
    await fRouter
      .connect(deployerSigner)
      .renounceRole(await fRouter.DEFAULT_ADMIN_ROLE(), process.env.DEPLOYER);
    console.log(
      "FRouter DEFAULT_ADMIN_ROLE transferred to:",
      process.env.ADMIN
    );
    console.log("FRouter ownership transfer completed");

    // launchpadV2 transfer ownership to contract controller
    console.log("Transferring LaunchpadV2 ownership...");
    await launchpadV2
      .connect(deployerSigner)
      .transferOwnership(process.env.ADMIN);
    console.log("LaunchpadV2 ownership transferred to:", process.env.ADMIN);
    console.log("LaunchpadV2 ownership transfer completed");

    // Final summary
    console.log("Generating final deployment summary...");
    console.log("\n=== Deployment Summary ===");
    console.log("Mock WBNB:   ", wbnbAddress);
    console.log("TaxManager:  ", taxManagerAddress);
    console.log("FFactoryV2:  ", fFactoryV2Address);
    console.log("FRouter:     ", fRouterAddress);
    console.log("LaunchpadV2: ", launchpadV2Address);
    console.log("\n✅ All contracts deployed successfully!");
    console.log("Deployment completed successfully!");

    // help write verify script for these contracts
    console.log("Generating verification commands...");
    console.log("\n=== Verify Script by running below script ===");
    console.log(
      "npx hardhat verify --network bsc_testnet <contract_address> <constructor_arguments>"
    );
    console.log(
      "npx hardhat verify --network bsc_testnet ",
      taxManagerAddress,
      " ",
      process.env.ADMIN,
      " ",
      wbnbAddress,
      " ",
      process.env.AIGC_VAULT,
      " ",
      process.env.TREASURY,
      " ",
      process.env.BONDING_REWARD
    );
    console.log(
      "npx hardhat verify --network bsc_testnet ",
      fFactoryV2Address,
      " ",
      taxManagerAddress,
      " ",
      process.env.BONDING_TAX,
      " ",
      process.env.BONDING_TAX
    );
    console.log(
      "npx hardhat verify --network bsc_testnet ",
      fRouterAddress,
      " ",
      fFactoryV2Address,
      " ",
      wbnbAddress
    );
    console.log(
      "npx hardhat verify --network bsc_testnet ",
      launchpadV2Address,
      " ",
      fFactoryV2Address,
      " ",
      fRouterAddress,
      " ",
      process.env.TOKEN_INITIAL_SUPPLY,
      " ",
      parseEther(process.env.GRAD_THRESHOLD!)
    );
    console.log("Verification commands generated successfully");
  } catch (e) {
    console.log("Error occurred during deployment:", e);
    console.log("Deployment failed with error:", e);
  }
})();
