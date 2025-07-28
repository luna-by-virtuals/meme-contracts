// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ITaxManager.sol";
import "./Launchpad.sol";

contract TaxManager is ITaxManager, Initializable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    struct TaxConfig {
        uint256 creatorShare;
        uint256 leaderboardShare;
        uint256 acpShare;
    }

    address public assetToken;
    uint256 public bondingReward;
    Launchpad public launchpad;
    address public launchpadRouter;
    address public treasury;
    address public leaderboardVault;

    mapping(address recipient => uint256 amount) public taxes;

    mapping(address token => uint256 amount) public leaderboardTaxes;
    mapping(address token => uint256 amount) public acpTaxes;

    mapping(address token => address creator) public creators;
    mapping(address token => address acpWallet) public acpWallets;

    event ReceivedTax(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bool isBonding
    );
    event ReceivedTaxAcp(address indexed token, uint256 amount, bool isBonding);
    event ReceivedTaxLeaderboard(
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
    event ClaimedTaxAcp(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event ClaimedTaxLeaderboard(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event CreatorSet(address indexed token, address indexed creator);
    event AcpWalletSet(address indexed token, address indexed acpWallet);

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
        address leaderboardVault_,
        address treasury_,
        uint256 bondingReward_
    ) public initializer {
        require(owner != address(0), "Zero addresses are not allowed.");
        require(assetToken_ != address(0), "Zero addresses are not allowed.");
        require(
            leaderboardVault_ != address(0),
            "Zero addresses are not allowed."
        );
        require(treasury_ != address(0), "Zero addresses are not allowed.");

        __Ownable_init(owner);
        assetToken = assetToken_;
        leaderboardVault = leaderboardVault_;
        treasury = treasury_;
        bondingReward = bondingReward_;
    }

    function setLaunchpad(address launchpad_) external onlyOwner {
        require(launchpad_ != address(0), "Zero addresses are not allowed.");
        launchpad = Launchpad(launchpad_);
        launchpadRouter = address(launchpad.router());
    }

    function setLeaderboardVault(address leaderboardVault_) external onlyOwner {
        require(
            leaderboardVault_ != address(0),
            "Zero addresses are not allowed."
        );
        leaderboardVault = leaderboardVault_;
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

    function _getAcpWallet(address token) internal returns (address) {
        if (acpWallets[token] == address(0)) {
            acpWallets[token] = launchpad.acpWallets(token);
        }
        return acpWallets[token];
    }

    function recordBondingTax(
        address token,
        uint256 amount
    ) external onlyLaunchpadRouter {
        _distributeTaxes(token, amount, true);
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
        uint256 leaderboardShare = (amount * config.leaderboardShare) / DENOM;
        uint256 acpShare = (amount * config.acpShare) / DENOM;
        uint256 treasuryShare = amount -
            creatorShare -
            leaderboardShare -
            acpShare;

        if (creatorShare > 0) {
            address creator = _getCreator(token);
            taxes[creator] += creatorShare;
            emit ReceivedTax(token, creator, creatorShare, isBonding);
        }
        if (leaderboardShare > 0) {
            leaderboardTaxes[token] += leaderboardShare;
            emit ReceivedTaxLeaderboard(token, leaderboardShare, isBonding);
        }

        if (acpShare > 0) {
            acpTaxes[token] += acpShare;
            emit ReceivedTaxAcp(token, acpShare, isBonding);
        }

        if (treasuryShare > 0) {
            taxes[treasury] += treasuryShare;
            emit ReceivedTax(token, treasury, treasuryShare, isBonding);
        }
    }

    function graduate(address token) external onlyLaunchpadRouter {
        address creator = _getCreator(token);
        require(taxes[treasury] >= bondingReward, "Insufficient treasury balance for bonding reward");
        
        taxes[creator] += bondingReward;
        taxes[treasury] -= bondingReward;

        emit BondingReward(token, creator, bondingReward);
    }

    function recordTax(address token, uint256 amount) external {
        require(msg.sender == token, "Only token can call this function.");
        _distributeTaxes(token, amount, false);
    }

    function claimTax(uint256 amount) external {
        uint256 claimable = taxes[msg.sender];
        require(claimable >= amount, "Insufficient tax to claim.");

        taxes[msg.sender] -= amount;
        IERC20(assetToken).safeTransfer(msg.sender, amount);
        emit ClaimedTax(msg.sender, amount);
    }

    function claimLeaderboardTax(address token, uint256 amount) external {
        uint256 claimable = leaderboardTaxes[token];
        require(claimable >= amount, "Insufficient tax to claim.");
        require(
            msg.sender == leaderboardVault,
            "Only leaderboard vault can claim leaderboard tax."
        );
        leaderboardTaxes[token] -= amount;
        IERC20(assetToken).safeTransfer(msg.sender, amount);
        emit ClaimedTax(msg.sender, amount);
    }

    function claimAcpTax(address token, uint256 amount) external {
        uint256 claimable = acpTaxes[token];
        require(claimable >= amount, "Insufficient tax to claim.");
        require(
            msg.sender == _getAcpWallet(token),
            "Only acp wallet can claim acp tax."
        );
        acpTaxes[token] -= amount;
        IERC20(assetToken).safeTransfer(msg.sender, amount);
        emit ClaimedTaxAcp(token, msg.sender, amount);
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

    function setAcpWallet(address token, address acpWallet) external onlyOwner {
        require(token != address(0), "Zero addresses are not allowed.");
        require(acpWallet != address(0), "Zero addresses are not allowed.");

        acpWallets[token] = acpWallet;
        emit AcpWalletSet(token, acpWallet);
    }
}
