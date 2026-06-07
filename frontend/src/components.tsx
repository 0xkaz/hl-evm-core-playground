import { Link } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { useNetwork } from "./lib/network";
import type { Network } from "./lib/l1read";
import { PRECOMPILE_NAME, l1BlockNumber, evmBlockNumber } from "./lib/l1read";
import { useWallet, hasWallet } from "./lib/wallet";

export const stringify = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);

export function NetworkToggle() {
  const { network, setNetwork } = useNetwork();
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
      {(["testnet", "mainnet"] as Network[]).map((n) => (
        <button
          key={n}
          onClick={() => setNetwork(n)}
          className={`px-3 py-1.5 text-sm ${network === n ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-300"}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// Two heights side by side: HyperCore (L1) via the l1BlockNumber precompile,
// and HyperEVM via standard eth_blockNumber. Refreshed periodically as live
// proof both paths work.
function BlockNumbers() {
  const { network } = useNetwork();
  const [l1, setL1] = useState<string>("…");
  const [evm, setEvm] = useState<string>("…");
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      l1BlockNumber(network).then((v) => !cancelled && setL1(v.toString())).catch(() => !cancelled && setL1("err"));
      evmBlockNumber(network).then((v) => !cancelled && setEvm(v.toString())).catch(() => !cancelled && setEvm("err"));
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [network]);
  return (
    <span className="whitespace-nowrap font-mono text-[11px] leading-tight text-zinc-500">
      <span title="l1BlockNumber() precompile 0x...0809">L1 block {l1}</span>
      <span className="mx-1.5 text-zinc-700">·</span>
      <span title="eth_blockNumber (HyperEVM)">EVM block {evm}</span>
    </span>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// Header wallet control: connect, show short address, disconnect. Account
// switches are picked up automatically via accountsChanged.
function WalletButton() {
  const { user, connect, disconnect } = useWallet();
  if (!user) {
    return (
      <button
        onClick={connect}
        className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
      >
        {hasWallet() ? "Connect" : "No wallet"}
      </button>
    );
  }
  return (
    <button
      onClick={disconnect}
      title={`${user} — click to disconnect`}
      className="rounded-lg border border-emerald-700 bg-emerald-950 px-2.5 py-1 font-mono text-xs text-emerald-300 hover:bg-emerald-900"
    >
      {short(user)} ✕
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <nav className="mb-8 space-y-2">
          {/* Row 1: title + nav links */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link to="/" className="whitespace-nowrap font-semibold text-zinc-100">HyperEVM Playground</Link>
              <Link to="/" className="text-zinc-400 hover:text-zinc-200">Explore</Link>
              <Link to="/account" className="text-zinc-400 hover:text-zinc-200">Account</Link>
              <Link to="/orders" className="text-zinc-400 hover:text-zinc-200">Orders</Link>
              <Link to="/corewriter" className="text-zinc-400 hover:text-zinc-200">CoreWriter</Link>
              <Link to="/bridge" className="text-zinc-400 hover:text-zinc-200">Bridge</Link>
              <Link to="/system" className="text-zinc-400 hover:text-zinc-200">System</Link>
            </div>
            {/* Row 2 (right-aligned on wide screens): wallet + network */}
            <div className="flex items-center gap-3">
              <WalletButton />
              <NetworkToggle />
            </div>
          </div>
          {/* Row 3: block heights */}
          <BlockNumbers />
        </nav>
        {children}
        <footer className="mt-12 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
          <span>HyperEVM Playground — a demo of operating HyperCore from the EVM.</span>
          <span className="mx-2 text-zinc-700">·</span>
          <a href="https://github.com/0xkaz/hl-evm-core-playground" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
            Source on GitHub
          </a>
          <span className="mx-2 text-zinc-700">·</span>
          <span>
            Related:{" "}
            <a href="https://hl-listing-calc.0xkaz.com/" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
              HL Listing Calculator
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}

// One precompile read: the request (to + raw calldata) and the decoded result.
export function ReadRow({
  call,
  req,
  state,
}: {
  call: string;
  req?: { to: string; data: string };
  state?: { ok: boolean; value: string };
}) {
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-sm">
      <div className="text-zinc-300">{call}</div>
      {req && (
        <div className="mt-1 text-xs text-zinc-500">
          <div>
            → eth_call to <span className="text-sky-400">{req.to}</span>{" "}
            <span className="text-zinc-400">({PRECOMPILE_NAME[req.to.toLowerCase()] ?? "precompile"})</span>
          </div>
          <div className="break-all">→ data <span className="text-amber-300/80">{req.data === "0x" ? "0x (no args)" : req.data}</span></div>
        </div>
      )}
      <div className="mt-1">
        {!state ? (
          <span className="text-zinc-600">…</span>
        ) : state.ok ? (
          <span className="whitespace-pre-wrap break-all text-green-400">{state.value}</span>
        ) : (
          <span className="break-all text-red-400">❌ {state.value}</span>
        )}
      </div>
    </li>
  );
}

// A named read: the request it sends (to + data) and a fn that performs +
// decodes it. `req` is shown in the UI so users see the actual call, not just
// the result. Batched at the transport layer when the same client is used.
export type Read = { id: string; req: { to: string; data: string }; fn: () => Promise<unknown> };
