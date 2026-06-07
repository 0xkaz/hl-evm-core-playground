import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { useNetwork } from "../lib/network";
import { useWallet, hasWallet } from "../lib/wallet";
import {
  CORE_WRITER,
  encodeUsdClassTransfer,
  encodeSpotSend,
  sendAction,
} from "../lib/corewriter";
import { evmClient, spotBalance, accountMarginSummary, type Network } from "../lib/l1read";
import { useSend, txScanUrl } from "../lib/useSend";
import { Field, Encoded, SimpleStatus, useAssetLists, LimitOrderForm } from "../orderui";

const ACTIONS = [
  { id: 1, name: "Limit order", what: "Place a limit order on a perp/spot book.", fields: "asset, isBuy, limitPx, sz, reduceOnly, tif, cloid", live: true },
  { id: 2, name: "Vault transfer", what: "Deposit to / withdraw from a vault.", fields: "vault, isDeposit, usd" },
  { id: 3, name: "Token delegate", what: "Delegate / undelegate staked tokens to a validator.", fields: "validator, wei, isUndelegate" },
  { id: 4, name: "Staking deposit", what: "Move tokens into staking.", fields: "wei" },
  { id: 5, name: "Staking withdraw", what: "Move tokens out of staking.", fields: "wei" },
  { id: 6, name: "Spot send", what: "Send a spot token to another address on HyperCore.", fields: "destination, token, wei", live: true },
  { id: 7, name: "USD class transfer", what: "Move USDC between your spot and perp balances (within HyperCore).", fields: "ntl, toPerp", live: true },
  { id: 8, name: "Finalize EVM contract", what: "Link an EVM contract to a Core token.", fields: "token, variant, createNonce" },
  { id: 9, name: "Add API wallet", what: "Authorize an API/agent wallet.", fields: "apiWallet, name" },
  { id: 10, name: "Cancel order by oid", what: "Cancel a resting order by order id.", fields: "asset, oid" },
  { id: 11, name: "Cancel order by cloid", what: "Cancel a resting order by client order id.", fields: "asset, cloid" },
  { id: 12, name: "Approve builder fee", what: "Approve a builder to take a fee on your orders.", fields: "maxFeeRate, builder" },
  { id: 13, name: "Send asset", what: "Move an asset across your accounts/sub-accounts/dexes within HyperCore.", fields: "dest, subAccount, srcDex, dstDex, token, wei" },
  { id: 14, name: "Reflect EVM supply change", what: "Mint/burn reflection for an aligned quote token.", fields: "token, wei, isMint" },
  { id: 15, name: "Borrow/lend", what: "Supply or withdraw in a borrow/lend market.", fields: "op, token, wei" },
];

export function CoreWriterPage() {
  const { user, connect } = useWallet();
  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">CoreWriter</h1>
      <p className="mb-1 text-sm text-zinc-400">
        Write actions from HyperEVM to HyperCore via the system contract{" "}
        <span className="font-mono">{CORE_WRITER}</span>.
      </p>
      <p className="mb-6 text-sm text-zinc-400">
        Encoding: version byte + 3-byte action ID + ABI body. Execution is <b>async</b> — the EVM tx
        succeeds before HyperCore runs the action a few seconds later; an L1-side failure does not
        revert the EVM tx. Sending is by your wallet directly (testnet recommended); the server is
        never in the path.
      </p>

      {!user ? (
        <button onClick={connect} className="mb-8 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium">
          {hasWallet() ? "Connect wallet to send actions" : "No wallet detected"}
        </button>
      ) : (
        <div className="mb-8 space-y-4">
          <UsdClassTransfer user={user} />
          <SpotSend user={user} />
          <LimitOrder user={user} />
        </div>
      )}

      <h2 className="mb-3 text-lg font-medium">All actions</h2>
      <ul className="space-y-2">
        {ACTIONS.map((a) => (
          <li key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-baseline gap-2">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">#{a.id}</span>
              <span className="font-medium">{a.name}</span>
              {a.live && <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-[10px] text-emerald-300">live sender above</span>}
            </div>
            <p className="mt-1 text-sm text-zinc-400">{a.what}</p>
            <p className="mt-1 font-mono text-xs text-zinc-600">({a.fields})</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- shared bits ----

function Card({ id, title, children }: { id: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">#{id}</span>
        <span className="font-medium">{title}</span>
      </div>
      {children}
    </div>
  );
}


// ---- #7 USD class transfer (with L1 settle tracking + balances) ----

async function readBalances(network: Network, user: Hex) {
  const [spot, margin] = await Promise.all([
    spotBalance(network, user, 0n),
    accountMarginSummary(network, 0, user),
  ]);
  return { spotUsdc: spot.total, perpValue: margin.accountValue };
}
const fmtUsdc = (v: bigint) => (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });

type SettleState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "mining"; txHash: Hex; sentAt: number }
  | { phase: "settling"; txHash: Hex; sentAt: number; evmMs: number }
  | { phase: "settled"; txHash: Hex; evmMs: number; l1Ms: number }
  | { phase: "timeout"; txHash: Hex; evmMs: number }
  | { phase: "error"; message: string };

function UsdClassTransfer({ user }: { user: Hex }) {
  const { network } = useNetwork();
  const [usd, setUsd] = useState("1");
  const [toPerp, setToPerp] = useState(true);
  const [state, setState] = useState<SettleState>({ phase: "idle" });
  const [bal, setBal] = useState<{ spotUsdc: bigint; perpValue: bigint } | null>(null);

  const refresh = useCallback(() => {
    readBalances(network, user).then(setBal).catch(() => setBal(null));
  }, [network, user]);
  useEffect(() => {
    setBal(null);
    refresh();
  }, [refresh]);

  const ntl = (() => {
    try {
      return BigInt(Math.round(Number(usd) * 1e6));
    } catch {
      return 0n;
    }
  })();
  const action = encodeUsdClassTransfer(ntl, toPerp);

  const send = async () => {
    setState({ phase: "sending" });
    try {
      const before = await readBalances(network, user);
      const sentAt = Date.now();
      const txHash = await sendAction(network, user, action);
      setState({ phase: "mining", txHash, sentAt });
      await evmClient(network).waitForTransactionReceipt({ hash: txHash });
      const evmMs = Date.now() - sentAt;
      setState({ phase: "settling", txHash, sentAt, evmMs });
      const deadline = Date.now() + 30_000;
      let done = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        const now = await readBalances(network, user);
        setBal(now);
        if (now.spotUsdc !== before.spotUsdc || now.perpValue !== before.perpValue) {
          setState({ phase: "settled", txHash, evmMs, l1Ms: Date.now() - sentAt });
          done = true;
          break;
        }
      }
      if (!done) setState({ phase: "timeout", txHash, evmMs });
    } catch (e) {
      setState({ phase: "error", message: (e as Error).message.split("\n")[0] });
    }
  };

  const busy = state.phase === "sending" || state.phase === "mining" || state.phase === "settling";
  return (
    <Card id={7} title="USD class transfer — move USDC spot↔perp">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Bal label="spot USDC" value={bal ? fmtUsdc(bal.spotUsdc) : "…"} />
        <Bal label="perp value" value={bal ? fmtUsdc(bal.perpValue) : "…"} />
      </div>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <Field label="USD amount">
          <input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="decimal" className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm" />
        </Field>
        <Field label="Direction">
          <select value={toPerp ? "perp" : "spot"} onChange={(e) => setToPerp(e.target.value === "perp")} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm">
            <option value="perp">spot → perp</option>
            <option value="spot">perp → spot</option>
          </select>
        </Field>
        <button onClick={send} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
      </div>
      <Encoded action={action} />
      <SettleStatus state={state} network={network} />
    </Card>
  );
}

function SettleStatus({ state, network }: { state: SettleState; network: Network }) {
  if (state.phase === "idle") return null;
  if (state.phase === "error") return <p className="mt-2 text-sm text-red-400">❌ {state.message}</p>;
  if (state.phase === "sending") return <p className="mt-2 text-sm text-zinc-400">Awaiting wallet signature…</p>;
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-sm">
      <a href={txScanUrl(network, state.txHash)} target="_blank" rel="noreferrer" className="font-mono text-sky-400 underline">{state.txHash.slice(0, 10)}…</a>
      {state.phase === "mining" ? <div className="text-zinc-400">⏳ 1/2 EVM confirming…</div> : <div className="text-green-400">✅ 1/2 EVM confirmed in {state.evmMs} ms</div>}
      {state.phase === "settling" && <div className="text-zinc-400">⏳ 2/2 polling L1Read for the balance change…</div>}
      {state.phase === "settled" && <div className="text-green-400">✅ 2/2 HyperCore executed {state.l1Ms} ms after send (≈{state.l1Ms - state.evmMs} ms after EVM confirm) — that's the async lag.</div>}
      {state.phase === "timeout" && <div className="text-amber-400">⚠️ 2/2 EVM confirmed, no L1 change in 30s (maybe rejected on HyperCore; EVM tx did NOT revert).</div>}
    </div>
  );
}

// ---- #6 Spot send ----

function SpotSend({ user }: { user: Hex }) {
  const { network } = useNetwork();
  const { state, send, busy } = useSend(network, user);
  const { tokens } = useAssetLists(network);
  const [dest, setDest] = useState("");
  const [token, setToken] = useState(0);
  const [amount, setAmount] = useState("0");

  const valid = /^0x[0-9a-fA-F]{40}$/.test(dest);
  const action = valid ? encodeSpotSend(dest as Hex, BigInt(token), BigInt(amount || "0")) : null;

  return (
    <Card id={6} title="Spot send — send a spot token to another address">
      <p className="mb-2 text-xs text-amber-400/80">This moves real funds to another address. amount is in token wei (integer).</p>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <Field label="Destination (0x…)">
          <input value={dest} onChange={(e) => setDest(e.target.value)} spellCheck={false} className="w-80 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm" />
        </Field>
        <Field label="Token">
          <select value={token} onChange={(e) => setToken(Number(e.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm">
            {tokens.length === 0 ? <option value={0}>USDC (#0)</option> : tokens.map((t) => <option key={t.index} value={t.index}>{t.name} (#{t.index})</option>)}
          </select>
        </Field>
        <Field label="Amount (wei)">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm" />
        </Field>
        <button onClick={() => action && send(action)} disabled={busy || !action} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
      </div>
      {!valid && dest && <p className="text-xs text-red-400">Enter a valid 0x address.</p>}
      {action && <Encoded action={action} />}
      <SimpleStatus state={state} network={network} />
    </Card>
  );
}

// ---- #1 Limit order ----

function LimitOrder({ user }: { user: Hex }) {
  return (
    <Card id={1} title="Limit order — place an order on a book">
      <p className="mb-2 text-xs text-amber-400/80">A matched order leaves a position; a resting order ties up margin. Pick the asset below — no raw ids needed.</p>
      <LimitOrderForm user={user} />
    </Card>
  );
}

// ---- tiny ui helpers ----

function Bal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-mono text-sm text-zinc-200">{value}</div>
    </div>
  );
}
