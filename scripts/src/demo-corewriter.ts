// Write demo: CoreWriter actions.
//
// SAFE BY DEFAULT: this only ENCODES actions and prints the calldata. It does
// NOT send anything unless you explicitly opt in with DEMO_SEND=1 AND provide a
// funded testnet key in DEMO_PK. Never commit a private key.
//
// Sending exercises the async model: the EVM tx succeeds (log emitted) before
// HyperCore executes ~a few seconds later. Failures (slippage, margin) do NOT
// revert the EVM tx — observe via L1Read afterwards.
//
// Usage:
//   npm run demo:corewriter                 # encode-only, prints calldata
//   DEMO_SEND=1 DEMO_PK=0x... npm run demo:corewriter   # actually sends (testnet)
// Env: HL_RPC, DEMO_SEND, DEMO_PK, SEND_DEST, SEND_TOKEN, SEND_WEI

import {
  createWalletClient,
  createPublicClient,
  encodeFunctionData,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HL_TESTNET_RPC, l1BlockNumber } from "./l1read.js";
import { CORE_WRITER, encodeSpotSend, encodeUsdClassTransfer } from "./corewriter.js";

// CoreWriter.sendRawAction(bytes) — unlike read precompiles this IS a normal
// contract method, so it takes a 4-byte selector. Encode with viem.
const CORE_WRITER_ABI = [
  {
    type: "function",
    name: "sendRawAction",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [],
  },
] as const;

function encodeSendRawAction(action: Hex): Hex {
  return encodeFunctionData({ abi: CORE_WRITER_ABI, functionName: "sendRawAction", args: [action] });
}

const RPC = process.env.HL_RPC ?? HL_TESTNET_RPC;
const SEND = process.env.DEMO_SEND === "1";
const PK = process.env.DEMO_PK as Hex | undefined;

const SEND_DEST = (process.env.SEND_DEST ??
  "0x000000000000000000000000000000000000dEaD") as Hex;
const SEND_TOKEN = BigInt(process.env.SEND_TOKEN ?? "0");
const SEND_WEI = BigInt(process.env.SEND_WEI ?? "0");

const publicClient = createPublicClient({ transport: http(RPC) });

async function main() {
  console.log(`RPC: ${RPC}\n`);

  // Encode a couple of representative actions (no funds needed).
  const spotSend = encodeSpotSend(SEND_DEST, SEND_TOKEN, SEND_WEI);
  const usdClass = encodeUsdClassTransfer(0n, true);
  console.log(`spotSend calldata:        ${spotSend}`);
  console.log(`usdClassTransfer calldata: ${usdClass}`);

  if (!SEND) {
    console.log(
      "\nEncode-only mode. To actually send on testnet: DEMO_SEND=1 DEMO_PK=0x... (funded test key)",
    );
    return;
  }
  if (!PK) {
    console.log("\nDEMO_SEND=1 but DEMO_PK is missing. Refusing to send. Set a funded testnet key.");
    process.exit(1);
  }

  const account = privateKeyToAccount(PK);
  const wallet = createWalletClient({ account, transport: http(RPC) });
  console.log(`\nSending spotSend from ${account.address} via CoreWriter ${CORE_WRITER}...`);

  const beforeBlock = await l1BlockNumber(publicClient);
  // CoreWriter.sendRawAction(bytes) — selector 0x... ; we encode the raw call.
  const txHash = await wallet.sendTransaction({
    to: CORE_WRITER,
    // sendRawAction(bytes): selector + abi-encoded bytes arg.
    data: encodeSendRawAction(spotSend),
    chain: null,
  });
  console.log(`EVM tx: ${txHash} (succeeds before HyperCore executes)`);
  console.log(`L1 block before: ${beforeBlock}. Poll L1Read to observe async execution.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
