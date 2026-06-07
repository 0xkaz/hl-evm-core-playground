// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title L1Read precompile library
/// @notice Reads HyperCore state from HyperEVM via the read precompiles
///         (addresses `0x...0800`+). Values match HyperCore state at EVM block
///         construction time. Gas cost: 2000 + 65 * (input_len + output_len).
///         A call on invalid input reverts and consumes all forwarded gas.
/// @dev CALLING CONVENTION: precompiles take the RAW ABI encoding of arguments
///      with NO 4-byte function selector. `abi.encode(args)` is correct; never
///      `abi.encodeWithSignature`/`encodeWithSelector`.
library L1ReadAddresses {
    address internal constant POSITION = 0x0000000000000000000000000000000000000800;
    address internal constant SPOT_BALANCE = 0x0000000000000000000000000000000000000801;
    address internal constant USER_VAULT_EQUITY = 0x0000000000000000000000000000000000000802;
    address internal constant WITHDRAWABLE = 0x0000000000000000000000000000000000000803;
    address internal constant DELEGATIONS = 0x0000000000000000000000000000000000000804;
    address internal constant DELEGATOR_SUMMARY = 0x0000000000000000000000000000000000000805;
    address internal constant MARK_PX = 0x0000000000000000000000000000000000000806;
    address internal constant ORACLE_PX = 0x0000000000000000000000000000000000000807;
    address internal constant SPOT_PX = 0x0000000000000000000000000000000000000808;
    address internal constant L1_BLOCK_NUMBER = 0x0000000000000000000000000000000000000809;
    address internal constant PERP_ASSET_INFO = 0x000000000000000000000000000000000000080a;
    address internal constant SPOT_INFO = 0x000000000000000000000000000000000000080b;
    address internal constant TOKEN_INFO = 0x000000000000000000000000000000000000080C;
    address internal constant TOKEN_SUPPLY = 0x000000000000000000000000000000000000080D;
    address internal constant BBO = 0x000000000000000000000000000000000000080e;
    address internal constant ACCOUNT_MARGIN_SUMMARY = 0x000000000000000000000000000000000000080F;
    address internal constant CORE_USER_EXISTS = 0x0000000000000000000000000000000000000810;
}

struct Position {
    int64 szi;
    uint64 entryNtl;
    int64 isolatedRawUsd;
    uint32 leverage;
    bool isIsolated;
}

struct SpotBalance {
    uint64 total;
    uint64 hold;
    uint64 entryNtl;
}

struct SpotInfo {
    string name;
    uint64[2] tokens;
}

struct TokenInfo {
    string name;
    uint64[] spots;
    uint64 deployerTradingFeeShare;
    address deployer;
    address evmContract;
    uint8 szDecimals;
    uint8 weiDecimals;
    int8 evmExtraWeiDecimals;
}

struct Bbo {
    uint64 bid;
    uint64 ask;
}

library L1Read {
    function _read(address precompile, bytes memory args) private view returns (bytes memory) {
        (bool ok, bytes memory ret) = precompile.staticcall(args);
        require(ok, "L1Read: precompile reverted");
        return ret;
    }

    function l1BlockNumber() internal view returns (uint64) {
        return abi.decode(_read(L1ReadAddresses.L1_BLOCK_NUMBER, ""), (uint64));
    }

    function oraclePx(uint32 index) internal view returns (uint64) {
        return abi.decode(_read(L1ReadAddresses.ORACLE_PX, abi.encode(index)), (uint64));
    }

    function markPx(uint32 index) internal view returns (uint64) {
        return abi.decode(_read(L1ReadAddresses.MARK_PX, abi.encode(index)), (uint64));
    }

    function spotPx(uint32 index) internal view returns (uint64) {
        return abi.decode(_read(L1ReadAddresses.SPOT_PX, abi.encode(index)), (uint64));
    }

    function spotBalance(address user, uint64 token) internal view returns (SpotBalance memory) {
        return abi.decode(
            _read(L1ReadAddresses.SPOT_BALANCE, abi.encode(user, token)), (SpotBalance)
        );
    }

    function spotInfo(uint32 spot) internal view returns (SpotInfo memory) {
        return abi.decode(_read(L1ReadAddresses.SPOT_INFO, abi.encode(spot)), (SpotInfo));
    }

    function tokenInfo(uint32 token) internal view returns (TokenInfo memory) {
        return abi.decode(_read(L1ReadAddresses.TOKEN_INFO, abi.encode(token)), (TokenInfo));
    }

    function bbo(uint32 asset) internal view returns (Bbo memory) {
        return abi.decode(_read(L1ReadAddresses.BBO, abi.encode(asset)), (Bbo));
    }

    function coreUserExists(address user) internal view returns (bool) {
        return abi.decode(_read(L1ReadAddresses.CORE_USER_EXISTS, abi.encode(user)), (bool));
    }
}
