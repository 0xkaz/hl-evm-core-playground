import { useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { useNetwork } from "./lib/network";
import { useSend, txScanUrl, type SendState } from "./lib/useSend";
import { encodeLimitOrder } from "./lib/corewriter";
import { oraclePx, spotPx, spotBalance, position, withdrawable, tokenInfo, bbo, type Network } from "./lib/l1read";
import { fetchPerps, fetchSpot, type Perp, type SpotPair, type Token } from "./lib/meta";

// Shared order UI used by both the CoreWriter and Orders pages.

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export function Encoded({ action }: { action: Hex }) {
  return (
    <div className="mt-2 font-mono text-xs text-zinc-500">
      encoded: <span className="break-all text-amber-300/80">{action}</span>
    </div>
  );
}

export function SimpleStatus({ state, network }: { state: SendState; network: Network }) {
  if (state.phase === "idle") return null;
  if (state.phase === "error") return <p className="mt-2 text-sm text-red-400">❌ {state.message}</p>;
  if (state.phase === "sending") return <p className="mt-2 text-sm text-zinc-400">Awaiting wallet signature…</p>;
  return (
    <div className="mt-2 text-sm">
      <a href={txScanUrl(network, state.txHash)} target="_blank" rel="noreferrer" className="font-mono text-sky-400 underline">
        {state.txHash.slice(0, 10)}…
      </a>{" "}
      {state.phase === "mining" ? (
        <span className="text-zinc-400">⏳ confirming…</span>
      ) : (
        <span className="text-green-400">✅ EVM confirmed in {state.evmMs} ms — HyperCore executes async shortly after.</span>
      )}
    </div>
  );
}

// Load token / perp / spot lists once per network for the pickers.
export function useAssetLists(network: Network) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [perps, setPerps] = useState<Perp[]>([]);
  const [spots, setSpots] = useState<SpotPair[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchSpot(network).then(({ tokens, pairs }) => {
      if (cancelled) return;
      setTokens(tokens);
      setSpots(pairs);
    }).catch(() => {});
    fetchPerps(network).then((v) => !cancelled && setPerps(v)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [network]);
  return { tokens, perps, spots };
}

// CoreWriter #1 limit order form. Asset picked from lists (no raw ids), with the
// current price shown and presets. `onPlaced` fires after EVM confirmation so a
// host page (Orders) can refresh its list.
export function LimitOrderForm({ user, onPlaced }: { user: Hex; onPlaced?: () => void }) {
  const { network } = useNetwork();
  const { state, send, busy } = useSend(network, user);
  const { perps, spots, tokens } = useAssetLists(network);

  const [kind, setKind] = useState<"perp" | "spot">("spot");
  const [idx, setIdx] = useState(0);
  const [touched, setTouched] = useState(false); // user changed the asset
  const [isBuy, setIsBuy] = useState(true);
  const [px, setPx] = useState("");
  const [sz, setSz] = useState("");
  const [tif, setTif] = useState(2); // Gtc
  const [mid, setMid] = useState<number | null>(null);
  const [book, setBook] = useState<{ bid: number; ask: number } | null>(null);

  // Find the HYPE market index for a given kind (spot HYPE/USDC, or HYPE perp).
  // Network-independent: looked up by name, not a hardcoded id.
  const hypeIdx = (k: "perp" | "spot"): number | null => {
    if (k === "perp") return perps.find((p) => p.name === "HYPE")?.index ?? null;
    const m = spots.find((s) => s.name === "HYPE/USDC" || s.rawName === "HYPE/USDC");
    return m?.index ?? null;
  };

  // Default to HYPE once the lists load (until the user picks something else).
  useEffect(() => {
    if (touched) return;
    const h = hypeIdx(kind);
    if (h != null) setIdx(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perps, spots, kind, touched]);

  const pick = (k: "perp" | "spot") => {
    setKind(k);
    const h = hypeIdx(k);
    setIdx(h ?? 0); // prefer HYPE on the new market; else first
  };

  const assetId = kind === "perp" ? idx : 10000 + idx;
  const list = kind === "perp" ? perps : spots;
  const selected = list.find((a) => a.index === idx);
  const name = selected?.name ?? `#${idx}`;
  // Price scaling per the official spec: divide the raw uint64 by
  //   10^(6 - szDecimals) for perps, 10^(8 - base szDecimals) for spot.
  const szDecimals = selected?.szDecimals ?? 0;
  const pxDivisor = 10 ** ((kind === "perp" ? 6 : 8) - szDecimals);

  useEffect(() => {
    let cancelled = false;
    setMid(null);
    setBook(null);
    const p = kind === "perp" ? oraclePx(network, idx) : spotPx(network, idx);
    p.then((v) => !cancelled && setMid(Number(v) / pxDivisor)).catch(() => !cancelled && setMid(null));
    // best bid/ask from the bbo precompile (asset = order asset id).
    bbo(network, assetId)
      .then((b) => !cancelled && setBook({ bid: Number(b.bid) / pxDivisor, ask: Number(b.ask) / pxDivisor }))
      .catch(() => !cancelled && setBook(null));
    return () => {
      cancelled = true;
    };
    // pxDivisor depends on the selected asset's szDecimals (loaded async), so
    // include it so the price rescales once metadata arrives.
  }, [network, kind, idx, assetId, pxDivisor]);

  // Current holdings for the selected market, so you know what you have before
  // ordering. spot: base + quote (USDC) balances; perp: position size + free margin.
  const [holdings, setHoldings] = useState<string | null>(null);
  const spotTokens = kind === "spot" ? (selected as SpotPair | undefined)?.tokens : undefined;
  const baseTok = spotTokens?.[0];
  const quoteTok = spotTokens?.[1];
  const baseName = baseTok !== undefined ? (tokens.find((t) => t.index === baseTok)?.name ?? `#${baseTok}`) : "";
  useEffect(() => {
    let cancelled = false;
    setHoldings(null);
    const fmt = (wei: bigint, dec: number) => (Number(wei) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 6 });
    const run = async () => {
      if (kind === "spot" && baseTok !== undefined && quoteTok !== undefined) {
        // tokenInfo gives the base token's weiDecimals so we can show a human amount.
        const [b, q, info] = await Promise.all([
          spotBalance(network, user, BigInt(baseTok)),
          spotBalance(network, user, BigInt(quoteTok)),
          tokenInfo(network, baseTok),
        ]);
        if (!cancelled) setHoldings(`${baseName}: ${fmt(b.total, info.weiDecimals)} · USDC: ${fmt(q.total, 8)}`);
      } else if (kind === "perp") {
        const [pos, w] = await Promise.all([position(network, user, idx), withdrawable(network, user)]);
        if (!cancelled) setHoldings(`position szi: ${pos.szi.toString()} · entryNtl: ${fmt(pos.entryNtl, 6)} · free margin (withdrawable): ${fmt(w, 6)}`);
      }
    };
    run().catch(() => !cancelled && setHoldings("(unavailable)"));
    return () => {
      cancelled = true;
    };
  }, [network, kind, idx, user, baseTok, quoteTok, baseName]);

  const toScaled = (s: string) => {
    try {
      return BigInt(Math.round(Number(s) * 1e8));
    } catch {
      return 0n;
    }
  };
  const action = encodeLimitOrder({
    asset: assetId,
    isBuy,
    limitPx: toScaled(px || "0"),
    sz: toScaled(sz || "0"),
    reduceOnly: false,
    tif,
    cloid: 0n,
  });

  const preset = (mult: number) => {
    if (mid != null) setPx((mid * mult).toPrecision(6));
  };

  const placed = state.phase === "mined";
  useEffect(() => {
    if (placed) onPlaced?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <Field label="Market">
          <select value={kind} onChange={(e) => pick(e.target.value as "perp" | "spot")} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm">
            <option value="perp">perp</option>
            <option value="spot">spot</option>
          </select>
        </Field>
        <Field label="Asset">
          <select value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setTouched(true); }} className="max-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm">
            {list.length === 0 ? <option value={0}>#0</option> : list.map((a) => <option key={a.index} value={a.index}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Side">
          <select value={isBuy ? "buy" : "sell"} onChange={(e) => setIsBuy(e.target.value === "buy")} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm">
            <option value="buy">buy</option>
            <option value="sell">sell</option>
          </select>
        </Field>
        <Field label="Limit px">
          <input value={px} onChange={(e) => setPx(e.target.value)} inputMode="decimal" placeholder={mid != null ? String(mid) : "price"} className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm" />
        </Field>
        <Field label="Size">
          <input value={sz} onChange={(e) => setSz(e.target.value)} inputMode="decimal" placeholder="size" className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm" />
        </Field>
        <Field label="Tif">
          <select value={tif} onChange={(e) => setTif(Number(e.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm">
            <option value={1}>Alo</option>
            <option value={2}>Gtc</option>
            <option value={3}>Ioc</option>
          </select>
        </Field>
        <button onClick={() => send(action)} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50">{busy ? "Sending…" : "Place order"}</button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">{name} {kind === "perp" ? "oracle" : "spot"} px:</span>
        <span className="font-mono text-zinc-200">{mid != null ? mid : "…"}</span>
        {mid != null && (
          <>
            <button onClick={() => preset(1)} className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-800">= mid</button>
            <button onClick={() => preset(0.99)} className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-800">-1%</button>
            <button onClick={() => preset(1.01)} className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-800">+1%</button>
            <span className="text-zinc-600">order asset id: {assetId}</span>
          </>
        )}
      </div>

      {/* Best bid/ask from the book — click to drop into the price field. A buy
          at the ask (or sell at the bid) fills immediately; resting goes the
          other side. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">book:</span>
        {book ? (
          <>
            <button onClick={() => setPx(String(book.bid))} title="best bid — sell here to fill" className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-green-400 hover:bg-zinc-800">bid {book.bid}</button>
            <button onClick={() => setPx(String(book.ask))} title="best ask — buy here to fill" className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-red-400 hover:bg-zinc-800">ask {book.ask}</button>
            <span className="text-zinc-600">{isBuy ? "buy at ask fills now" : "sell at bid fills now"}</span>
          </>
        ) : (
          <span className="text-zinc-600">…</span>
        )}
      </div>

      {/* Current holdings for the selected market, so you can size the order. */}
      <div className="mb-2 text-xs">
        <span className="text-zinc-500">your {kind === "spot" ? "balances" : "position"}: </span>
        <span className="font-mono text-zinc-300">{holdings ?? "…"}</span>
      </div>

      <Encoded action={action} />
      <SimpleStatus state={state} network={network} />
    </div>
  );
}
