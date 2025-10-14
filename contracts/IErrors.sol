// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IErrors {
  enum BondingCurveErrorType {
    OK, //                                                  No error
    INVALID_NUMITEMS, //                                    The numItem value is 0
    SPOT_PRICE_OVERFLOW //                                  The updated spot price doesn't fit into 128 bits
  }

  error AllowanceDecreasedBelowZero(); //                   You cannot decrease the allowance below zero.

  error ApproveFromTheZeroAddress(); //                     Approval cannot be called from the zero address (indeed, how have you??).

  error ApproveToTheZeroAddress(); //                       Approval cannot be given to the zero address.

  error BurnExceedsBalance(); //                            The amount you have selected to burn exceeds the addresses balance.

  error BurnFromTheZeroAddress(); //                        Tokens cannot be burned from the zero address. (Also, how have you called this!?!)

  error CallerIsNotAdminNorFactory();   //                  The caller of this function must match the factory address or be an admin.

  error CannotWithdrawThisToken(); //                       Cannot withdraw the specified token.

  error InitialLiquidityAlreadyAdded(); //                  Initial liquidity has already been added. You can't do it again.

  error InitialLiquidityNotYetAdded(); //                   Initial liquidity needs to have been added for this to succedd.

  error InsufficientAllowance(); //                         There is not a high enough allowance for this operation.

  error LiquidityPoolAlreadyCreated(); //                   The liquidity pool has already been created on uniswap v2.

  error LiquidityPoolCannotBeAddressZero(); //              Cannot add a liquidity pool from the zero address.

  error LiquidityPoolMustBeAContractAddress(); //           Cannot add a non-contract as a liquidity pool.

  error MaxSupplyTooHigh(); //                              Max supply must fit in a uint128.

  error MintToZeroAddress(); //                             Cannot mint to the zero address.

  error NoTokenForLiquidityPair(); //                       There is no token to add to the LP.

  error NotBonded(); //                                    The token has not been bonded yet.

  error SupplyTotalMismatch(); //                           The sum of the team supply and lp supply does not match.

  error TransferAmountExceedsBalance(); //                  The transfer amount exceeds the accounts available balance.

  error TransferFailed(); //                                The transfer has failed.

  error TransferFromZeroAddress(); //                       Cannot transfer from the zero address. Indeed, this surely is impossible, and likely a waste to check??

  error TransferToZeroAddress(); //                         Cannot transfer to the zero address.

  error TransferToBlacklistedAddress(); //                  Cannot transfer to a blacklisted address.
}