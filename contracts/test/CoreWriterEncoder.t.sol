// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {CoreWriterEncoder} from "../src/CoreWriter.sol";

contract CoreWriterEncoderTest is Test {
    function test_header() public pure {
        bytes memory enc = CoreWriterEncoder.encodeSpotSend(address(0xBEEF), 1, 100);
        // byte 0 = version 1, bytes 1-3 = action id 6 big-endian.
        assertEq(uint8(enc[0]), 1);
        assertEq(uint8(enc[1]), 0);
        assertEq(uint8(enc[2]), 0);
        assertEq(uint8(enc[3]), 6);
        // body = abi.encode(address, uint64, uint64) = 96 bytes; total 100.
        assertEq(enc.length, 4 + 96);
    }

    function test_usdClassTransferActionId() public pure {
        bytes memory enc = CoreWriterEncoder.encodeUsdClassTransfer(0, true);
        assertEq(uint8(enc[3]), 7);
    }
}
