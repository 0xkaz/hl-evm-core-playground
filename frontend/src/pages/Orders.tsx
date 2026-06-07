import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { useNetwork } from "../lib/network";
import { useWallet, hasWallet } from "../lib/wallet";
import { fetchOpenOrders, fetchCoinResolver, type OpenOrder } from "../lib/meta";
import { encodeCancelOrderByOid, sendAction } from "../lib/corewriter";
import { evmClient, type Network } from "../lib/l1read";
import { txScanUrl } from "../lib/useSend";
import { LimitOrderForm } from "../orderui";

// Open orders come from the info API, NOT a precompile — L1Read has no
// open-orders read. This is the documented exception (see capabilities docs).
// The `user` query arg is the connected EVM address; HyperCore and HyperEVM
// share the same address space, so it's the same account. Cancelling is a
// CoreWriter action (#10) signed by that same wallet — no auth mismatch.
export function Orders() {
  const { network } = useNetwork();
  const { user, connect } = useWallet();
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Orders <span className="text-sm font-normal text-zinc-500">({network})</span></h1>
      <p className="mb-6 text-sm text-zinc-400">
        Place a limit order and see / cancel your resting orders — all on one page. The list comes
        from the info API (L1Read has no open-orders precompile); placing and cancelling are
        CoreWriter actions (#1 / #10) signed by your wallet.
      </p>
      {!user ? (
        <button onClick={connect} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium">
          {hasWallet() ? "Connect wallet" : "No wallet detected"}
        </button>
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-emerald-900 bg-emerald-950/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">#1</span>
              <span className="font-medium">Place a limit order</span>
            </div>
            <p className="mb-2 text-xs text-amber-400/80">A matched order leaves a position; a resting order ties up margin. Pick the asset — no raw ids needed.</p>
            {/* After EVM confirmation, refresh the list below so the new order appears. */}
            <LimitOrderForm user={user} onPlaced={() => setTimeout(() => setReloadKey((k) => k + 1), 2000)} />
          </div>
          <OrderList user={user} network={network} reloadKey={reloadKey} />
        </>
      )}
    </div>
  );
}

function OrderList({ user, network, reloadKey }: { user: Hex; network: Network; reloadKey: number }) {
  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [resolver, setResolver] = useState<{ assetId: Record<string, number>; label: Record<string, string> }>({ assetId: {}, label: {} });
  const [busyOid, setBusyOid] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ oid: number; text: string; tx?: string; err?: boolean } | null>(null);

  const load = useCallback(() => {
    setOrders(null);
    fetchOpenOrders(network, user).then(setOrders).catch(() => setOrders([]));
    fetchCoinResolver(network).then(setResolver).catch(() => setResolver({ assetId: {}, label: {} }));
  }, [network, user]);

  useEffect(() => {
    load();
    // reloadKey bumps when a new order is placed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, reloadKey]);

  const cancel = async (o: OpenOrder) => {
    const asset = resolver.assetId[o.coin];
    if (asset === undefined) {
      setMsg({ oid: o.oid, text: `can't resolve asset id for ${o.coin}`, err: true });
      return;
    }
    setBusyOid(o.oid);
    setMsg(null);
    try {
      const action = encodeCancelOrderByOid(asset, BigInt(o.oid));
      const txHash = await sendAction(network, user, action);
      setMsg({ oid: o.oid, text: "cancel sent", tx: txHash });
      await evmClient(network).waitForTransactionReceipt({ hash: txHash });
      setMsg({ oid: o.oid, text: "cancel confirmed on EVM — HyperCore removes it async", tx: txHash });
      // Refresh after a moment so the cancelled order drops off.
      setTimeout(load, 3000);
    } catch (e) {
      setMsg({ oid: o.oid, text: (e as Error).message.split("\n")[0], err: true });
    } finally {
      setBusyOid(null);
    }
  };

  if (orders === null) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (orders.length === 0)
    return (
      <div>
        <p className="text-sm text-zinc-400">No open orders. Place a limit order on the CoreWriter page, then come back.</p>
        <button onClick={load} className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm">Refresh</button>
      </div>
    );

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={load} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm">Refresh</button>
      </div>
      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.oid} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-sm">
                <span className={o.side === "B" ? "text-green-400" : "text-red-400"}>{o.side === "B" ? "BUY" : "SELL"}</span>{" "}
                <span className="text-zinc-200">{resolver.label[o.coin] ?? o.coin}</span>{" "}
                {resolver.label[o.coin] && resolver.label[o.coin] !== o.coin && (
                  <span className="text-zinc-600">({o.coin})</span>
                )}{" "}
                <span className="text-zinc-400">{o.sz} @ {o.limitPx}</span>{" "}
                <span className="text-zinc-600">oid {o.oid}</span>
              </div>
              <button
                onClick={() => cancel(o)}
                disabled={busyOid === o.oid}
                className="rounded-lg bg-red-600 px-3 py-1 text-sm font-medium disabled:opacity-50"
              >
                {busyOid === o.oid ? "Cancelling…" : "Cancel"}
              </button>
            </div>
            {msg?.oid === o.oid && (
              <div className={`mt-2 text-xs ${msg.err ? "text-red-400" : "text-green-400"}`}>
                {msg.err ? "❌ " : "✅ "}
                {msg.text}
                {msg.tx && (
                  <>
                    {" "}
                    <a href={txScanUrl(network, msg.tx)} target="_blank" rel="noreferrer" className="font-mono text-sky-400 underline">{msg.tx.slice(0, 10)}…</a>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
