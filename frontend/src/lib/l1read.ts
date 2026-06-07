// Browser-side L1Read client. Talks to the Worker's read-only /api/rpc proxy
// (eth_call only). Same convention as the scripts: raw ABI args, NO selector.
// Network (mainnet|testnet) is selected per-call via the proxy query param.

import {
  createPublicClient,
  http,
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from "viem";

export type Network = "mainnet" | "testnet";

// HL public RPC. CORS is open (access-control-allow-origin: *), so the browser
// talks to it directly — no proxy needed for public reads.
export const RPC_URL: Record<Network, string> = {
  testnet: "https://rpc.hyperliquid-testnet.xyz/evm",
  mainnet: "https://rpc.hyperliquid.xyz/evm",
};

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

// address (lowercased) -> precompile name, for labeling raw requests in the UI.
export const PRECOMPILE_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(PRECOMPILES).map(([name, addr]) => [addr.toLowerCase(), name]),
);

// Cache one client per network. `batch: true` coalesces eth_calls issued in the
// same tick into a single JSON-RPC batch request — so a detail page that reads
// several precompiles at once sends ONE HTTP request, not N.
const clients: Partial<Record<Network, ReturnType<typeof createPublicClient>>> = {};
function makeClient(network: Network) {
  return (clients[network] ??= createPublicClient({
    transport: http(RPC_URL[network], { batch: true }),
  }));
}

// Low-level raw precompile call. Exposes the exact request (to, data) so the UI
// can show what was sent, not just the decoded result.
export async function rawCall(network: Network, to: Hex, data: Hex): Promise<Hex> {
  const ret = await makeClient(network).call({ to, data });
  if (!ret.data) throw new Error("no data");
  return ret.data;
}

export const u32 = (n: number) => encodeAbiParameters(parseAbiParameters("uint32"), [n]);
export const addr = (a: Hex) => encodeAbiParameters(parseAbiParameters("address"), [a]);
export const addrU64 = (a: Hex, n: bigint) => encodeAbiParameters(parseAbiParameters("address, uint64"), [a, n]);
export const addrU16 = (a: Hex, n: number) => encodeAbiParameters(parseAbiParameters("address, uint16"), [a, n]);
export const u32Addr = (n: number, a: Hex) => encodeAbiParameters(parseAbiParameters("uint32, address"), [n, a]);

// ---- scalars ----
export const l1BlockNumber = (net: Network) =>
  rawCall(net, PRECOMPILES.l1BlockNumber, "0x").then(
    (r) => decodeAbiParameters(parseAbiParameters("uint64"), r)[0],
  );

// EVM-side block number (standard eth_blockNumber, no precompile). Pairs with
// l1BlockNumber to show the HyperCore (L1) vs HyperEVM block heights side by side.
export const evmBlockNumber = (net: Network) => makeClient(net).getBlockNumber();

// Shared public client (e.g. to wait for a tx receipt after a wallet send).
export const evmClient = (net: Network) => makeClient(net);
export const markPx = (net: Network, i: number) =>
  rawCall(net, PRECOMPILES.markPx, u32(i)).then((r) => decodeAbiParameters(parseAbiParameters("uint64"), r)[0]);
export const oraclePx = (net: Network, i: number) =>
  rawCall(net, PRECOMPILES.oraclePx, u32(i)).then((r) => decodeAbiParameters(parseAbiParameters("uint64"), r)[0]);
export const spotPx = (net: Network, i: number) =>
  rawCall(net, PRECOMPILES.spotPx, u32(i)).then((r) => decodeAbiParameters(parseAbiParameters("uint64"), r)[0]);
export const withdrawable = (net: Network, user: Hex) =>
  rawCall(net, PRECOMPILES.withdrawable, addr(user)).then((r) => decodeAbiParameters(parseAbiParameters("uint64"), r)[0]);
export const coreUserExists = (net: Network, user: Hex) =>
  rawCall(net, PRECOMPILES.coreUserExists, addr(user)).then((r) => decodeAbiParameters(parseAbiParameters("bool"), r)[0]);

// ---- structs ----
export const spotBalance = (net: Network, user: Hex, token: bigint) =>
  rawCall(net, PRECOMPILES.spotBalance, encodeAbiParameters(parseAbiParameters("address, uint64"), [user, token])).then(
    (r) => {
      const [total, hold, entryNtl] = decodeAbiParameters(parseAbiParameters("uint64, uint64, uint64"), r);
      return { total, hold, entryNtl };
    },
  );

export const position = (net: Network, user: Hex, perp: number) =>
  rawCall(net, PRECOMPILES.position, encodeAbiParameters(parseAbiParameters("address, uint16"), [user, perp])).then(
    (r) => {
      const [szi, entryNtl, isolatedRawUsd, leverage, isIsolated] = decodeAbiParameters(
        parseAbiParameters("int64, uint64, int64, uint32, bool"),
        r,
      );
      return { szi, entryNtl, isolatedRawUsd, leverage, isIsolated };
    },
  );

export const userVaultEquity = (net: Network, user: Hex, vault: Hex) =>
  rawCall(net, PRECOMPILES.userVaultEquity, encodeAbiParameters(parseAbiParameters("address, address"), [user, vault])).then(
    (r) => {
      const [equity, lockedUntil] = decodeAbiParameters(parseAbiParameters("uint64, uint64"), r);
      return { equity, lockedUntil };
    },
  );

export const delegations = (net: Network, user: Hex) =>
  rawCall(net, PRECOMPILES.delegations, addr(user)).then((r) => {
    const [list] = decodeAbiParameters(
      [
        {
          type: "tuple[]",
          components: [
            { name: "validator", type: "address" },
            { name: "amount", type: "uint64" },
            { name: "lockedUntilTimestamp", type: "uint64" },
          ],
        },
      ],
      r,
    );
    return list as ReadonlyArray<{ validator: Hex; amount: bigint; lockedUntilTimestamp: bigint }>;
  });

export const delegatorSummary = (net: Network, user: Hex) =>
  rawCall(net, PRECOMPILES.delegatorSummary, addr(user)).then((r) => {
    const [delegated, undelegated, totalPendingWithdrawal, nPendingWithdrawals] = decodeAbiParameters(
      parseAbiParameters("uint64, uint64, uint64, uint64"),
      r,
    );
    return { delegated, undelegated, totalPendingWithdrawal, nPendingWithdrawals };
  });

export const bbo = (net: Network, asset: number) =>
  rawCall(net, PRECOMPILES.bbo, u32(asset)).then((r) => {
    const [bid, ask] = decodeAbiParameters(parseAbiParameters("uint64, uint64"), r);
    return { bid, ask };
  });

export const spotInfo = (net: Network, spot: number) =>
  rawCall(net, PRECOMPILES.spotInfo, u32(spot)).then((r) => {
    const [info] = decodeAbiParameters(
      [{ type: "tuple", components: [{ name: "name", type: "string" }, { name: "tokens", type: "uint64[2]" }] }],
      r,
    );
    return info as { name: string; tokens: readonly [bigint, bigint] };
  });

export const tokenInfo = (net: Network, token: number) =>
  rawCall(net, PRECOMPILES.tokenInfo, u32(token)).then((r) => {
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
      r,
    );
    return info as { name: string; szDecimals: number; weiDecimals: number; evmContract: Hex };
  });

export const perpAssetInfo = (net: Network, perp: number) =>
  rawCall(net, PRECOMPILES.perpAssetInfo, u32(perp)).then((r) => {
    const [info] = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "coin", type: "string" },
            { name: "marginTableId", type: "uint32" },
            { name: "szDecimals", type: "uint8" },
            { name: "maxLeverage", type: "uint8" },
            { name: "onlyIsolated", type: "bool" },
          ],
        },
      ],
      r,
    );
    return info as { coin: string; szDecimals: number; maxLeverage: number };
  });

export const tokenSupply = (net: Network, token: number) =>
  rawCall(net, PRECOMPILES.tokenSupply, u32(token)).then((r) => {
    const [info] = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "maxSupply", type: "uint64" },
            { name: "totalSupply", type: "uint64" },
            { name: "circulatingSupply", type: "uint64" },
            { name: "futureEmissions", type: "uint64" },
            {
              name: "nonCirculatingUserBalances",
              type: "tuple[]",
              components: [
                { name: "user", type: "address" },
                { name: "balance", type: "uint64" },
              ],
            },
          ],
        },
      ],
      r,
    );
    return info as { maxSupply: bigint; totalSupply: bigint; circulatingSupply: bigint };
  });

export const accountMarginSummary = (net: Network, perpDex: number, user: Hex) =>
  rawCall(net, PRECOMPILES.accountMarginSummary, encodeAbiParameters(parseAbiParameters("uint32, address"), [perpDex, user])).then(
    (r) => {
      const [accountValue, marginUsed, ntlPos, rawUsd] = decodeAbiParameters(
        parseAbiParameters("int64, uint64, uint64, int64"),
        r,
      );
      return { accountValue, marginUsed, ntlPos, rawUsd };
    },
  );
