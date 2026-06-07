import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { useNetwork } from "../lib/network";
import { useWallet, hasWallet } from "../lib/wallet";
import { useReads } from "../lib/useReads";
import { fetchPerps, fetchSpot, type Perp, type Token } from "../lib/meta";
import { ReadRow, type Read } from "../components";
import * as L1 from "../lib/l1read";

// Account-scoped reads. Address comes from the connected wallet (global state),
// so connect/disconnect/switch in the header are reflected here too.
export function Account() {
  const { network } = useNetwork();
  const { user, connect, error } = useWallet();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Account <span className="text-sm font-normal text-zinc-500">({network})</span></h1>
      {!user ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-3 text-sm text-zinc-400">
            Connect a wallet to read this account's HyperCore state. Reads are signature-free; the
            address is only used as a query argument. Switching accounts in your wallet updates this
            page automatically.
          </p>
          <button onClick={connect} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium">
            {hasWallet() ? "Connect wallet" : "No wallet detected"}
          </button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      ) : (
        <AccountReads user={user} network={network} />
      )}
    </div>
  );
}

function AccountReads({ user, network }: { user: Hex; network: L1.Network }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [perps, setPerps] = useState<Perp[]>([]);
  const [token, setToken] = useState(0); // 0 = USDC
  const [perp, setPerp] = useState(0); // 0 = first perp

  useEffect(() => {
    let cancelled = false;
    fetchSpot(network).then(({ tokens }) => !cancelled && setTokens(tokens)).catch(() => {});
    fetchPerps(network).then((v) => !cancelled && setPerps(v)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [network]);

  const tokenName = tokens.find((t) => t.index === token)?.name ?? `#${token}`;
  const perpName = perps.find((p) => p.index === perp)?.name ?? `#${perp}`;

  const reads: Read[] = [
    { id: "coreUserExists(user)", req: { to: L1.PRECOMPILES.coreUserExists, data: L1.addr(user) }, fn: () => L1.coreUserExists(network, user) },
    { id: `spotBalance(user, ${token}) — ${tokenName}`, req: { to: L1.PRECOMPILES.spotBalance, data: L1.addrU64(user, BigInt(token)) }, fn: () => L1.spotBalance(network, user, BigInt(token)) },
    { id: `position(user, ${perp}) — ${perpName}`, req: { to: L1.PRECOMPILES.position, data: L1.addrU16(user, perp) }, fn: () => L1.position(network, user, perp) },
    { id: "withdrawable(user)", req: { to: L1.PRECOMPILES.withdrawable, data: L1.addr(user) }, fn: () => L1.withdrawable(network, user) },
    { id: "delegations(user)", req: { to: L1.PRECOMPILES.delegations, data: L1.addr(user) }, fn: () => L1.delegations(network, user) },
    { id: "delegatorSummary(user)", req: { to: L1.PRECOMPILES.delegatorSummary, data: L1.addr(user) }, fn: () => L1.delegatorSummary(network, user) },
    { id: "accountMarginSummary(0, user)", req: { to: L1.PRECOMPILES.accountMarginSummary, data: L1.u32Addr(0, user) }, fn: () => L1.accountMarginSummary(network, 0, user) },
  ];
  const results = useReads(reads, `account:${network}:${user}:${token}:${perp}`);
  const row = (r: Read) => <ReadRow key={r.id} call={r.id} req={r.req} state={results[r.id]} />;
  const byId = (id: string) => reads.find((r) => r.id === id)!;

  return (
    <div>
      <div className="mb-4 font-mono text-sm text-zinc-300">{user}</div>
      <ul className="space-y-2">
        {row(byId("coreUserExists(user)"))}

        {/* Token picker sits directly above the spotBalance read it controls. */}
        <Select
          label="Token (spotBalance 2nd arg — a token id, 0 = USDC)"
          options={tokens.map((t) => ({ value: t.index, label: `${t.name} (#${t.index})` }))}
          value={token}
          onChange={setToken}
        />
        {row(byId(`spotBalance(user, ${token}) — ${tokenName}`))}

        {/* Perp picker sits directly above the position read it controls. */}
        <Select
          label="Perp (position 2nd arg — a perp index, 0 = first perp)"
          options={perps.map((p) => ({ value: p.index, label: `${p.name} (#${p.index})` }))}
          value={perp}
          onChange={setPerp}
        />
        {row(byId(`position(user, ${perp}) — ${perpName}`))}

        {row(byId("withdrawable(user)"))}
        {row(byId("delegations(user)"))}
        {row(byId("delegatorSummary(user)"))}
        {row(byId("accountMarginSummary(0, user)"))}
      </ul>
      <p className="mt-3 text-xs text-zinc-600">
        accountMarginSummary's 1st arg (0) is the perp-dex index — 0 is the native perp dex (others
        come from HIP-3 builder-deployed dexes). userVaultEquity needs a real vault address, shown on
        a vault page rather than here.
      </p>
    </div>
  );
}

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: number; label: string }>;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <li className="list-none">
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-400">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-200"
        >
          {options.length === 0 ? (
            <option value={value}>#{value}</option>
          ) : (
            options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          )}
        </select>
      </label>
    </li>
  );
}
