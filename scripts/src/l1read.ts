// L1Read precompiles — full read surface over HyperCore.
//
// CALLING CONVENTION: precompiles take the RAW ABI encoding of arguments with
// NO 4-byte function selector. viem's readContract prepends a selector and will
// fail with PrecompileError — use client.call() + encode/decodeAbiParameters.

import {
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
  type PublicClient,
} from "viem";

export const HL_TESTNET_RPC = "https://rpc.hyperliquid-testnet.xyz/evm";

export const PRECOMPILES = {
  position: "0x0000000000000000000000000000000000000800",
  spotBalance: "0x0000000000000000000000000000000000000801",
  userVaultEquity: "0x0000000000000000000000000000000000000802",
  withdrawable: "0x0000000000000000000000000000000000000803",
  delegations: "0x0000000000000000000000000000000000000804",
  delegatorSummary: "0x0000000000000000000000000000000000000805",
  markPx: "0x0000000000000000000000000000000000000806",
  oraclePx: "0x0000000000000000000000000000000000000807",
  spotPx: "0x0000000000000000000000000000000000000808",
  l1BlockNumber: "0x0000000000000000000000000000000000000809",
  perpAssetInfo: "0x000000000000000000000000000000000000080a",
  spotInfo: "0x000000000000000000000000000000000000080b",
  tokenInfo: "0x000000000000000000000000000000000000080C",
  tokenSupply: "0x000000000000000000000000000000000000080D",
  bbo: "0x000000000000000000000000000000000000080e",
  accountMarginSummary: "0x000000000000000000000000000000000000080f",
  coreUserExists: "0x0000000000000000000000000000000000000810",
} as const;

async function rawCall(client: PublicClient, to: Hex, data: Hex): Promise<Hex> {
  const { data: ret } = await client.call({ to, data });
  if (!ret) throw new Error("precompile returned no data");
  return ret;
}

// ---- scalar reads ----

export async function l1BlockNumber(client: PublicClient): Promise<bigint> {
  const ret = await rawCall(client, PRECOMPILES.l1BlockNumber, "0x");
  return decodeAbiParameters(parseAbiParameters("uint64"), ret)[0];
}

export async function markPx(client: PublicClient, index: number): Promise<bigint> {
  const data = encodeAbiParameters(parseAbiParameters("uint32"), [index]);
  return decodeAbiParameters(
    parseAbiParameters("uint64"),
    await rawCall(client, PRECOMPILES.markPx, data),
  )[0];
}

export async function oraclePx(client: PublicClient, index: number): Promise<bigint> {
  const data = encodeAbiParameters(parseAbiParameters("uint32"), [index]);
  return decodeAbiParameters(
    parseAbiParameters("uint64"),
    await rawCall(client, PRECOMPILES.oraclePx, data),
  )[0];
}

export async function spotPx(client: PublicClient, index: number): Promise<bigint> {
  const data = encodeAbiParameters(parseAbiParameters("uint32"), [index]);
  return decodeAbiParameters(
    parseAbiParameters("uint64"),
    await rawCall(client, PRECOMPILES.spotPx, data),
  )[0];
}

export async function coreUserExists(client: PublicClient, user: Hex): Promise<boolean> {
  const data = encodeAbiParameters(parseAbiParameters("address"), [user]);
  return decodeAbiParameters(
    parseAbiParameters("bool"),
    await rawCall(client, PRECOMPILES.coreUserExists, data),
  )[0];
}

// ---- struct reads ----

export interface SpotBalance {
  total: bigint;
  hold: bigint;
  entryNtl: bigint;
}
export async function spotBalance(
  client: PublicClient,
  user: Hex,
  token: bigint,
): Promise<SpotBalance> {
  const data = encodeAbiParameters(parseAbiParameters("address, uint64"), [user, token]);
  const [total, hold, entryNtl] = decodeAbiParameters(
    parseAbiParameters("uint64, uint64, uint64"),
    await rawCall(client, PRECOMPILES.spotBalance, data),
  );
  return { total, hold, entryNtl };
}

export interface Bbo {
  bid: bigint;
  ask: bigint;
}
export async function bbo(client: PublicClient, asset: number): Promise<Bbo> {
  const data = encodeAbiParameters(parseAbiParameters("uint32"), [asset]);
  const [bid, ask] = decodeAbiParameters(
    parseAbiParameters("uint64, uint64"),
    await rawCall(client, PRECOMPILES.bbo, data),
  );
  return { bid, ask };
}

export interface SpotInfo {
  name: string;
  tokens: readonly [bigint, bigint];
}
export async function spotInfo(client: PublicClient, spot: number): Promise<SpotInfo> {
  const data = encodeAbiParameters(parseAbiParameters("uint32"), [spot]);
  const [info] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "tokens", type: "uint64[2]" },
        ],
      },
    ],
    await rawCall(client, PRECOMPILES.spotInfo, data),
  );
  return info as SpotInfo;
}

export interface TokenInfo {
  name: string;
  spots: readonly bigint[];
  deployerTradingFeeShare: bigint;
  deployer: Hex;
  evmContract: Hex;
  szDecimals: number;
  weiDecimals: number;
  evmExtraWeiDecimals: number;
}
export async function tokenInfo(client: PublicClient, token: number): Promise<TokenInfo> {
  const data = encodeAbiParameters(parseAbiParameters("uint32"), [token]);
  const [info] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "spots", type: "uint64[]" },
          { name: "deployerTradingFeeShare", type: "uint64" },
          { name: "deployer", type: "address" },
          { name: "evmContract", type: "address" },
          { name: "szDecimals", type: "uint8" },
          { name: "weiDecimals", type: "uint8" },
          { name: "evmExtraWeiDecimals", type: "int8" },
        ],
      },
    ],
    await rawCall(client, PRECOMPILES.tokenInfo, data),
  );
  return info as TokenInfo;
}
