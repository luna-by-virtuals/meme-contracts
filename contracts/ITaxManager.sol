// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ITaxManager {
    function recordBondingTax(address token, uint256 amount) external;

    function graduate(address token) external;

    function recordTax(address token, uint256 amount) external;

    function claimTax(uint256 amount) external;
}
