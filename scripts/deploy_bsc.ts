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
    const taxManager = await upgrades.deployProxy(
      await ethers.getContractFactory("TaxManager"),
      [process.env.ADMIN, process.env.WBNB, process.env.ADMIN, process.env.TREASURY, process.env.BONDING_REWARD],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    await taxManager.waitForDeployment();
    console.log("TaxManager deployed to:", taxManager.target);

    const fFactoryV2 = await upgrades.deployProxy(
      await ethers.getContractFactory("FFactoryV2"),
      [taxManager.target, process.env.BONDING_TAX, process.env.BONDING_TAX],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    await fFactoryV2.waitForDeployment();
    console.log("FFactoryV2 deployed to:", fFactoryV2.target);
    await fFactoryV2.grantRole(await fFactoryV2.ADMIN_ROLE(), process.env.DEPLOYER);

    const fRouter = await upgrades.deployProxy(
      await ethers.getContractFactory("FRouter"),
      [fFactoryV2.target, process.env.WBNB],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    await fRouter.waitForDeployment();
    console.log("FRouter deployed to:", fRouter.target);
    await fFactoryV2.connect(deployerSigner).setRouter(fRouter.target);

    const launchpadV2 = await upgrades.deployProxy(
      await ethers.getContractFactory("LaunchpadV2"),
      [
        fFactoryV2.target,
        fRouter.target,
        process.env.TOKEN_INITIAL_SUPPLY,
        parseEther(process.env.GRAD_THRESHOLD!),
      ],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    await launchpadV2.waitForDeployment();
    console.log("LaunchpadV2 deployed to:", launchpadV2.target);

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const supplyParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "uint256", "address"],
      [
        process.env.TOKEN_INITIAL_SUPPLY,
        0,
        process.env.TOKEN_INITIAL_SUPPLY,
        process.env.BOT_PROTECTION,
        launchpadV2.target,
      ]
    );

    const taxParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "address"],
      [
        process.env.TAX,
        process.env.TAX,
        process.env.SWAP_THRESHOLD,
        taxManager.target,
      ]
    );

    await launchpadV2.setDeployParams([
      process.env.ADMIN,
      process.env.UNISWAP_ROUTER,
      supplyParams,
      taxParams,
    ]);
    await fFactoryV2.connect(deployerSigner).grantRole(await fFactoryV2.CREATOR_ROLE(), launchpadV2.target);
    await fRouter.connect(deployerSigner).grantRole(await fRouter.EXECUTOR_ROLE(), launchpadV2.target);
    await taxManager.connect(deployerSigner).setLaunchpad(launchpadV2.target);
  } catch (e) {
    console.log(e);
  }
})();
