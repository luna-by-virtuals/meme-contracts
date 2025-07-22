import { parseEther } from "ethers";
import { ethers, upgrades } from "hardhat";

const adminSigner = new ethers.Wallet(
  process.env.ADMIN_PRIVATE_KEY,
  ethers.provider
);

(async () => {
  try {
    const fFactory = await upgrades.deployProxy(
      await ethers.getContractFactory("FFactory"),
      [process.env.BONDING_TAX, process.env.BONDING_TAX],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    await fFactory.waitForDeployment();
    console.log("FFactory deployed to:", fFactory.target);
    await fFactory.grantRole(await fFactory.ADMIN_ROLE(), process.env.DEPLOYER);

    const fRouter = await upgrades.deployProxy(
      await ethers.getContractFactory("FRouter"),
      [fFactory.target, process.env.WETH],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    await fRouter.waitForDeployment();
    console.log("FRouter deployed to:", fRouter.target);
    await fFactory.setRouter(fRouter.target);

    const launchpad = await upgrades.deployProxy(
      await ethers.getContractFactory("Launchpad"),
      [
        fFactory.target,
        fRouter.target,
        process.env.TOKEN_INITIAL_SUPPLY,
        parseEther(process.env.GRAD_THRESHOLD!),
      ],
      {
        initialOwner: process.env.CONTRACT_CONTROLLER,
      }
    );
    await launchpad.waitForDeployment();
    console.log("Launchpad deployed to:", launchpad.target);

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const supplyParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "uint256", "address"],
      [
        process.env.TOKEN_INITIAL_SUPPLY,
        0,
        process.env.TOKEN_INITIAL_SUPPLY,
        process.env.BOT_PROTECTION,
        launchpad.target,
      ]
    );

    const taxParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "address"],
      [
        process.env.TAX,
        process.env.TAX,
        process.env.SWAP_THRESHOLD,
        process.env.TREASURY,
      ]
    );

    await launchpad.setDeployParams([
      process.env.ADMIN,
      process.env.UNISWAP_ROUTER,
      supplyParams,
      taxParams,
    ]);
    await fFactory.grantRole(await fFactory.CREATOR_ROLE(), launchpad.target);
    await fRouter.grantRole(await fRouter.EXECUTOR_ROLE(), launchpad.target);
  } catch (e) {
    console.log(e);
  }
})();
