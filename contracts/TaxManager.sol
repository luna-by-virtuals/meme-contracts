// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ITaxManager.sol";
import "./Launchpad.sol";
import "./pool/IUniswapV2Router02.sol";

contract TaxManager is ITaxManager, Initializable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    struct TaxConfig {
        uint256 creatorShare;
        uint256 aigcShare;
    }

    address public assetToken;
    uint256 public bondingReward;
    Launchpad public launchpad;
    address public launchpadRouter;
    address public treasury;
    address public aigcVault;

    // Swap configuration
    address public pancakeswapRouter;
    address public usdcToken; // USDC address on BSC

    mapping(address recipient => uint256 amount) public taxes;
    mapping(address token => uint256 amount) public aigcTaxes;

    mapping(address token => address creator) public creators;
    mapping(address token => bool isGraduated) public isGraduated;

    event ReceivedTax(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bool isBonding
    );
    event ReceivedTaxAIGC(
        address indexed token,
        uint256 amount,
        bool isBonding
    );
    event ReceivedTaxTreasury(
        address indexed token,
        uint256 amount,
        bool isBonding
    );

    event BondingReward(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event ClaimedTax(address indexed recipient, uint256 amount);

    event CreatorSet(address indexed token, address indexed creator);

    TaxConfig public bondingTaxConfig;
    TaxConfig public taxConfig;

    uint256 public constant DENOM = 10000;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    modifier onlyLaunchpadRouter() {
        require(
            msg.sender == launchpadRouter,
            "Only launchpad router can call this function."
        );
        _;
    }

    function initialize(
        address owner,
        address assetToken_,
        address aigcVault_,
        address treasury_,
        uint256 bondingReward_
    ) public initializer {
        require(owner != address(0), "Zero addresses are not allowed.");
        require(assetToken_ != address(0), "Zero addresses are not allowed.");
        require(aigcVault_ != address(0), "Zero addresses are not allowed.");
        require(treasury_ != address(0), "Zero addresses are not allowed.");

        __Ownable_init(owner);
        assetToken = assetToken_;
        aigcVault = aigcVault_;
        treasury = treasury_;
        bondingReward = bondingReward_;
    }

    function setLaunchpad(address launchpad_) external onlyOwner {
        require(launchpad_ != address(0), "Zero addresses are not allowed.");
        launchpad = Launchpad(launchpad_);
        launchpadRouter = address(launchpad.router());
    }

    function setAIGCVault(address vault_) external onlyOwner {
        require(vault_ != address(0), "Zero addresses are not allowed.");
        aigcVault = vault_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "Zero addresses are not allowed.");
        treasury = treasury_;
    }

    function setConfigs(
        TaxConfig memory bondingTaxConfig_,
        TaxConfig memory taxConfig_
    ) external onlyOwner {
        bondingTaxConfig = bondingTaxConfig_;
        taxConfig = taxConfig_;
    }

    function _getCreator(address token) internal returns (address) {
        if (creators[token] == address(0)) {
            (address creator, , , , , , , , , , ) = launchpad.tokenInfo(token);
            creators[token] = creator;
        }
        return creators[token];
    }

    function recordBondingTax(
        address token,
        uint256 amount
    ) external onlyLaunchpadRouter {
        _distributeTaxes(token, amount, !isGraduated[token]);
    }

    function recordTax(
        address token,
        uint256 amount
    ) external {
        require(msg.sender == token, "Only token can call this function.");
        _distributeTaxes(token, amount, false);
    }

    function setBondingReward(uint256 bondingReward_) external onlyOwner {
        bondingReward = bondingReward_;
    }

    function _distributeTaxes(
        address token,
        uint256 amount,
        bool isBonding
    ) internal {
        TaxConfig memory config = isBonding ? bondingTaxConfig : taxConfig;

        uint256 creatorShare = (amount * config.creatorShare) / DENOM;
        uint256 aigcShare = (amount * config.aigcShare) / DENOM;
        uint256 treasuryShare = amount - creatorShare - aigcShare;

        if (creatorShare > 0) {
            address creator = _getCreator(token);
            taxes[creator] += creatorShare;
            emit ReceivedTax(token, creator, creatorShare, isBonding);
        }

        if (aigcShare > 0) {
            taxes[token] += aigcShare;
            emit ReceivedTaxAIGC(token, aigcShare, isBonding);
        }

        if (treasuryShare > 0) {
            taxes[treasury] += treasuryShare;
            emit ReceivedTaxTreasury(token, treasuryShare, isBonding);
        }
    }

    function graduate(address token) external onlyLaunchpadRouter {
        require(!isGraduated[token], "Token already graduated.");
        isGraduated[token] = true;
        address creator = _getCreator(token);
        require(
            taxes[treasury] >= bondingReward,
            "Insufficient treasury balance for bonding reward"
        );

        taxes[creator] += bondingReward;
        taxes[treasury] -= bondingReward;

        emit BondingReward(token, creator, bondingReward);
    }

    function claimTax(uint256 amount) external {
        uint256 claimable = taxes[msg.sender];
        require(claimable >= amount, "Insufficient tax to claim.");

        taxes[msg.sender] -= amount;
        IERC20(assetToken).safeTransfer(msg.sender, amount);
        emit ClaimedTax(msg.sender, amount);
    }

    function setCreator(address token, address creator) external onlyOwner {
        require(token != address(0), "Zero addresses are not allowed.");
        require(creator != address(0), "Zero addresses are not allowed.");
        address oldCreator = creators[token];
        uint256 oldBalance = taxes[oldCreator];

        creators[token] = creator;
        taxes[oldCreator] = 0;
        taxes[creator] += oldBalance;
        emit CreatorSet(token, creator);
    }

    function setPancakeSwapRouter(address router_) external onlyOwner {
        require(router_ != address(0), "Zero addresses are not allowed.");
        pancakeswapRouter = router_;
    }

    function setUsdcToken(address usdc_) external onlyOwner {
        require(usdc_ != address(0), "Zero addresses are not allowed.");
        usdcToken = usdc_;
    }

    function claimTaxByToken(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner returns (uint256) {
        require(recipient != address(0), "Zero addresses are not allowed.");
        require(pancakeswapRouter != address(0), "PancakeSwap router not set.");
        require(usdcToken != address(0), "USDC token not set.");

        uint256 claimable = taxes[token];
        require(claimable >= amount, "Insufficient tax to claim.");
        taxes[token] -= amount;

        IERC20(assetToken).safeTransfer(address(this), amount);

        uint256 usdcAmount = _swapWbnbToUsdc(amount);

        IERC20(usdcToken).safeTransfer(recipient, usdcAmount);

        emit ClaimedTax(recipient, usdcAmount);
        return usdcAmount;
    }

    function _swapWbnbToUsdc(uint256 wbnbAmount) internal returns (uint256) {
        IERC20(assetToken).forceApprove(pancakeswapRouter, wbnbAmount);

        address[] memory path = new address[](2);
        path[0] = assetToken; // WBNB
        path[1] = usdcToken; // USDC

        uint256[] memory amountsOut = IUniswapV2Router02(pancakeswapRouter)
            .getAmountsOut(wbnbAmount, path);
        uint256 minAmountOut = (amountsOut[1] * 99) / 100; //1% slippage

        uint256[] memory amounts = IUniswapV2Router02(pancakeswapRouter)
            .swapExactTokensForTokens(
                wbnbAmount,
                minAmountOut,
                path,
                address(this),
                block.timestamp + 300 // 5 minute deadline
            );

        return amounts[1]; // Return USDC amount received
    }
}
