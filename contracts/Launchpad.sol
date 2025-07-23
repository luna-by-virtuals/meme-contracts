// SPDX-License-Identifier: MIT
// Modified from https://github.com/sourlodine/Pump.fun-Smart-Contract/blob/main/contracts/PumpFun.sol
pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "./FFactory.sol";
import "./IFPair.sol";
import "./FRouter.sol";

contract Launchpad is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;

    FFactory public factory;
    FRouter public router;
    uint256 public initialSupply;
    uint256 public constant K = 3_000_000_000;
    uint256 public gradThreshold;
    struct DeployParams {
        address tokenAdmin;
        address uniswapRouter;
        bytes tokenSupplyParams;
        bytes tokenTaxParams;
    }
    struct Profile {
        address user;
        address[] tokens;
    }
    struct Token {
        address creator;
        address token;
        address pair;
        Data data;
        string description;
        string image;
        string twitter;
        string telegram;
        string youtube;
        string website;
        bool tradingOnUniswap;
    }

    struct Data {
        address token;
        string name;
        string _name;
        string ticker;
        uint256 supply;
        uint256 price;
        uint256 marketCap;
        uint256 liquidity;
        uint256 volume;
        uint256 volume24H;
        uint256 prevPrice;
        uint256 lastUpdated;
    }

    DeployParams private _deployParams;

    mapping(address => Profile) public profile;
    address[] public profiles;

    mapping(address => Token) public tokenInfo;
    address[] public tokenInfos;
    mapping(address token => address acpWallet) public acpWallets;
    address private _acpManager;

    event Launched(address indexed token, address indexed pair, uint);
    event Deployed(address indexed token, uint256 amount0, uint256 amount1);
    event Graduated(address indexed token);

    error InvalidTokenStatus();
    error InvalidInput();
    error SlippageTooHigh();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address factory_,
        address router_,
        uint256 initialSupply_,
        uint256 gradThreshold_
    ) external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();

        factory = FFactory(factory_);
        router = FRouter(router_);

        initialSupply = initialSupply_;

        gradThreshold = gradThreshold_;
    }

    function _checkIfProfileExists(address _user) internal view returns (bool) {
        return profile[_user].user == _user;
    }

    function _approval(
        address _spender,
        address _token,
        uint256 amount
    ) internal returns (bool) {
        IERC20(_token).forceApprove(_spender, amount);

        return true;
    }

    function setTokenParams(
        uint256 newSupply,
        uint256 newGradThreshold
    ) public onlyOwner {
        initialSupply = newSupply;
        gradThreshold = newGradThreshold;
    }

    function setDeployParams(DeployParams memory params) public onlyOwner {
        _deployParams = params;
    }

    function setAcpManager(address acpManager) external onlyOwner {
        _acpManager = acpManager;
    }

    function setAcpWallet(address token, address acpWallet) external {
        require(msg.sender == _acpManager, "Only acp manager can call this function.");
        acpWallets[token] = acpWallet;
    }

    function launch(
        string memory _name,
        string memory _ticker,
        string memory desc,
        string memory img,
        string[4] memory urls,
        uint256 initialPurchase,
        bytes32 salt
    ) public nonReentrant returns (address, address, uint) {
        address assetToken = router.assetToken();

        IERC20(assetToken).safeTransferFrom(
            msg.sender,
            address(this),
            initialPurchase
        );

        address token = factory.createToken(
            _deployParams.tokenAdmin,
            _deployParams.uniswapRouter,
            assetToken,
            _name,
            _ticker,
            _deployParams.tokenSupplyParams,
            _deployParams.tokenTaxParams,
            salt
        );

        uint256 supply = IERC20(token).totalSupply();

        address _pair = factory.createPair(token, assetToken);

        bool approved = _approval(address(router), token, supply);
        require(approved);

        uint256 liquidity = (((K * 10000 ether) / supply) * 1 ether) / 10000;

        router.addInitialLiquidity(token, supply, liquidity);

        Data memory _data = Data({
            token: token,
            name: string.concat("fun ", _name),
            _name: _name,
            ticker: _ticker,
            supply: supply,
            price: supply / liquidity,
            marketCap: liquidity,
            liquidity: liquidity * 2,
            volume: 0,
            volume24H: 0,
            prevPrice: supply / liquidity,
            lastUpdated: block.timestamp
        });
        Token memory tmpToken = Token({
            creator: msg.sender,
            token: token,
            pair: _pair,
            data: _data,
            description: desc,
            image: img,
            twitter: urls[0],
            telegram: urls[1],
            youtube: urls[2],
            website: urls[3],
            tradingOnUniswap: false
        });

        tokenInfo[token] = tmpToken;
        tokenInfos.push(token);

        bool exists = _checkIfProfileExists(msg.sender);

        if (exists) {
            Profile storage _profile = profile[msg.sender];

            _profile.tokens.push(address(token));
        } else {
            Profile storage _profile = profile[msg.sender];
            _profile.user = msg.sender;

            _profile.tokens.push(address(token));
        }

        uint n = tokenInfos.length;

        emit Launched(address(token), _pair, n);

        // Make initial purchase
        if (initialPurchase > 0) {
            IERC20(assetToken).forceApprove(address(router), initialPurchase);
            _buy(
                address(this),
                initialPurchase,
                token,
                0,
                block.timestamp + 300
            );
            IERC20(token).safeTransfer(
                msg.sender,
                IERC20(token).balanceOf(address(this))
            );
        }

        return (address(token), _pair, n);
    }

    function sell(
        uint256 amountIn,
        address tokenAddress,
        uint256 amountOutMin,
        uint256 deadline
    ) public returns (bool) {
        if (block.timestamp > deadline) {
            revert InvalidInput();
        }

        (uint256 amount0In, uint256 amount1Out) = router.sell(
            amountIn,
            tokenAddress,
            msg.sender
        );

        if (amount1Out < amountOutMin) {
            revert SlippageTooHigh();
        }

        uint256 duration = block.timestamp -
            tokenInfo[tokenAddress].data.lastUpdated;

        if (duration > 86400) {
            tokenInfo[tokenAddress].data.lastUpdated = block.timestamp;
        }

        return true;
    }

    function _buy(
        address buyer,
        uint256 amountIn,
        address tokenAddress,
        uint256 amountOutMin,
        uint256 deadline
    ) internal {
        if (block.timestamp > deadline) {
            revert InvalidInput();
        }
        address pairAddress = factory.getPair(
            tokenAddress,
            router.assetToken()
        );

        IFPair pair = IFPair(pairAddress);

        (uint256 reserveA, uint256 reserveB) = pair.getReserves();

        (uint256 amount1In, uint256 amount0Out) = router.buy(
            amountIn,
            tokenAddress,
            buyer
        );

        if (amount0Out < amountOutMin) {
            revert SlippageTooHigh();
        }

        uint256 newReserveA = reserveA - amount0Out;
        uint256 duration = block.timestamp -
            tokenInfo[tokenAddress].data.lastUpdated;

        if (duration > 86400) {
            tokenInfo[tokenAddress].data.lastUpdated = block.timestamp;
        }

        if (newReserveA <= gradThreshold) {
            _openTradingOnUniswap(tokenAddress);
        }
    }

    function buy(
        uint256 amountIn,
        address tokenAddress,
        uint256 amountOutMin,
        uint256 deadline
    ) public returns (bool) {
        _buy(msg.sender, amountIn, tokenAddress, amountOutMin, deadline);

        return true;
    }

    function _openTradingOnUniswap(address tokenAddress) private {
        Token storage _token = tokenInfo[tokenAddress];

        if (_token.tradingOnUniswap) {
            revert InvalidTokenStatus();
        }

        _token.tradingOnUniswap = true;

        router.graduate(tokenAddress);

        factory.graduate(tokenAddress);

        emit Graduated(tokenAddress);
    }
}
