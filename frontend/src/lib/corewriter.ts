// CoreWriter action encoder + sender (browser). Encoding is pure; sending uses
// the user's wallet directly (no server). Writes are testnet-only by policy.

import { encodeAbiParameters, encodeFunctionData, parseAbiParameters, concat, toHex, type Hex } from "viem";
import type { Network } from "./l1read";

export const CORE_WRITER = "0x3333333333333333333333333333333333333333" as const;
const VERSION = 1;

// HyperEVM chain ids. The wallet must be on the matching chain to send.
export const CHAIN_ID: Record<Network, number> = {
  testnet: 998, // 0x3e6
  mainnet: 999, // 0x3e7
};

export const RPC_URL: Record<Network, string> = {
  testnet: "https://rpc.hyperliquid-testnet.xyz/evm",
  mainnet: "https://rpc.hyperliquid.xyz/evm",
};

// CoreWriter.sendRawAction(bytes) IS a normal contract method (takes a selector).
const CORE_WRITER_ABI = [
  {
    type: "function",
    name: "sendRawAction",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [],
  },
] as const;

// Wrap an encoded action in the sendRawAction(bytes) calldata.
export function sendRawActionCalldata(action: Hex): Hex {
  return encodeFunctionData({ abi: CORE_WRITER_ABI, functionName: "sendRawAction", args: [action] });
}

function encodeAction(actionId: number, body: Hex): Hex {
  const header = toHex(
    Uint8Array.from([VERSION, (actionId >> 16) & 0xff, (actionId >> 8) & 0xff, actionId & 0xff]),
  );
  return concat([header, body]);
}

export function encodeSpotSend(destination: Hex, token: bigint, weiAmount: bigint): Hex {
  const body = encodeAbiParameters(parseAbiParameters("address, uint64, uint64"), [destination, token, weiAmount]);
  return encodeAction(6, body);
}

// Action #1 limit order. limitPx and sz are 1e8 * the human value.
// tif: 1=Alo 2=Gtc 3=Ioc. cloid: 0 = none.
export function encodeLimitOrder(args: {
  asset: number;
  isBuy: boolean;
  limitPx: bigint;
  sz: bigint;
  reduceOnly: boolean;
  tif: number;
  cloid: bigint;
}): Hex {
  const body = encodeAbiParameters(parseAbiParameters("uint32, bool, uint64, uint64, bool, uint8, uint128"), [
    args.asset,
    args.isBuy,
    args.limitPx,
    args.sz,
    args.reduceOnly,
    args.tif,
    args.cloid,
  ]);
  return encodeAction(1, body);
}

export function encodeUsdClassTransfer(ntl: bigint, toPerp: boolean): Hex {
  const body = encodeAbiParameters(parseAbiParameters("uint64, bool"), [ntl, toPerp]);
  return encodeAction(7, body);
}

// Action #10 cancel order by oid: (asset, oid).
export function encodeCancelOrderByOid(asset: number, oid: bigint): Hex {
  const body = encodeAbiParameters(parseAbiParameters("uint32, uint64"), [asset, oid]);
  return encodeAction(10, body);
}

// ---- Core <-> EVM transfers ----
//
// HYPE is the HyperEVM gas token. Moving it Core->EVM is how you fund EVM gas.
// HYPE's Core system address is the fixed 0x222...2 (a special case; other
// tokens use 0x20 + big-endian token index).

export const HYPE_SYSTEM_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const UINT32_MAX = 4294967295; // "spot" dex sentinel for sendAsset

// HYPE Core spot token index per network (weiDecimals = 8).
export const HYPE_TOKEN_INDEX: Record<Network, bigint> = {
  testnet: 1105n,
  mainnet: 150n,
};
export const HYPE_WEI_DECIMALS = 8;

// Action #13 sendAsset: (dest, subAccount, srcDex, dstDex, token, wei).
// To move HYPE Core->EVM, dest = HYPE system address, token = HYPE index.
export function encodeSendAsset(
  dest: Hex,
  subAccount: Hex,
  srcDex: number,
  dstDex: number,
  token: bigint,
  weiAmount: bigint,
): Hex {
  const body = encodeAbiParameters(parseAbiParameters("address, address, uint32, uint32, uint64, uint64"), [
    dest,
    subAccount,
    srcDex,
    dstDex,
    token,
    weiAmount,
  ]);
  return encodeAction(13, body);
}

// Core -> EVM HYPE transfer: sendAsset to the HYPE system address. `weiAmount`
// is in HYPE wei (8 decimals on Core).
export function encodeHypeCoreToEvm(network: Network, weiAmount: bigint): Hex {
  const ZERO = "0x0000000000000000000000000000000000000000" as const;
  return encodeSendAsset(HYPE_SYSTEM_ADDRESS, ZERO, UINT32_MAX, UINT32_MAX, HYPE_TOKEN_INDEX[network], weiAmount);
}

// ---- sending (wallet-direct, no server) ----

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
function provider(): Eip1193 {
  const p = (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!p) throw new Error("No wallet found (install MetaMask).");
  return p;
}

// Ensure the wallet is on the HyperEVM chain for `network`, adding it if needed.
export async function ensureChain(network: Network): Promise<void> {
  const p = provider();
  const hexId = `0x${CHAIN_ID[network].toString(16)}`;
  const current = (await p.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === hexId) return;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e) {
    // 4902 = chain not added. Add it, then it's selected.
    if ((e as { code?: number }).code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: `HyperEVM ${network}`,
            nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
            rpcUrls: [RPC_URL[network]],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

// Send an encoded CoreWriter action from `from` via the wallet. Returns the EVM
// tx hash. Execution on HyperCore is ASYNC — success here means the EVM tx was
// accepted, not that HyperCore has executed the action yet.
export async function sendAction(network: Network, from: Hex, action: Hex): Promise<Hex> {
  await ensureChain(network);
  const p = provider();
  const data = sendRawActionCalldata(action);
  const txHash = (await p.request({
    method: "eth_sendTransaction",
    params: [{ from, to: CORE_WRITER, data }],
  })) as Hex;
  return txHash;
}

// EVM -> Core HYPE transfer: send native HYPE as tx value to the HYPE system
// address 0x222...2. Its receive() emits a log that credits Core. `evmWei` is in
// EVM-native HYPE wei (18 decimals). Returns the EVM tx hash.
export async function sendHypeEvmToCore(network: Network, from: Hex, evmWei: bigint): Promise<Hex> {
  await ensureChain(network);
  const p = provider();
  const txHash = (await p.request({
    method: "eth_sendTransaction",
    params: [{ from, to: HYPE_SYSTEM_ADDRESS, value: `0x${evmWei.toString(16)}` }],
  })) as Hex;
  return txHash;
}
