// Read demo: exercise the L1Read read precompiles against testnet.
// Read-only — no signing, no funds. Prints a working/reverts result per call so
// the capability matrix in docs/capabilities.md can be filled with evidence.
//
// Usage: npm run demo:l1read
// Env: HL_RPC, DEMO_USER (an address to read balances/positions for)

import { createPublicClient, http, type Hex } from "viem";
import {
  HL_TESTNET_RPC,
  l1BlockNumber,
  oraclePx,
  spotPx,
  markPx,
  spotInfo,
  tokenInfo,
  spotBalance,
  bbo,
  coreUserExists,
} from "./l1read.js";

const RPC = process.env.HL_RPC ?? HL_TESTNET_RPC;
const USER = (process.env.DEMO_USER ??
  "0x000000000000000000000000000000000000dEaD") as Hex;

const client = createPublicClient({ transport: http(RPC) });

async function show(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    const v = await fn();
    console.log(`✅ ${label}: ${JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))}`);
  } catch (e) {
    console.log(`❌ ${label}: ${(e as Error).message.split("\n")[0]}`);
  }
}

async function main() {
  console.log(`RPC: ${RPC}\nUSER: ${USER}\n`);

  await show("l1BlockNumber()", () => l1BlockNumber(client));
  await show("oraclePx(0)", () => oraclePx(client, 0));
  await show("markPx(0)", () => markPx(client, 0));
  await show("spotPx(0)", () => spotPx(client, 0));
  await show("bbo(0)", () => bbo(client, 0));
  await show("spotInfo(0)", () => spotInfo(client, 0));
  await show("tokenInfo(0)", () => tokenInfo(client, 0));
  await show(`spotBalance(${USER}, 0)`, () => spotBalance(client, USER, 0n));
  await show(`coreUserExists(${USER})`, () => coreUserExists(client, USER));

  console.log(
    "\nUpdate docs/capabilities.md statuses (⬜ → ✅/⚠️/❌) from the lines above.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
