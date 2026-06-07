// Reference of every special HyperEVM <-> HyperCore interface address. These
// are three DIFFERENT things, often loosely called "precompiles":
//   1. L1Read read precompiles (0x...0800+)  — read HyperCore state
//   2. CoreWriter system contract (0x333...) — write actions to HyperCore
//   3. System addresses (0x2222.. / 0x20+idx) — bridge funds Core <-> EVM

const READ_PRECOMPILES = [
  { addr: "0x...0800", name: "position", args: "(address, uint16 perp)" },
  { addr: "0x...0801", name: "spotBalance", args: "(address, uint64 token)" },
  { addr: "0x...0802", name: "userVaultEquity", args: "(address, address vault)" },
  { addr: "0x...0803", name: "withdrawable", args: "(address)" },
  { addr: "0x...0804", name: "delegations", args: "(address)" },
  { addr: "0x...0805", name: "delegatorSummary", args: "(address)" },
  { addr: "0x...0806", name: "markPx", args: "(uint32 perp)" },
  { addr: "0x...0807", name: "oraclePx", args: "(uint32 perp)" },
  { addr: "0x...0808", name: "spotPx", args: "(uint32 spot)" },
  { addr: "0x...0809", name: "l1BlockNumber", args: "()" },
  { addr: "0x...080a", name: "perpAssetInfo", args: "(uint32 perp)" },
  { addr: "0x...080b", name: "spotInfo", args: "(uint32 spot)" },
  { addr: "0x...080C", name: "tokenInfo", args: "(uint32 token)" },
  { addr: "0x...080D", name: "tokenSupply", args: "(uint32 token)" },
  { addr: "0x...080e", name: "bbo", args: "(uint32 asset)" },
  { addr: "0x...080f", name: "accountMarginSummary", args: "(uint32 dex, address)" },
  { addr: "0x...0810", name: "coreUserExists", args: "(address)" },
];

export function System() {
  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">System interfaces</h1>
      <p className="mb-6 text-sm text-zinc-400">
        The special addresses that connect HyperEVM and HyperCore. They're often all called
        "precompiles", but they're three different mechanisms.
      </p>

      {/* 1. Read precompiles */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-medium">1. L1Read precompiles</h2>
        <p className="mb-3 text-sm text-zinc-400">
          17 read-only precompiles at <span className="font-mono">0x…0800</span>–
          <span className="font-mono">0x…0810</span>. Return HyperCore state. Call with raw ABI args,
          <b> no 4-byte selector</b>. (See per-asset/account reads on Explore / Account.)
        </p>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-3 py-1.5">address</th>
                <th className="px-3 py-1.5">method</th>
                <th className="px-3 py-1.5">args</th>
              </tr>
            </thead>
            <tbody>
              {READ_PRECOMPILES.map((p) => (
                <tr key={p.addr} className="border-t border-zinc-800/70 odd:bg-zinc-900/40">
                  <td className="px-3 py-1.5 text-sky-400">{p.addr}</td>
                  <td className="px-3 py-1.5 text-zinc-200">{p.name}</td>
                  <td className="px-3 py-1.5 text-zinc-500">{p.args}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. CoreWriter */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-medium">2. CoreWriter system contract</h2>
        <p className="text-sm text-zinc-400">
          One contract at <span className="font-mono text-sky-400">0x3333…3333</span>. Not a
          precompile — a normal contract with <span className="font-mono">sendRawAction(bytes)</span>.
          Encodes one of 15 actions (version byte + 3-byte action id + ABI body) to write to
          HyperCore. Writes are asynchronous. See the CoreWriter page for the action list and a live
          sender.
        </p>
      </section>

      {/* 3. System addresses */}
      <section>
        <h2 className="mb-1 text-lg font-medium">3. System addresses (Core ⇄ EVM bridge)</h2>
        <p className="mb-2 text-sm text-zinc-400">
          Not precompiles or contracts you call — destination addresses that bridge a token between
          Core and EVM spot. One per token.
        </p>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left font-mono text-xs">
            <tbody>
              <tr className="odd:bg-zinc-900/40">
                <td className="px-3 py-1.5 text-sky-400">0x2222…2222</td>
                <td className="px-3 py-1.5 text-zinc-300">HYPE (native EVM gas token) — special case</td>
              </tr>
              <tr className="border-t border-zinc-800/70 odd:bg-zinc-900/40">
                <td className="px-3 py-1.5 text-sky-400">0x20 + token index</td>
                <td className="px-3 py-1.5 text-zinc-300">every other token (big-endian index)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          e.g. token 200 → <span className="font-mono">0x2000…00c8</span>. Core→EVM via{" "}
          <span className="font-mono">sendAsset</span> to the system address; EVM→Core via a transfer
          (native value for HYPE, ERC20 transfer otherwise) to it. See the Core⇄EVM page.
        </p>
      </section>
    </div>
  );
}
