/*
Test the bonding curve with single token
*/

const { parseEther, toBeHex, formatEther } = require("ethers/utils");
const { expect } = require("chai");
const {
  loadFixture,
  mine,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Launchpad", function () {
  const tokenInput = {
    name: "GREEN PEPE",
    symbol: "PEPE",
    twitter: "@pepe",
  };

  const getAccounts = async () => {
    const [deployer, founder, trader, treasury] = await ethers.getSigners();
    return { deployer, founder, trader, treasury };
  };

  async function deployBaseContracts() {
    const { deployer, treasury } = await getAccounts();

    const assetToken = await ethers.deployContract("MockERC20", [
      "WETH",
      "WETH",
    ]);

    ///////////////////////////////////////////////
    // Bonding

    const fFactory = await upgrades.deployProxy(
      await ethers.getContractFactory("FFactory"),
      [process.env.BONDING_TAX, process.env.BONDING_TAX]
    );
    await fFactory.waitForDeployment();
    await fFactory.grantRole(await fFactory.ADMIN_ROLE(), deployer);

    const fRouter = await upgrades.deployProxy(
      await ethers.getContractFactory("FRouter"),
      [fFactory.target, assetToken.target]
    );
    await fRouter.waitForDeployment();
    await fFactory.setRouter(fRouter.target);

    const bonding = await upgrades.deployProxy(
      await ethers.getContractFactory("Launchpad"),
      [
        fFactory.target,
        fRouter.target,
        process.env.TOKEN_INITIAL_SUPPLY,
        parseEther(process.env.GRAD_THRESHOLD),
      ]
    );

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const supplyParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "uint256", "address"],
      [
        process.env.TOKEN_INITIAL_SUPPLY,
        0,
        process.env.TOKEN_INITIAL_SUPPLY,
        process.env.BOT_PROTECTION,
        bonding.target,
      ]
    );

    const taxParams = abiCoder.encode(
      ["uint256", "uint256", "uint256", "address"],
      [
        process.env.TAX,
        process.env.TAX,
        process.env.SWAP_THRESHOLD,
        treasury.address,
      ]
    );

    await bonding.setDeployParams([
      process.env.ADMIN,
      process.env.UNISWAP_ROUTER,
      supplyParams,
      taxParams,
    ]);
    await fFactory.grantRole(await fFactory.CREATOR_ROLE(), bonding.target);
    await fRouter.grantRole(await fRouter.EXECUTOR_ROLE(), bonding.target);

    return { assetToken, bonding, fRouter, fFactory };
  }

  before(async function () {});

  it("should be able to launch memecoin", async function () {
    const { assetToken, bonding } = await loadFixture(deployBaseContracts);
    const { founder } = await getAccounts();

    const initialPurchase = parseEther("0.1");
    await assetToken.mint(founder.address, initialPurchase);
    await assetToken.connect(founder).approve(bonding.target, initialPurchase);

    await bonding
      .connect(founder)
      .launch(
        tokenInput.name,
        tokenInput.symbol,
        "it is a cat",
        "https://cat.png",
        [tokenInput.twitter, "", "", ""],
        initialPurchase,
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );

    const tokenInfo = await bonding.tokenInfo(bonding.tokenInfos(0));
    const token = await ethers.getContractAt("ERC20", tokenInfo.token);

    const pair = await ethers.getContractAt("FPair", tokenInfo.pair);
    const [r1, r2] = await pair.getReserves();

    console.log("Reserves", formatEther(r1), formatEther(r2));

    expect(formatEther(await assetToken.balanceOf(tokenInfo.pair))).to.be.equal(
      "0.099"
    );
    expect(
      formatEther(await assetToken.balanceOf(founder.address))
    ).to.be.equal("0.0");

    expect(formatEther(await token.balanceOf(founder.address))).to.be.equal(
      "36343612.334801762114537445"
    );
  });

  it("should be able to buy", async function () {
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury } = await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    await bonding
      .connect(founder)
      .launch(
        tokenInput.name,
        tokenInput.symbol,
        "it is a cat",
        "https://cat.png",
        [tokenInput.twitter, "", "", ""],
        0,
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );

    const tokenInfo = await bonding.tokenInfo(await bonding.tokenInfos(0));

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);
    expect(await agentToken.balanceOf(trader.address)).to.be.equal(0);

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("5"), tokenInfo.token, "0", now + 300);

    const newInfo = await bonding.tokenInfo(tokenInfo.token);

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(newInfo.tradingOnUniswap).to.be.equal(false);
    expect(await agentToken.balanceOf(trader.address)).to.be.equal(
      BigInt("653465346534653465346534654")
    );
  });

  it("should be able to sell", async function () {
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury } = await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    await bonding
      .connect(founder)
      .launch(
        tokenInput.name,
        tokenInput.symbol,
        "it is a cat",
        "https://cat.png",
        [tokenInput.twitter, "", "", ""],
        0,
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );

    const tokenInfo = await bonding.tokenInfo(await bonding.tokenInfos(0));

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);
    expect(await agentToken.balanceOf(trader.address)).to.be.equal(0);

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("5"), tokenInfo.token, "0", now + 300);

    expect(await agentToken.balanceOf(trader.address)).to.be.greaterThan(0);

    await agentToken.connect(trader).approve(fRouter.target, await agentToken.balanceOf(trader.address));
    await bonding
      .connect(trader)
      .sell(
        await agentToken.balanceOf(trader.address),
        tokenInfo.token,
        "0",
        now + 300
      );

    const newInfo = await bonding.tokenInfo(tokenInfo.token);

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(newInfo.tradingOnUniswap).to.be.equal(false);
    expect(await agentToken.balanceOf(trader.address)).to.be.equal(0);
    expect(await assetToken.balanceOf(trader.address)).to.be.equal(BigInt("95000000000000000000"));
  });

  it("should be able to graduate", async function () {
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury } = await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    await bonding
      .connect(founder)
      .launch(
        tokenInput.name,
        tokenInput.symbol,
        "it is a cat",
        "https://cat.png",
        [tokenInput.twitter, "", "", ""],
        0,
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );

    const tokenInfo = await bonding.tokenInfo(await bonding.tokenInfos(0));

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("21.23"), tokenInfo.token, "0", now + 300);

    const newInfo = await bonding.tokenInfo(tokenInfo.token);

    expect(
      parseInt((await agentToken.fundedDate()).toString())
    ).to.be.greaterThan(0);
    expect(newInfo.tradingOnUniswap).to.be.equal(true);
    expect(await assetToken.balanceOf(tokenInfo.pair)).to.be.equal(0);
    expect(await agentToken.balanceOf(tokenInfo.pair)).to.be.equal(0);
  });

  it("should be able to transfer token", async function () {
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury } = await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    await bonding
      .connect(founder)
      .launch(
        tokenInput.name,
        tokenInput.symbol,
        "it is a cat",
        "https://cat.png",
        [tokenInput.twitter, "", "", ""],
        0,
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );

    const tokenInfo = await bonding.tokenInfo(await bonding.tokenInfos(0));

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);
    expect(await agentToken.balanceOf(trader.address)).to.be.equal(0);
    expect(await agentToken.balanceOf(founder.address)).to.be.equal(0);

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("5"), tokenInfo.token, "0", now + 300);

    const transferAmount = await agentToken.balanceOf(trader.address);
    await agentToken.connect(trader).transfer(founder.address, transferAmount);

    expect(await agentToken.balanceOf(trader.address)).to.be.equal(0);
    expect(await agentToken.balanceOf(founder.address)).to.be.equal(transferAmount);
  });

  xit("should be not allow adding liquidity before graduate", async function () {});
  xit("should allow adding liquidity after graduated", async function () {});
  xit("should be able to claim tax", async function () {});
});
