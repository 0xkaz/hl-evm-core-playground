import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNetwork } from "../lib/network";
import { fetchPerps, fetchSpot, fetchCandles, type Perp, type SpotPair, type Token, type Candle } from "../lib/meta";

const FEATURES = [
  { to: "/account", title: "L1Read", what: "Read HyperCore state from the EVM — balances, positions, prices — via the read precompiles (0x…0800+)." },
  { to: "/orders", title: "CoreWriter", what: "Write actions to HyperCore — place/cancel orders, transfers, staking — via the system contract 0x333…333." },
  { to: "/bridge", title: "Bridge", what: "Move funds between HyperCore and the EVM (e.g. HYPE for gas) through token system addresses." },
  { to: "/system", title: "System", what: "The full map of precompiles, the CoreWriter contract, and system addresses that connect the two layers." },
];

// Top page: what this is + a HYPE chart + asset lists. Chart/lists use the info
// API (market data the precompiles don't expose); no precompiles called here.
export function Explore() {
  const { network } = useNetwork();
  const [perps, setPerps] = useState<Perp[]>([]);
  const [spots, setSpots] = useState<SpotPair[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchPerps(network).then((v) => !cancelled && setPerps(v)).catch(() => {});
    fetchSpot(network)
      .then(({ pairs, tokens }) => {
        if (cancelled) return;
        setSpots(pairs);
        setTokens(tokens);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [network]);

  return (
    <div>
      {/* What this is */}
      <section className="mb-8">
        <h1 className="mb-1 text-2xl font-semibold">HyperEVM Playground</h1>
        <p className="mb-4 text-zinc-400">
          A hands-on demo of how an EVM app talks to <b>HyperCore</b> (Hyperliquid's L1) from the{" "}
          <b>HyperEVM</b>: read its state, write actions to it, and bridge funds between the two
          layers — all signed by your own wallet, nothing through a server.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-600">
              <div className="font-medium text-zinc-100">{f.title}</div>
              <div className="mt-1 text-sm text-zinc-400">{f.what}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* HYPE chart */}
      <section className="mb-8">
        <HypeChart network={network} />
      </section>

      {/* Asset lists */}
      <section>
        <p className="mb-3 text-sm text-zinc-400">
          Browse HyperCore assets on {network}. Click an item to read its L1Read precompiles (batched
          into one request).
        </p>
        <div className="grid gap-6 sm:grid-cols-3">
          <List title="Perps" items={perps.map((p) => ({ to: `/perp/${p.index}`, label: p.name }))} />
          <List title="Spot pairs" items={spots.map((s) => ({ to: `/spot/${s.index}`, label: s.name }))} />
          <List title="Tokens" items={tokens.map((t) => ({ to: `/token/${t.index}`, label: `${t.name} (#${t.index})` }))} />
        </div>
      </section>
    </div>
  );
}

function HypeChart({ network }: { network: ReturnType<typeof useNetwork>["network"] }) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setCandles(null);
    // 7 days of 1h candles for HYPE perp. now passed in (Date.now allowed in app code).
    fetchCandles(network, "HYPE", "1h", 7 * 24 * 3600 * 1000, Date.now())
      .then((c) => !cancelled && setCandles(c))
      .catch(() => !cancelled && setCandles([]));
    return () => {
      cancelled = true;
    };
  }, [network]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-zinc-300">HYPE · 1h · 7d <span className="text-zinc-600">(info API candleSnapshot)</span></h2>
        {candles && candles.length > 0 && (
          <span className="font-mono text-sm text-zinc-200">{candles[candles.length - 1].c}</span>
        )}
      </div>
      {candles === null ? (
        <div className="h-40 animate-pulse rounded bg-zinc-800/50" />
      ) : candles.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-zinc-600">no candle data on {network}</div>
      ) : (
        <Sparkline candles={candles} />
      )}
    </div>
  );
}

// Dependency-free SVG line chart of candle closes, with hi/lo band.
function Sparkline({ candles }: { candles: Candle[] }) {
  const W = 720;
  const H = 160;
  const pad = 6;
  const closes = candles.map((c) => c.c);
  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (candles.length - 1 || 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
  const line = closes.map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const area = `${line} L${x(closes.length - 1).toFixed(1)},${(H - pad).toFixed(1)} L${x(0).toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const up = closes[closes.length - 1] >= closes[0];
  const stroke = up ? "#34d399" : "#f87171";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <path d={area} fill={stroke} opacity={0.08} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} />
      <text x={pad} y={12} className="fill-zinc-500" fontSize={10}>{hi.toPrecision(5)}</text>
      <text x={pad} y={H - 2} className="fill-zinc-500" fontSize={10}>{lo.toPrecision(5)}</text>
    </svg>
  );
}

function List({ title, items }: { title: string; items: Array<{ to: string; label: string }> }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-zinc-300">{title}</h2>
      <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900">
        {items.length === 0 ? (
          <div className="p-2 text-sm text-zinc-600">…</div>
        ) : (
          items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className="block px-3 py-1.5 font-mono text-sm text-zinc-300 hover:bg-zinc-800"
            >
              {it.label}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
