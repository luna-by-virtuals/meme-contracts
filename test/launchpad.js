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
    const [
      deployer,
      founder,
      trader,
      treasury,
      leaderboardVault,
      acpWallet,
      acpWalletManager,
    ] = await ethers.getSigners();
    return {
      deployer,
      founder,
      trader,
      treasury,
      leaderboardVault,
      acpWallet,
      acpWalletManager,
    };
  };

  async function deployBaseContracts() {
    const { deployer, treasury, leaderboardVault, acpWalletManager } =
      await getAccounts();

    const assetToken = await ethers.deployContract("MockERC20", [
      "WETH",
      "WETH",
    ]);

    ///////////////////////////////////////////////
    // Bonding

    const taxManager = await upgrades.deployProxy(
      await ethers.getContractFactory("TaxManager"),
      [
        deployer.address,
        assetToken.target,
        leaderboardVault.address,
        treasury.address,
      ]
    );
    await taxManager.waitForDeployment();

    const fFactory = await upgrades.deployProxy(
      await ethers.getContractFactory("FFactory"),
      [taxManager.target, process.env.BONDING_TAX, process.env.BONDING_TAX]
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
        taxManager.target,
      ]
    );

    await bonding.setDeployParams([
      process.env.ADMIN,
      process.env.UNISWAP_ROUTER,
      supplyParams,
      taxParams,
    ]);
    await bonding.setAcpManager(acpWalletManager.address);
    await fFactory.grantRole(await fFactory.CREATOR_ROLE(), bonding.target);
    await fRouter.grantRole(await fRouter.EXECUTOR_ROLE(), bonding.target);

    await taxManager.setLaunchpad(bonding.target);
    await taxManager.setLeaderboardVault(leaderboardVault.address);
    await taxManager.setConfigs(
      {
        creatorShare: process.env.BONDING_CREATOR_SHARE,
        leaderboardShare: process.env.BONDING_LEADERBOARD_SHARE,
        acpShare: process.env.BONDING_ACP_SHARE,
      },
      {
        creatorShare: process.env.CREATOR_SHARE,
        leaderboardShare: process.env.LEADERBOARD_SHARE,
        acpShare: process.env.ACP_SHARE,
      }
    );

    return { assetToken, bonding, fRouter, fFactory, taxManager };
  }

  async function launchToken(founder, bonding) {
    const { acpWalletManager, acpWallet } = await getAccounts();
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
    await bonding
      .connect(acpWalletManager)
      .setAcpWallet(tokenInfo.token, acpWallet.address);
    return tokenInfo;
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

    const tokenInfo = await launchToken(founder, bonding);

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

    const tokenInfo = await launchToken(founder, bonding);

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

    await agentToken
      .connect(trader)
      .approve(fRouter.target, await agentToken.balanceOf(trader.address));
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
    expect(await assetToken.balanceOf(trader.address)).to.be.equal(
      BigInt("95000000000000000000")
    );
  });

  it("should be able to graduate", async function () {
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury } = await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    const tokenInfo = await launchToken(founder, bonding);

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

    const tokenInfo = await launchToken(founder, bonding);

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
    expect(await agentToken.balanceOf(founder.address)).to.be.equal(
      transferAmount
    );
  });

  it("should be not allow adding liquidity before graduate", async function () {
    const { assetToken, bonding, fRouter, taxManager } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury } = await getAccounts();

    const tokenInfo = await launchToken(founder, bonding);
    const uniRouter = await ethers.getContractAt(
      "IUniswapV2Router02",
      process.env.UNISWAP_ROUTER
    );
    const uniFactory = await ethers.getContractAt(
      "IUniswapV2Factory",
      await uniRouter.factory()
    );

    const pairAddr = await uniFactory.getPair(
      tokenInfo.token,
      assetToken.target
    );

    await assetToken.connect(trader).mint(trader.address, parseEther("10"));

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);

    await assetToken.connect(trader).approve(fRouter.target, parseEther("10"));

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("5"), tokenInfo.token, "0", now + 300);

    const agentBalance = await agentToken.balanceOf(trader.address);
    const assetBalance = await assetToken.balanceOf(trader.address);

    console.log("Agent balance", formatEther(agentBalance));
    console.log("Asset balance", formatEther(assetBalance));

    await expect(
      agentToken.connect(trader).transfer(pairAddr, agentBalance)
    ).to.be.revertedWithCustomError(agentToken, "NotBonded");
  });

  it("should allow adding liquidity after graduated", async function () {
    const { assetToken, bonding, fRouter, taxManager } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury } = await getAccounts();

    const tokenInfo = await launchToken(founder, bonding);
    const uniRouter = await ethers.getContractAt(
      "IUniswapV2Router02",
      process.env.UNISWAP_ROUTER
    );
    const uniFactory = await ethers.getContractAt(
      "IUniswapV2Factory",
      await uniRouter.factory()
    );

    const pairAddr = await uniFactory.getPair(
      tokenInfo.token,
      assetToken.target
    );

    await assetToken.connect(trader).mint(trader.address, parseEther("100"));

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);

    await assetToken.connect(trader).approve(fRouter.target, parseEther("30"));

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("22"), tokenInfo.token, "0", now + 300);

    expect(await agentToken.fundedDate()).to.be.greaterThan(0);

    const agentBalance = await agentToken.balanceOf(trader.address);
    const assetBalance = await assetToken.balanceOf(trader.address);

    console.log("Agent balance", formatEther(agentBalance));
    console.log("Asset balance", formatEther(assetBalance));

    agentToken.connect(trader).transfer(pairAddr, agentBalance);
    assetToken.connect(trader).transfer(pairAddr, assetBalance);

    const uniPair = await ethers.getContractAt("IUniswapV2Pair", pairAddr);

    await uniPair.mint(trader.address);

    expect(await uniPair.balanceOf(trader.address)).to.be.greaterThan(0);
  });

  it("should be able to claim tax", async function () {
    const { assetToken, bonding, fRouter, taxManager } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury, leaderboardVault, acpWallet } =
      await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    const tokenInfo = await launchToken(founder, bonding);

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);
    expect(await agentToken.balanceOf(trader.address)).to.be.equal(0);

    expect(await assetToken.balanceOf(taxManager.target)).to.be.equal(0);
    expect(await assetToken.balanceOf(treasury.address)).to.be.equal(0);
    expect(await assetToken.balanceOf(founder.address)).to.be.equal(0);

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("5"), tokenInfo.token, "0", now + 300);

    // bought with 5 WETH , tax 1% = 0.05 WETH
    // ACP = 15% = 0.0075 WETH
    // Leaderboard = 5% = 0.0025 WETH
    // Creator = 0
    // Treasury = 80% = 0.04 WETH

    expect(await assetToken.balanceOf(taxManager.target)).to.be.equal(
      parseEther("0.05")
    );

    expect(await taxManager.taxes(founder.address)).to.be.equal(0);
    expect(await taxManager.taxes(treasury.address)).to.be.equal(
      parseEther("0.04")
    );
    expect(await taxManager.leaderboardTaxes(agentToken.target)).to.be.equal(
      parseEther("0.0025")
    );
    expect(await taxManager.acpTaxes(agentToken.target)).to.be.equal(
      parseEther("0.0075")
    );

    await taxManager
      .connect(founder)
      .claimTax(await taxManager.taxes(founder.address));
    await taxManager
      .connect(treasury)
      .claimTax(await taxManager.taxes(treasury.address));
    // try double claim
    await taxManager
      .connect(treasury)
      .claimTax(await taxManager.taxes(treasury.address));

    await expect(
      taxManager.claimLeaderboardTax(
        tokenInfo.token,
        await taxManager.leaderboardTaxes(agentToken.target)
      )
    ).to.be.reverted;

    await expect(
      taxManager.claimAcpTax(
        tokenInfo.token,
        await taxManager.acpTaxes(agentToken.target)
      )
    ).to.be.reverted;

    await taxManager
      .connect(leaderboardVault)
      .claimLeaderboardTax(
        tokenInfo.token,
        await taxManager.leaderboardTaxes(agentToken.target)
      );

    await taxManager
      .connect(acpWallet)
      .claimAcpTax(
        tokenInfo.token,
        await taxManager.acpTaxes(agentToken.target)
      );

    expect(await assetToken.balanceOf(taxManager.target)).to.be.equal(0);
    expect(await assetToken.balanceOf(treasury.address)).to.be.equal(
      parseEther("0.04")
    );
    expect(await assetToken.balanceOf(founder.address)).to.be.equal(0);
    expect(await assetToken.balanceOf(leaderboardVault.address)).to.be.equal(
      parseEther("0.0025")
    );
    expect(await assetToken.balanceOf(acpWallet.address)).to.be.equal(
      parseEther("0.0075")
    );
  });

  it("should be able to claim tax after graduate", async function () {
    const { assetToken, bonding, fRouter, taxManager } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader, treasury, leaderboardVault, acpWallet } =
      await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    const tokenInfo = await launchToken(founder, bonding);

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);
    expect(await agentToken.balanceOf(trader.address)).to.be.equal(0);

    expect(await assetToken.balanceOf(taxManager.target)).to.be.equal(0);
    expect(await assetToken.balanceOf(treasury.address)).to.be.equal(0);
    expect(await assetToken.balanceOf(founder.address)).to.be.equal(0);

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("22"), tokenInfo.token, "0", now + 300);

    expect(await agentToken.fundedDate()).to.be.greaterThan(0);

    // Claim and clear pre-bonding taxes first
    await taxManager
      .connect(founder)
      .claimTax(await taxManager.taxes(founder.address));
    await taxManager
      .connect(treasury)
      .claimTax(await taxManager.taxes(treasury.address));
    await taxManager
      .connect(leaderboardVault)
      .claimLeaderboardTax(
        tokenInfo.token,
        await taxManager.leaderboardTaxes(agentToken.target)
      );
    await taxManager
      .connect(acpWallet)
      .claimAcpTax(
        tokenInfo.token,
        await taxManager.acpTaxes(agentToken.target)
      );

    const burnAddr = "0x0000000000000000000000000000000000000001";
    await assetToken
      .connect(treasury)
      .transfer(burnAddr, await assetToken.balanceOf(treasury.address));
    await assetToken
      .connect(leaderboardVault)
      .transfer(burnAddr, await assetToken.balanceOf(leaderboardVault.address));
    await assetToken
      .connect(acpWallet)
      .transfer(burnAddr, await assetToken.balanceOf(acpWallet.address));
    await agentToken
      .connect(trader)
      .transfer(burnAddr, await agentToken.balanceOf(trader.address));
    /////// start trading on uniswap

    const uniRouter = await ethers.getContractAt(
      "IUniswapV2Router02",
      process.env.UNISWAP_ROUTER
    );

    await assetToken.connect(trader).approve(uniRouter.target, parseEther("1"));

    await uniRouter
      .connect(trader)
      .swapExactTokensForTokensSupportingFeeOnTransferTokens(
        parseEther("1"),
        "0",
        [assetToken.target, tokenInfo.token],
        trader.address,
        now + 300
      );

    // Make sure the agent token is bought
    expect(await agentToken.balanceOf(trader.address)).to.be.greaterThan(0);
    // Has pending token to swap
    expect(await agentToken.projectTaxPendingSwap()).to.be.greaterThan(0);
    // The swap will happen in next transfer
    await agentToken.connect(trader).transfer(trader.address, 0);

    expect(await agentToken.projectTaxPendingSwap()).to.be.equal(0);
    const taxReceived = await assetToken.balanceOf(taxManager.target);
    expect(taxReceived).to.be.greaterThan(0);

    await taxManager
      .connect(founder)
      .claimTax(await taxManager.taxes(founder.address));
    await taxManager
      .connect(treasury)
      .claimTax(await taxManager.taxes(treasury.address));
    await taxManager
      .connect(leaderboardVault)
      .claimLeaderboardTax(
        tokenInfo.token,
        await taxManager.leaderboardTaxes(agentToken.target)
      );
    await taxManager
      .connect(acpWallet)
      .claimAcpTax(
        tokenInfo.token,
        await taxManager.acpTaxes(agentToken.target)
      );

    // Tax amount = 0.003118515866000351 WETH
    // ACP = 50% = 0.001559257933000175 WETH
    // Leaderboard = 16.67% = 0.000519856594862258 WETH
    // Creator = 16.67% = 0.000519856594862258 WETH
    // Treasury = 16.66% = 0.00051954474327566 WETH

    expect(await assetToken.balanceOf(taxManager.target)).to.be.equal(0);


    expect(
      formatEther(await assetToken.balanceOf(treasury.address))
    ).to.be.equal("0.00051954474327566");
    expect(
      formatEther(await assetToken.balanceOf(acpWallet.address))
    ).to.be.equal("0.001559257933000175");
    expect(
      formatEther(await assetToken.balanceOf(leaderboardVault.address))
    ).to.be.equal("0.000519856594862258");
    expect(
      formatEther(await assetToken.balanceOf(founder.address))
    ).to.be.equal("0.000519856594862258");
  });
});
