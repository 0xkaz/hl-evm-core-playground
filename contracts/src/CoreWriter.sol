// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice CoreWriter system contract: send actions from HyperEVM to HyperCore.
///         Burns ~25k gas before emitting a log (~47k total for a basic call).
///         Order/vault actions are delayed a few seconds onchain. Execution is
///         ASYNCHRONOUS — this call succeeds (log emitted) before HyperCore
///         executes; an L1-side failure does NOT revert the EVM tx.
interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}

/// @notice Encodes CoreWriter actions: byte 0 = version (1), bytes 1-3 =
///         big-endian action ID, remaining = ABI body.
library CoreWriterEncoder {
    address internal constant CORE_WRITER = 0x3333333333333333333333333333333333333333;
    uint8 internal constant VERSION = 1;

    function encode(uint24 actionId, bytes memory body) internal pure returns (bytes memory) {
        bytes memory header = new bytes(4);
        header[0] = bytes1(VERSION);
        header[1] = bytes1(uint8(actionId >> 16));
        header[2] = bytes1(uint8(actionId >> 8));
        header[3] = bytes1(uint8(actionId));
        return bytes.concat(header, body);
    }

    // Action 6: spot send (destination, token, wei).
    function encodeSpotSend(address destination, uint64 token, uint64 weiAmount)
        internal
        pure
        returns (bytes memory)
    {
        return encode(6, abi.encode(destination, token, weiAmount));
    }

    // Action 7: USD class transfer (ntl, toPerp).
    function encodeUsdClassTransfer(uint64 ntl, bool toPerp)
        internal
        pure
        returns (bytes memory)
    {
        return encode(7, abi.encode(ntl, toPerp));
    }
}

/// @notice Minimal demo caller. Activation on HyperCore is required once before
///         an EVM contract can use CoreWriter.
contract CoreWriterDemo {
    using CoreWriterEncoder for *;

    event ActionSent(uint24 indexed actionId, bytes data);

    function sendSpotSend(address destination, uint64 token, uint64 weiAmount) external {
        bytes memory data = CoreWriterEncoder.encodeSpotSend(destination, token, weiAmount);
        ICoreWriter(CoreWriterEncoder.CORE_WRITER).sendRawAction(data);
        emit ActionSent(6, data);
    }

    function sendUsdClassTransfer(uint64 ntl, bool toPerp) external {
        bytes memory data = CoreWriterEncoder.encodeUsdClassTransfer(ntl, toPerp);
        ICoreWriter(CoreWriterEncoder.CORE_WRITER).sendRawAction(data);
        emit ActionSent(7, data);
    }
}
