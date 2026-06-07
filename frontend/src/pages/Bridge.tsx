import { useCallback, useEffect, useState } from "react";
import { formatEther, parseEther, type Hex } from "viem";
import { useNetwork } from "../lib/network";
import { useWallet, hasWallet } from "../lib/wallet";
import { evmClient, spotBalance, type Network } from "../lib/l1read";
import {
  HYPE_SYSTEM_ADDRESS,
  HYPE_TOKEN_INDEX,
  HYPE_WEI_DECIMALS,
  encodeHypeCoreToEvm,
  sendAction,
  sendHypeEvmToCore,
} from "../lib/corewriter";

// Core HYPE balance is 8 decimals; EVM HYPE (native gas) is 18 decimals.
const fmtCore = (wei: bigint) => (Number(wei) / 10 ** HYPE_WEI_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 8 });

async function readBalances(network: Network, user: Hex) {
  const [core, evm] = await Promise.all([
    spotBalance(network, user, HYPE_TOKEN_INDEX[network]).then((b) => b.total),
    evmClient(network).getBalance({ address: user }),
  ]);
  return { core, evm };
}

type Dir = "coreToEvm" | "evmToCore";
type State =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "mining"; txHash: string; sentAt: number }
  | { phase: "settling"; txHash: string; sentAt: number; evmMs: number }
  | { phase: "settled"; txHash: string; evmMs: number; l1Ms: number }
  | { phase: "timeout"; txHash: string; evmMs: number }
  | { phase: "error"; message: string };

export function Bridge() {
  const { network } = useNetwork();
  const { user, connect } = useWallet();
  const [dir, setDir] = useState<Dir>("coreToEvm");
  const [amount, setAmount] = useState("0.1");
  const [bal, setBal] = useState<{ core: bigint; evm: bigint } | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });

  const refresh = useCallback(() => {
    if (!user) return;
    readBalances(network, user).then(setBal).catch(() => setBal(null));
  }, [network, user]);

  useEffect(() => {
    setBal(null);
    refresh();
  }, [refresh]);

  const send = async () => {
    if (!user) return;
    setState({ phase: "sending" });
    try {
      const before = await readBalances(network, user);
      const sentAt = Date.now();

      let txHash: Hex;
      if (dir === "coreToEvm") {
        // Core HYPE wei (8 decimals).
        const coreWei = BigInt(Math.round(Number(amount) * 10 ** HYPE_WEI_DECIMALS));
        txHash = await sendAction(network, user, encodeHypeCoreToEvm(network, coreWei));
      } else {
        // EVM native HYPE wei (18 decimals).
        txHash = await sendHypeEvmToCore(network, user, parseEther(amount));
      }

      setState({ phase: "mining", txHash, sentAt });
      await evmClient(network).waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      const evmMs = Date.now() - sentAt;
      setState({ phase: "settling", txHash, sentAt, evmMs });

      // Poll until the cross-layer credit lands (balance changes on the dest side).
      const deadline = Date.now() + 30_000;
      let done = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        const now = await readBalances(network, user);
        setBal(now);
        if (now.core !== before.core || now.evm !== before.evm) {
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

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Core ⇄ EVM <span className="text-sm font-normal text-zinc-500">(HYPE, {network})</span></h1>
      <p className="mb-6 text-sm text-zinc-400">
        HYPE is the HyperEVM gas token. Move it from HyperCore to the EVM to fund gas, or back.
        Core→EVM uses CoreWriter <span className="font-mono">sendAsset</span> to the HYPE system
        address <span className="font-mono">{HYPE_SYSTEM_ADDRESS.slice(0, 8)}…</span>; EVM→Core sends
        native HYPE as tx value to the same address.
      </p>

      {!user ? (
        <button onClick={connect} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium">
          {hasWallet() ? "Connect wallet" : "No wallet detected"}
        </button>
      ) : (
        <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-4">
          {/* Balances */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Balance label="Core HYPE" sub="spotBalance(user, HYPE)" value={bal ? fmtCore(bal.core) : "…"} />
            <Balance label="EVM HYPE (gas)" sub="eth_getBalance" value={bal ? Number(formatEther(bal.evm)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "…"} />
          </div>

          {/* Direction + amount */}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-zinc-400">Direction</span>
              <select
                value={dir}
                onChange={(e) => setDir(e.target.value as Dir)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              >
                <option value="coreToEvm">Core → EVM (fund gas)</option>
                <option value="evmToCore">EVM → Core</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-zinc-400">HYPE amount</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm"
              />
            </label>
            <button
              onClick={send}
              disabled={state.phase === "sending" || state.phase === "mining" || state.phase === "settling"}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {state.phase === "idle" || state.phase === "settled" || state.phase === "error" || state.phase === "timeout" ? "Send" : "Sending…"}
            </button>
          </div>

          {dir === "coreToEvm" && (
            <p className="mb-2 text-xs text-zinc-500">
              Note: a Core→EVM transfer needs HYPE on the Core spot side. If EVM gas is 0 you can't
              send EVM txs — but Core→EVM is a CoreWriter action signed on the EVM, so you still need
              a little EVM gas to initiate it. First-time funding may require the bridge/faucet UI.
            </p>
          )}

          <Status state={state} network={network} />
        </div>
      )}
    </div>
  );
}

function Balance({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
      <div className="text-xs text-zinc-500">{label} <span className="font-mono">{sub}</span></div>
      <div className="font-mono text-sm text-zinc-200">{value}</div>
    </div>
  );
}

function Status({ state, network }: { state: State; network: string }) {
  if (state.phase === "idle") return null;
  if (state.phase === "error") return <p className="mt-3 text-sm text-red-400">❌ {state.message}</p>;
  if (state.phase === "sending") return <p className="mt-3 text-sm text-zinc-400">Awaiting wallet signature…</p>;

  const scan = network === "mainnet" ? "https://app.hyperliquid.xyz/explorer/tx/" : "https://app.hyperliquid-testnet.xyz/explorer/tx/";
  return (
    <div className="mt-3 space-y-1 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
      <div>
        EVM tx:{" "}
        <a href={`${scan}${state.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-sky-400 underline">
          {state.txHash.slice(0, 10)}…
        </a>
      </div>
      {state.phase === "mining" ? (
        <div className="text-zinc-400">⏳ 1/2 Waiting for EVM confirmation…</div>
      ) : (
        <div className="text-green-400">✅ 1/2 EVM confirmed in {state.evmMs} ms</div>
      )}
      {state.phase === "settling" && <div className="text-zinc-400">⏳ 2/2 Polling for the cross-layer credit…</div>}
      {state.phase === "settled" && (
        <div className="text-green-400">
          ✅ 2/2 Credited {state.l1Ms} ms after send (≈{state.l1Ms - state.evmMs} ms after EVM
          confirmation).
        </div>
      )}
      {state.phase === "timeout" && (
        <div className="text-amber-400">⚠️ 2/2 EVM confirmed, but no balance change within 30s.</div>
      )}
    </div>
  );
}
