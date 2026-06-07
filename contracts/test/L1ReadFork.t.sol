// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test, console2} from "forge-std/Test.sol";
import {L1Read, SpotInfo, TokenInfo} from "../src/L1Read.sol";

/// @notice Fork tests for the L1Read precompiles.
///
/// IMPORTANT LIMITATION: Hyperliquid's custom read precompiles (`0x...0800`+)
/// only exist on the real HyperEVM node. Foundry's fork backend (REVM) does NOT
/// implement them, so a forked `staticcall` returns empty and these calls
/// revert — even though the precompiles work fine on the live RPC.
///
/// Therefore the authoritative L1Read verification is the viem scripts
/// (`make demo-l1read`), which hit the real node over JSON-RPC. These fork
/// tests are kept as a structural smoke test and self-skip unless
/// L1READ_FORK_EXPECT_LIVE=1 is set (only meaningful against a node/proxy that
/// actually serves the precompiles).
contract L1ReadForkTest is Test {
    function _expectLive() internal view returns (bool) {
        return vm.envOr("L1READ_FORK_EXPECT_LIVE", false);
    }

    function test_l1BlockNumber() public view {
        if (!_expectLive()) {
            console2.log("skipped: Foundry forks don't serve HL precompiles; use `make demo-l1read`");
            return;
        }
        assertGt(L1Read.l1BlockNumber(), 0);
    }

    function test_spotInfo0() public view {
        if (!_expectLive()) return;
        SpotInfo memory s = L1Read.spotInfo(0);
        console2.log("spot 0 name:", s.name);
    }

    function test_tokenInfo0() public view {
        if (!_expectLive()) return;
        TokenInfo memory t = L1Read.tokenInfo(0);
        console2.log("token 0 name:", t.name);
        assertEq(t.weiDecimals, 8);
    }
}
