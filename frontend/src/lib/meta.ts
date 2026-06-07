// Fetch token / spot-pair / perp lists from the info API (via the read-only
// Worker proxy) so the UI can offer clickable pickers instead of free-text ids.

import type { Network } from "./l1read";

// Asset-list metadata goes through the Worker's cached /api/meta endpoint
// (2-min TTL). These lists rarely change, so this avoids hammering the info API.
// (Per-asset/account precompile reads still go directly to the RPC.)
async function info<T>(network: Network, type: string): Promise<T> {
  const res = await fetch(`/api/meta?network=${network}&type=${type}`);
  if (!res.ok) throw new Error(`meta ${type} failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface SpotPair {
  index: number; // spot index (arg for spotInfo/spotPx/bbo asset)
  name: string; // resolved "BASE/QUOTE" (e.g. "HFUN/USDC"); falls back to raw
  rawName: string; // the spotMeta name, e.g. "@1" or "PURR/USDC"
  tokens: [number, number]; // [base, quote] token ids
  isCanonical: boolean;
  szDecimals: number; // base token szDecimals — needed to scale spotPx: /10^(8 - szDecimals)
}

export interface Token {
  index: number; // token id (arg for spotBalance / tokenInfo / tokenSupply)
  name: string;
  szDecimals: number;
}

export interface Perp {
  index: number; // perp index (arg for oraclePx/markPx/perpAssetInfo)
  name: string;
  maxLeverage: number;
  szDecimals: number; // needed to scale oraclePx/markPx: /10^(6 - szDecimals)
}

interface SpotMetaResp {
  universe: Array<{ index: number; name: string; tokens: [number, number]; isCanonical?: boolean }>;
  tokens: Array<{ index: number; name: string; szDecimals: number }>;
}
interface MetaResp {
  universe: Array<{ name: string; maxLeverage: number; szDecimals: number }>;
}

// One spotMeta call yields both the pair list and the token list — don't fetch
// it twice. Pair names are resolved from the token list ("@1" -> "HFUN/USDC")
// and canonical pairs are sorted first (they're the tradeable, named markets).
export async function fetchSpot(net: Network): Promise<{ pairs: SpotPair[]; tokens: Token[] }> {
  const m = await info<SpotMetaResp>(net, "spotMeta");
  const tok = new Map(m.tokens.map((t) => [t.index, t]));
  const pairs: SpotPair[] = m.universe
    .map((u) => {
      const base = tok.get(u.tokens[0]);
      const quote = tok.get(u.tokens[1]);
      const resolved = base && quote ? `${base.name}/${quote.name}` : u.name;
      // Prefer a real "X/Y" name; keep the canonical name if it already has one.
      const name = u.name.startsWith("@") ? resolved : u.name;
      return { index: u.index, name, rawName: u.name, tokens: u.tokens, isCanonical: !!u.isCanonical, szDecimals: base?.szDecimals ?? 0 };
    })
    .sort((a, b) => Number(b.isCanonical) - Number(a.isCanonical) || a.index - b.index);
  return {
    pairs,
    tokens: m.tokens.map((t) => ({ index: t.index, name: t.name, szDecimals: t.szDecimals })),
  };
}

export async function fetchPerps(net: Network): Promise<Perp[]> {
  const m = await info<MetaResp>(net, "meta");
  // perp index is the position in the universe array.
  return m.universe.map((u, i) => ({ index: i, name: u.name, maxLeverage: u.maxLeverage, szDecimals: u.szDecimals }));
}

// ---- open orders (per-user; NOT a precompile — L1Read has no open-orders read,
// so this is the documented exception that goes through the info API) ----

const INFO_URL: Record<Network, string> = {
  testnet: "https://api.hyperliquid-testnet.xyz/info",
  mainnet: "https://api.hyperliquid.xyz/info",
};

export interface OpenOrder {
  coin: string; // "BTC" (perp) or "PURR/USDC" / "@1" (spot)
  limitPx: string;
  oid: number;
  side: "A" | "B"; // A = ask/sell, B = bid/buy
  sz: string;
  timestamp: number;
}

export async function fetchOpenOrders(net: Network, user: string): Promise<OpenOrder[]> {
  const res = await fetch(INFO_URL[net], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "openOrders", user }),
  });
  if (!res.ok) throw new Error(`openOrders failed: ${res.status}`);
  return (await res.json()) as OpenOrder[];
}

// OHLCV candles for a market (info API `candleSnapshot`). Like open orders, this
// is market data the precompiles don't expose, so it uses the info API.
export interface Candle {
  t: number; // open time (ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface RawCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

export async function fetchCandles(
  net: Network,
  coin: string,
  interval: string,
  lookbackMs: number,
  now: number,
): Promise<Candle[]> {
  const res = await fetch(INFO_URL[net], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime: now - lookbackMs, endTime: now },
    }),
  });
  if (!res.ok) throw new Error(`candleSnapshot failed: ${res.status}`);
  const raw = (await res.json()) as RawCandle[];
  return raw.map((c) => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v }));
}

// Resolve an order's `coin` (as reported by openOrders — perp name like "BTC",
// or raw spot name like "@107") to both the CoreWriter order asset id (needed to
// cancel) and a human label like "HYPE/USDC".
export async function fetchCoinResolver(
  net: Network,
): Promise<{ assetId: Record<string, number>; label: Record<string, string> }> {
  const [perps, { pairs }] = await Promise.all([fetchPerps(net), fetchSpot(net)]);
  const assetId: Record<string, number> = {};
  const label: Record<string, string> = {};
  for (const p of perps) {
    assetId[p.name] = p.index;
    label[p.name] = p.name;
  }
  for (const s of pairs) {
    // openOrders keys spot coins by rawName ("@107"); map both raw and resolved.
    assetId[s.rawName] = 10000 + s.index;
    assetId[s.name] = 10000 + s.index;
    label[s.rawName] = s.name; // "@107" -> "HYPE/USDC"
    label[s.name] = s.name;
  }
  return { assetId, label };
}
