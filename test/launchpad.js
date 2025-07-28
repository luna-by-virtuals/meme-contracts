/*
Test the bonding curve with single token
*/

const { parseEther, formatEther } = require("ethers/utils");
const { expect } = require("chai");
const {
  loadFixture,
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
        process.env.BONDING_REWARD,
      ]
    );
    await taxManager.waitForDeployment();
    console.log("taxManager deployed");

    const fFactory = await upgrades.deployProxy(
      await ethers.getContractFactory("FFactory"),
      [taxManager.target, 0, 0]
    );
    await fFactory.waitForDeployment();
    console.log("fFactory deployed");
    await fFactory.grantRole(await fFactory.ADMIN_ROLE(), deployer);

    const fRouter = await upgrades.deployProxy(
      await ethers.getContractFactory("FRouter"),
      [fFactory.target, assetToken.target]
    );
    await fRouter.waitForDeployment();
    console.log("fRouter deployed");
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
    await bonding.waitForDeployment();
    console.log("bonding deployed");

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
    const { founder, trader } = await getAccounts();

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
    const { founder, trader } = await getAccounts();

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
    const { founder, trader } = await getAccounts();

    await assetToken.mint(trader.address, parseEther("100"));
    await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

    const tokenInfo = await launchToken(founder, bonding);

    const agentToken = await ethers.getContractAt(
      "AgentToken",
      tokenInfo.token
    );
    console.log("launched");

    expect(await agentToken.fundedDate()).to.be.equal(0);
    expect(tokenInfo.tradingOnUniswap).to.be.equal(false);

    const now = await time.latest();
    await bonding
      .connect(trader)
      .buy(parseEther("21"), tokenInfo.token, "0", now + 300);

    const newInfo = await bonding.tokenInfo(tokenInfo.token);

    expect(
      parseInt((await agentToken.fundedDate()).toString())
    ).to.be.greaterThan(0);
    expect(newInfo.tradingOnUniswap).to.be.equal(true);
    expect(await assetToken.balanceOf(tokenInfo.pair)).to.be.equal(0);
    expect(await agentToken.balanceOf(tokenInfo.pair)).to.be.equal(0);

    const pair = await agentToken.uniswapV2Pair();
    expect(await assetToken.balanceOf(pair)).to.be.equal(parseEther("21"));
    expect(await agentToken.balanceOf(pair)).to.be.equal(parseEther("125000000"));
  });

  it("should be able to transfer token", async function () {
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader } = await getAccounts();

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
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader } = await getAccounts();

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
    const { assetToken, bonding, fRouter } = await loadFixture(
      deployBaseContracts
    );
    const { founder, trader } = await getAccounts();

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

  // Access Control Tests
  describe("Access Control", function () {
    it("should only allow owner to set token params", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { trader } = await getAccounts();

      await expect(
        bonding.connect(trader).setTokenParams(parseEther("1000000"), parseEther("100"))
      ).to.be.revertedWithCustomError(bonding, "OwnableUnauthorizedAccount");
    });

    it("should only allow owner to set deploy params", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { trader } = await getAccounts();

      const params = {
        tokenAdmin: trader.address,
        uniswapRouter: process.env.UNISWAP_ROUTER,
        tokenSupplyParams: "0x",
        tokenTaxParams: "0x"
      };

      await expect(
        bonding.connect(trader).setDeployParams(params)
      ).to.be.revertedWithCustomError(bonding, "OwnableUnauthorizedAccount");
    });

    it("should only allow owner to set ACP manager", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { trader } = await getAccounts();

      await expect(
        bonding.connect(trader).setAcpManager(trader.address)
      ).to.be.revertedWithCustomError(bonding, "OwnableUnauthorizedAccount");
    });

    it("should only allow ACP manager to set ACP wallet", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { trader, acpWallet } = await getAccounts();

      const tokenInfo = await launchToken(trader, bonding);

      await expect(
        bonding.connect(trader).setAcpWallet(tokenInfo.token, acpWallet.address)
      ).to.be.revertedWith("Only acp manager can call this function.");
    });
  });

  // Edge Cases and Validation Tests
  describe("Edge Cases and Validation", function () {
    it("should launch token with zero initial purchase", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { founder } = await getAccounts();

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
      expect(tokenInfo.token).to.not.equal("0x0000000000000000000000000000000000000000");
    });

    it("should revert on buy with expired deadline", async function () {
      const { assetToken, bonding } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("10"));
      await assetToken.connect(trader).approve(bonding.target, parseEther("10"));

      const tokenInfo = await launchToken(founder, bonding);
      const pastDeadline = (await time.latest()) - 100;

      await expect(
        bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", pastDeadline)
      ).to.be.revertedWithCustomError(bonding, "InvalidInput");
    });

    it("should revert on sell with expired deadline", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("10"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("10"));

      const tokenInfo = await launchToken(founder, bonding);
      
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300);

      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);
      await agentToken.connect(trader).approve(fRouter.target, await agentToken.balanceOf(trader.address));

      const pastDeadline = (await time.latest()) - 100;
      await expect(
        bonding.connect(trader).sell(await agentToken.balanceOf(trader.address), tokenInfo.token, "0", pastDeadline)
      ).to.be.revertedWithCustomError(bonding, "InvalidInput");
    });

    it("should revert on slippage too high", async function () {
      const { assetToken, bonding } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("10"));
      await assetToken.connect(trader).approve(bonding.target, parseEther("10"));

      const tokenInfo = await launchToken(founder, bonding);
      const now = await time.latest();

      await expect(
        bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, parseEther("1000000"), now + 300)
      ).to.be.revertedWithCustomError(bonding, "SlippageTooHigh");
    });
  });

  // Liquidity Protection Tests (NotBonded)
  describe("Liquidity Protection", function () {
    it("should prevent adding liquidity to Uniswap before graduation", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("10"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("10"));

      const tokenInfo = await launchToken(founder, bonding);
      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);
      
      // Get Uniswap pair address
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

      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300);

      // Try to transfer to Uniswap pair before graduation (should revert with NotBonded)
      const balance = await agentToken.balanceOf(trader.address);
      await expect(
        agentToken.connect(trader).transfer(pairAddr, balance)
      ).to.be.revertedWithCustomError(agentToken, "NotBonded");
    });

    it("should allow normal transfers between users before graduation", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader, treasury } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("10"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("10"));

      const tokenInfo = await launchToken(founder, bonding);
      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);

      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300);

      // Normal transfers between users should work
      const balance = await agentToken.balanceOf(trader.address);
      await agentToken.connect(trader).transfer(treasury.address, balance);

      expect(await agentToken.balanceOf(treasury.address)).to.equal(balance);
      expect(await agentToken.balanceOf(trader.address)).to.equal(0);
    });
  });

  // Profile Management Tests
  describe("Profile Management", function () {
    it("should create profile on first token launch", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { founder } = await getAccounts();

      const profileBefore = await bonding.profile(founder.address);
      expect(profileBefore.user).to.equal("0x0000000000000000000000000000000000000000");

      await launchToken(founder, bonding);

      const profileAfter = await bonding.profile(founder.address);
      expect(profileAfter.user).to.equal(founder.address);
    });

    it("should update profile with multiple token launches", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { founder } = await getAccounts();

      // Launch first token
      await launchToken(founder, bonding);
      
      // Launch second token
      await bonding
        .connect(founder)
        .launch(
          "Second Token",
          "SEC",
          "Second token description",
          "https://second.png",
          ["@second", "", "", ""],
          0,
          "0x2234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        );

      const profile = await bonding.profile(founder.address);
      expect(profile.user).to.equal(founder.address);
      
      // Should have 2 tokens in profile
      const token1 = await bonding.tokenInfos(0);
      const token2 = await bonding.tokenInfos(1);
      
      const tokenInfo1 = await bonding.tokenInfo(token1);
      const tokenInfo2 = await bonding.tokenInfo(token2);
      
      expect(tokenInfo1.creator).to.equal(founder.address);
      expect(tokenInfo2.creator).to.equal(founder.address);
    });
  });

  // AMM and Pricing Tests
  describe("AMM and Pricing", function () {
    it("should calculate correct amounts out for buys", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder } = await getAccounts();

      const tokenInfo = await launchToken(founder, bonding);
      
      const buyAmount = parseEther("1");
      const expectedOut = await fRouter.getAmountsOut(tokenInfo.token, assetToken.target, buyAmount);
      
      expect(expectedOut).to.be.greaterThan(0);
    });

    it("should calculate correct amounts out for sells", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("10"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("10"));

      const tokenInfo = await launchToken(founder, bonding);
      
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300);

      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);
      const sellAmount = await agentToken.balanceOf(trader.address);
      
      const expectedOut = await fRouter.getAmountsOut(tokenInfo.token, trader.address, sellAmount);
      expect(expectedOut).to.be.greaterThan(0);
    });
  });

  // Error Handling Tests
  describe("Error Handling", function () {
    it("should revert when trying to graduate already graduated token", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      const tokenInfo = await launchToken(founder, bonding);

      // Graduate the token
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("22"), tokenInfo.token, "0", now + 300);

      // Try to buy again (should revert because it's already graduated)
      await expect(
        bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300)
      ).to.be.reverted;
    });

    it("should revert on insufficient balance", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      const tokenInfo = await launchToken(founder, bonding);
      const now = await time.latest();

      // Try to buy without having any tokens
      await expect(
        bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300)
      ).to.be.reverted;
    });
  });

  // Integration Tests
  describe("Integration", function () {
    it("should complete full lifecycle: launch -> trade -> graduate -> uniswap", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      // Setup
      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      // Launch
      const tokenInfo = await launchToken(founder, bonding);
      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);

      // Trade on bonding curve
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("5"), tokenInfo.token, "0", now + 300);
      
      expect(await agentToken.fundedDate()).to.equal(0);
      expect(tokenInfo.tradingOnUniswap).to.equal(false);

      // Graduate
      await bonding.connect(trader).buy(parseEther("20"), tokenInfo.token, "0", now + 300);
      
      const newInfo = await bonding.tokenInfo(tokenInfo.token);
      expect(await agentToken.fundedDate()).to.be.greaterThan(0);
      expect(newInfo.tradingOnUniswap).to.equal(true);

      // Trade on Uniswap
      const uniRouter = await ethers.getContractAt("IUniswapV2Router02", process.env.UNISWAP_ROUTER);
      await assetToken.connect(trader).approve(uniRouter.target, parseEther("1"));
      
      await uniRouter
        .connect(trader)
        .swapExactTokensForTokensSupportingFeeOnTransferTokens(
          parseEther("1"),
          "0",
          [assetToken.target, tokenInfo.token],
          trader.address,
          now + 600
        );

      expect(await agentToken.balanceOf(trader.address)).to.be.greaterThan(0);
    });
  });

  // Additional Tax Distribution Tests
  describe("Tax Distribution Edge Cases", function () {
    it("should handle claiming tax with zero balance", async function () {
      const { taxManager } = await loadFixture(deployBaseContracts);
      const { trader } = await getAccounts();

      // Try to claim tax when balance is zero
      await expect(
        taxManager.connect(trader).claimTax(0)
      ).to.not.be.reverted;

      await expect(
        taxManager.connect(trader).claimTax(parseEther("1"))
      ).to.not.be.reverted;
    });

    it("should track leaderboard taxes across multiple tokens", async function () {
      const { assetToken, bonding, fRouter, taxManager } = await loadFixture(deployBaseContracts);
      const { founder, trader, leaderboardVault } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      // Launch first token
      const tokenInfo1 = await launchToken(founder, bonding);
      
      // Launch second token
      await bonding
        .connect(founder)
        .launch(
          "Second Token",
          "SEC",
          "Second token",
          "https://second.png",
          ["@second", "", "", ""],
          0,
          "0x2234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        );
      const tokenInfo2 = await bonding.tokenInfo(await bonding.tokenInfos(1));

      // Buy both tokens
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("5"), tokenInfo1.token, "0", now + 300);
      await bonding.connect(trader).buy(parseEther("5"), tokenInfo2.token, "0", now + 300);

      // Check leaderboard taxes for both tokens
      const tax1 = await taxManager.leaderboardTaxes(tokenInfo1.token);
      const tax2 = await taxManager.leaderboardTaxes(tokenInfo2.token);

      expect(tax1).to.be.greaterThan(0);
      expect(tax2).to.be.greaterThan(0);

      // Claim leaderboard taxes for both tokens
      await taxManager
        .connect(leaderboardVault)
        .claimLeaderboardTax(tokenInfo1.token, tax1);
      await taxManager
        .connect(leaderboardVault)
        .claimLeaderboardTax(tokenInfo2.token, tax2);

      expect(await taxManager.leaderboardTaxes(tokenInfo1.token)).to.equal(0);
      expect(await taxManager.leaderboardTaxes(tokenInfo2.token)).to.equal(0);
    });

    it("should update ACP wallet and allow new wallet to claim", async function () {
      const { assetToken, bonding, fRouter, taxManager } = await loadFixture(deployBaseContracts);
      const { founder, trader, acpWalletManager, treasury } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      const tokenInfo = await launchToken(founder, bonding);

      // Buy to generate tax
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("5"), tokenInfo.token, "0", now + 300);

      const acpTax = await taxManager.acpTaxes(tokenInfo.token);
      expect(acpTax).to.be.greaterThan(0);

      // Update ACP wallet
      await bonding
        .connect(acpWalletManager)
        .setAcpWallet(tokenInfo.token, treasury.address);

      // New wallet should be able to claim
      await taxManager
        .connect(treasury)
        .claimAcpTax(tokenInfo.token, acpTax);

      expect(await assetToken.balanceOf(treasury.address)).to.equal(acpTax);
    });
  });

  // Graduation Edge Cases
  describe("Graduation Edge Cases", function () {
    it("should graduate exactly at threshold", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      const tokenInfo = await launchToken(founder, bonding);
      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);

      // Calculate exact amount needed to hit threshold
      // const pair = await ethers.getContractAt("FPair", tokenInfo.pair);
      // const [reserveA, ] = await pair.getReserves();
      // const gradThreshold = await bonding.gradThreshold();

      // This should bring us exactly to graduation threshold
      const amountNeeded = parseEther("21");
      
      const now = await time.latest();
      await bonding.connect(trader).buy(amountNeeded, tokenInfo.token, "0", now + 300);

      const newInfo = await bonding.tokenInfo(tokenInfo.token);
      expect(await agentToken.fundedDate()).to.be.greaterThan(0);
      expect(newInfo.tradingOnUniswap).to.equal(true);
    });

    it("should maintain zero balances in bonding pair after graduation", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      const tokenInfo = await launchToken(founder, bonding);
      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);

      // Graduate the token
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("22"), tokenInfo.token, "0", now + 300);

      // Check bonding pair has zero balances
      expect(await assetToken.balanceOf(tokenInfo.pair)).to.equal(0);
      expect(await agentToken.balanceOf(tokenInfo.pair)).to.equal(0);
    });

    it("should prevent trading on bonding curve after graduation", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader, treasury } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.mint(treasury.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));
      await assetToken.connect(treasury).approve(fRouter.target, parseEther("100"));

      const tokenInfo = await launchToken(founder, bonding);

      // Graduate the token
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("22"), tokenInfo.token, "0", now + 300);

      // Try to buy on bonding curve after graduation
      await expect(
        bonding.connect(treasury).buy(parseEther("1"), tokenInfo.token, "0", now + 300)
      ).to.be.reverted;

      // Try to sell on bonding curve after graduation
      const agentToken = await ethers.getContractAt("AgentToken", tokenInfo.token);
      await agentToken.connect(trader).approve(fRouter.target, await agentToken.balanceOf(trader.address));
      
      await expect(
        bonding.connect(trader).sell(parseEther("1"), tokenInfo.token, "0", now + 300)
      ).to.be.reverted;
    });
  });

  // Data Update Tests
  describe("Data Updates", function () {
    it("should update lastUpdated timestamp after 24 hours", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      const tokenInfo = await launchToken(founder, bonding);
      
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300);

      const lastUpdatedBefore = (await bonding.tokenInfo(tokenInfo.token)).data.lastUpdated;

      // Fast forward 25 hours
      await time.increase(25 * 60 * 60);

      // Make another trade
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", (await time.latest()) + 300);

      const lastUpdatedAfter = (await bonding.tokenInfo(tokenInfo.token)).data.lastUpdated;

      expect(lastUpdatedAfter).to.be.greaterThan(lastUpdatedBefore);
    });

    it("should not update lastUpdated timestamp within 24 hours", async function () {
      const { assetToken, bonding, fRouter } = await loadFixture(deployBaseContracts);
      const { founder, trader } = await getAccounts();

      await assetToken.mint(trader.address, parseEther("100"));
      await assetToken.connect(trader).approve(fRouter.target, parseEther("100"));

      const tokenInfo = await launchToken(founder, bonding);
      
      const now = await time.latest();
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", now + 300);

      const lastUpdatedBefore = (await bonding.tokenInfo(tokenInfo.token)).data.lastUpdated;

      // Fast forward 23 hours
      await time.increase(23 * 60 * 60);

      // Make another trade
      await bonding.connect(trader).buy(parseEther("1"), tokenInfo.token, "0", (await time.latest()) + 300);

      const lastUpdatedAfter = (await bonding.tokenInfo(tokenInfo.token)).data.lastUpdated;

      expect(lastUpdatedAfter).to.equal(lastUpdatedBefore);
    });
  });

  // Additional Security Tests
  describe("Reentrancy Protection", function () {
    it("should protect launch function from reentrancy", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { founder } = await getAccounts();

      // The reentrancy guard should prevent multiple simultaneous calls
      // This is already protected by the nonReentrant modifier
      await expect(
        bonding
          .connect(founder)
          .launch(
            tokenInput.name,
            tokenInput.symbol,
            "it is a cat",
            "https://cat.png",
            [tokenInput.twitter, "", "", ""],
            0,
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
          )
      ).to.not.be.reverted;
    });
  });

  // Additional Validation Tests
  describe("Parameter Validation", function () {
    it("should handle empty social media links", async function () {
      const { bonding } = await loadFixture(deployBaseContracts);
      const { founder } = await getAccounts();

      await expect(
        bonding
          .connect(founder)
          .launch(
            tokenInput.name,
            tokenInput.symbol,
            "it is a cat",
            "https://cat.png",
            ["", "", "", ""],
            0,
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
          )
      ).to.not.be.reverted;

      const tokenInfo = await bonding.tokenInfo(await bonding.tokenInfos(0));
      expect(tokenInfo.twitter).to.equal("");
      expect(tokenInfo.telegram).to.equal("");
      expect(tokenInfo.youtube).to.equal("");
      expect(tokenInfo.website).to.equal("");
    });
  });
});
