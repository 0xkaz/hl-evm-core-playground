import { Link, useParams } from "react-router-dom";
import { useNetwork } from "../lib/network";
import { useReads } from "../lib/useReads";
import { ReadRow, type Read } from "../components";
import * as L1 from "../lib/l1read";

function Back() {
  return (
    <Link to="/" className="mb-4 inline-block text-sm text-zinc-400 hover:text-zinc-200">
      ← back to explore
    </Link>
  );
}

function ReadList({ reads, readKey }: { reads: Read[]; readKey: string }) {
  const results = useReads(reads, readKey);
  return (
    <ul className="space-y-2">
      {reads.map((r) => (
        <ReadRow key={r.id} call={r.id} req={r.req} state={results[r.id]} />
      ))}
    </ul>
  );
}

export function PerpDetail() {
  const { network } = useNetwork();
  const perp = Number(useParams().id ?? 0);
  const reads: Read[] = [
    { id: `perpAssetInfo(${perp})`, req: { to: L1.PRECOMPILES.perpAssetInfo, data: L1.u32(perp) }, fn: () => L1.perpAssetInfo(network, perp) },
    { id: `oraclePx(${perp})`, req: { to: L1.PRECOMPILES.oraclePx, data: L1.u32(perp) }, fn: () => L1.oraclePx(network, perp) },
    { id: `markPx(${perp})`, req: { to: L1.PRECOMPILES.markPx, data: L1.u32(perp) }, fn: () => L1.markPx(network, perp) },
  ];
  return (
    <div>
      <Back />
      <h1 className="mb-4 text-xl font-semibold">Perp #{perp} <span className="text-sm font-normal text-zinc-500">({network})</span></h1>
      <ReadList reads={reads} readKey={`perp:${network}:${perp}`} />
    </div>
  );
}

export function SpotDetail() {
  const { network } = useNetwork();
  const spot = Number(useParams().id ?? 0);
  const reads: Read[] = [
    { id: `spotInfo(${spot})`, req: { to: L1.PRECOMPILES.spotInfo, data: L1.u32(spot) }, fn: () => L1.spotInfo(network, spot) },
    { id: `spotPx(${spot})`, req: { to: L1.PRECOMPILES.spotPx, data: L1.u32(spot) }, fn: () => L1.spotPx(network, spot) },
    { id: `bbo(${spot})`, req: { to: L1.PRECOMPILES.bbo, data: L1.u32(spot) }, fn: () => L1.bbo(network, spot) },
  ];
  return (
    <div>
      <Back />
      <h1 className="mb-4 text-xl font-semibold">Spot #{spot} <span className="text-sm font-normal text-zinc-500">({network})</span></h1>
      <ReadList reads={reads} readKey={`spot:${network}:${spot}`} />
    </div>
  );
}

export function TokenDetail() {
  const { network } = useNetwork();
  const token = Number(useParams().id ?? 0);
  const reads: Read[] = [
    { id: `tokenInfo(${token})`, req: { to: L1.PRECOMPILES.tokenInfo, data: L1.u32(token) }, fn: () => L1.tokenInfo(network, token) },
    { id: `tokenSupply(${token})`, req: { to: L1.PRECOMPILES.tokenSupply, data: L1.u32(token) }, fn: () => L1.tokenSupply(network, token) },
  ];
  return (
    <div>
      <Back />
      <h1 className="mb-4 text-xl font-semibold">Token #{token} <span className="text-sm font-normal text-zinc-500">({network})</span></h1>
      <ReadList reads={reads} readKey={`token:${network}:${token}`} />
    </div>
  );
}
