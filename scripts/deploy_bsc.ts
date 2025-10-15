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

    // 1. deploy taxManager
    const taxManager = await upgrades.deployProxy(
      await ethers.getContractFactory("TaxManager"),
      [
        process.env.DEPLOYER, // Use deployer as initial owner
        wbnbAddress,
        process.env.AIGC_VAULT, // aigcVault
        process.env.TREASURY,
        process.env.BONDING_REWARD,
      ],
      {
        initialOwner: process.env.DEPLOYER, // Deployer has control initially
      }
    );
    await taxManager.waitForDeployment();
    const taxManagerAddress = await taxManager.getAddress();
    console.log("TaxManager deployed to:", taxManagerAddress);

    await taxManager.connect(deployerSigner).setConfigs(
      {
        creatorShare: process.env.BONDING_CREATOR_SHARE,
        aigcShare: process.env.BONDING_AIGC_SHARE,
      },
      {
        creatorShare: process.env.CREATOR_SHARE,
        aigcShare: process.env.AIGC_SHARE,
      }
    );

    // 2. deploy fFactoryV2
    const fFactoryV2 = await upgrades.deployProxy(
      await ethers.getContractFactory("FFactoryV2"),
      [taxManagerAddress, process.env.BONDING_TAX, process.env.BONDING_TAX],
      {
        initialOwner: process.env.DEPLOYER,
      }
    );
    await fFactoryV2.waitForDeployment();
    const fFactoryV2Address = await fFactoryV2.getAddress();
    console.log("FFactoryV2 deployed to:", fFactoryV2Address);

    // grant ADMIN_ROLE to deployer
    await fFactoryV2
      .connect(deployerSigner)
      .grantRole(await fFactoryV2.ADMIN_ROLE(), process.env.DEPLOYER);

    // 3. deploy fRouter
    const fRouter = await upgrades.deployProxy(
      await ethers.getContractFactory("FRouter"),
      [fFactoryV2Address, wbnbAddress],
      {
        initialOwner: process.env.DEPLOYER,
      }
    );
    await fRouter.waitForDeployment();
    const fRouterAddress = await fRouter.getAddress();
    console.log("FRouter deployed to:", fRouterAddress);

    await fFactoryV2.connect(deployerSigner).setRouter(fRouterAddress);
    console.log("fFactoryV2 set router to:", fRouterAddress);
 
    // 4. deploy launchpadV2
    const launchpadV2 = await upgrades.deployProxy(
      await ethers.getContractFactory("LaunchpadV2"),
      [
        fFactoryV2Address,
        fRouterAddress,
        process.env.TOKEN_INITIAL_SUPPLY,
        parseEther(process.env.GRAD_THRESHOLD!),
      ],
      {
        initialOwner: process.env.DEPLOYER,
      }
    );
    await launchpadV2.waitForDeployment();
    const launchpadV2Address = await launchpadV2.getAddress();
    console.log("LaunchpadV2 deployed to:", launchpadV2Address);

    await taxManager.connect(deployerSigner).setLaunchpad(launchpadV2Address);
    console.log("taxManager set launchpad to:", launchpadV2Address);

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
    await launchpadV2.setDeployParams([
      process.env.ADMIN,
      process.env.UNISWAP_ROUTER,
      supplyParams,
      taxParams,
    ]);
    console.log("launchpadV2 setDeployParams successfully");

    await fFactoryV2
      .connect(deployerSigner)
      .grantRole(await fFactoryV2.CREATOR_ROLE(), launchpadV2Address);
    await fRouter
      .connect(deployerSigner)
      .grantRole(await fRouter.EXECUTOR_ROLE(), launchpadV2Address);

    // 5. transfer ownership to CONTRACT_CONTROLLER
    console.log("\n=== Transferring Ownership and renounce roles ===");
    await taxManager
      .connect(deployerSigner)
      .transferOwnership(process.env.ADMIN);
    console.log("TaxManager ownership transferred to:", process.env.ADMIN);

    await fFactoryV2
      .connect(deployerSigner)
      .grantRole(
        await fFactoryV2.DEFAULT_ADMIN_ROLE(),
        process.env.ADMIN
      );
    await fFactoryV2
      .connect(deployerSigner)
      .renounceRole(
        await fFactoryV2.DEFAULT_ADMIN_ROLE(),
        process.env.DEPLOYER
      );
    await fFactoryV2
      .connect(deployerSigner)
      .renounceRole(await fFactoryV2.ADMIN_ROLE(), process.env.DEPLOYER);
    console.log(
      "FFactoryV2 DEFAULT_ADMIN_ROLE transferred to:",
      process.env.ADMIN
    );

    await fRouter
      .connect(deployerSigner)
      .grantRole(
        await fRouter.DEFAULT_ADMIN_ROLE(),
        process.env.ADMIN
      );
    await fRouter
      .connect(deployerSigner)
      .renounceRole(await fRouter.DEFAULT_ADMIN_ROLE(), process.env.DEPLOYER);
    console.log(
      "FRouter DEFAULT_ADMIN_ROLE transferred to:",
      process.env.ADMIN
    );

    // launchpadV2 transfer ownership to contract controller
    await launchpadV2
      .connect(deployerSigner)
      .transferOwnership(process.env.ADMIN);
    console.log(
      "LaunchpadV2 ownership transferred to:",
      process.env.ADMIN
    );

    // Final summary
    console.log("\n=== Deployment Summary ===");
    console.log("Mock WBNB:   ", wbnbAddress);
    console.log("TaxManager:  ", taxManagerAddress);
    console.log("FFactoryV2:  ", fFactoryV2Address);
    console.log("FRouter:     ", fRouterAddress);
    console.log("LaunchpadV2: ", launchpadV2Address);
    console.log("\n✅ All contracts deployed successfully!");

    // help write verify script for these contracts
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
  } catch (e) {
    console.log(e);
  }
})();
