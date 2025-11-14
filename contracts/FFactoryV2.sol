// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "./FPair.sol";
import "./AgentTokenV2.sol";

contract FFactoryV2 is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    mapping(address => mapping(address => address)) private _pair;

    address[] public pairs;

    address public router;

    uint256 public buyTax;
    uint256 public sellTax;
    address public taxVault;

    event PairCreated(
        address indexed tokenA,
        address indexed tokenB,
        address pair,
        uint
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address taxVault_,
        uint256 buyTax_,
        uint256 sellTax_
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        taxVault = taxVault_;
        buyTax = buyTax_;
        sellTax = sellTax_;
    }

    function _createPair(
        address tokenA,
        address tokenB
    ) internal returns (address) {
        require(tokenA != address(0), "Zero addresses are not allowed.");
        require(tokenB != address(0), "Zero addresses are not allowed.");
        require(router != address(0), "No router");

        FPair pair_ = new FPair(router, tokenA, tokenB);

        _pair[tokenA][tokenB] = address(pair_);
        _pair[tokenB][tokenA] = address(pair_);

        pairs.push(address(pair_));

        uint n = pairs.length;

        emit PairCreated(tokenA, tokenB, address(pair_), n);

        return address(pair_);
    }

    function createPair(
        address tokenA,
        address tokenB
    ) external onlyRole(CREATOR_ROLE) nonReentrant returns (address) {
        address pair = _createPair(tokenA, tokenB);

        return pair;
    }

    function getPair(
        address tokenA,
        address tokenB
    ) public view returns (address) {
        return _pair[tokenA][tokenB];
    }

    function allPairsLength() public view returns (uint) {
        return pairs.length;
    }

    function setTaxParams(
        address taxVault_,
        uint256 buyTax_,
        uint256 sellTax_
    ) public onlyRole(ADMIN_ROLE) {
        buyTax = buyTax_;
        sellTax = sellTax_;
        taxVault = taxVault_;
    }

    function setRouter(address router_) public onlyRole(ADMIN_ROLE) {
        router = router_;
    }

    function createToken(
        address tokenAdmin,
        address uniswapRouter,
        address assetToken,
        string memory name,
        string memory ticker,
        bytes memory tokenSupplyParams,
        bytes memory tokenTaxParams,
        bytes32 salt
    ) external onlyRole(CREATOR_ROLE) nonReentrant returns (address) {
        AgentTokenV2 token = new AgentTokenV2{
            salt: keccak256(abi.encodePacked(msg.sender, block.timestamp, salt))
        }(
            [tokenAdmin, uniswapRouter, assetToken],
            abi.encode(name, ticker),
            tokenSupplyParams,
            tokenTaxParams
        );

        AgentTokenV2(address(token)).addBlacklistAddress(IAgentTokenV2(token).liquidityPools()[0]);

        // Renounce ownership of the token
        AgentTokenV2(address(token)).renounceOwnership();

        return address(token);
    }

    function graduate(address tokenAddress) external onlyRole(CREATOR_ROLE) {
        AgentTokenV2(tokenAddress).removeBlacklistAddress(IAgentTokenV2(tokenAddress).liquidityPools()[0]);

        AgentTokenV2(tokenAddress).addInitialLiquidity(address(0));
    }
}
