# hl-evm-core-playground

A working demo of what HyperEVM's **L1Read precompiles** (read HyperCore state) and the **CoreWriter system contract** (write actions to HyperCore) can and cannot do. Runnable code plus a web UI. Reads work on both Hyperliquid mainnet and testnet (the UI defaults to mainnet); writes are wallet-signed and testnet is recommended. Live deployment: https://hl-evm.0xkaz.com

## Layout

```text
hl-evm-core-playground/
├── Makefile          # task runner — make help
├── contracts/        # Foundry — L1Read.sol, CoreWriter.sol + CoreWriterDemo caller
│   ├── src/
│   └── test/         # encoder unit test + L1Read fork test
├── scripts/          # viem demos
│   └── src/          #   l1read.ts, demo-l1read.ts (read), corewriter.ts, demo-corewriter.ts
└── frontend/         # React + Vite + Tailwind v4 + react-router, single Cloudflare Worker
                      #   Explore · Account · Orders · CoreWriter · Bridge · System
```

### Frontend UX

- **Explore** (`/`) — what the app is (feature cards), a HYPE price chart (info API `candleSnapshot`), and perp / spot / token lists. No precompiles called here.
- **Detail** (`/perp/:id`, `/spot/:id`, `/token/:id`) — reads only that asset's related precompiles, batched into one JSON-RPC request, with the raw `eth_call` to/data shown.
- **Account** (`/account`) — connect a wallet; reads that account's HyperCore state (no placeholder address).
- **Orders** (`/orders`) — place a limit order (asset picker, live price, bbo, holdings) and see / cancel resting orders, all on one page. Place = CoreWriter #1, cancel = #10; list via info API `openOrders`.
- **CoreWriter** (`/corewriter`) — reference of all 15 actions, plus live senders for #1 limit order, #6 spot send, #7 USD class transfer. The wallet signs and sends directly to HyperEVM; the page switches chains, shows the encoded action, and measures EVM confirmation (and for #7, the async L1 settle lag).
- **Bridge** (`/bridge`) — move HYPE between HyperCore and the EVM (fund EVM gas) via the HYPE system address `0x222…2`, both directions, with cross-layer settle timing.
- **System** (`/system`) — the full map: L1Read precompiles, the CoreWriter contract, and token system addresses.
- Reads go **directly** from the browser to HL's public RPC/info (CORS open); writes are signed by the wallet directly. The server only serves static assets. **Defaults to mainnet** (reads show real data); writes warn to use testnet.

## Reads vs writes

- **Reads** (L1Read precompiles): signature-free, zero funds, both networks.
- **Writes** (CoreWriter actions + Core⇄EVM transfers): signed and sent by your wallet directly to HyperEVM; testnet recommended; secrets never committed.

## Quick start (via make)

```bash
make help
make install         # forge-std + npm deps
make demo-l1read     # live L1Read read demo against testnet
make demo-corewriter # encode CoreWriter actions (sending is opt-in)
make test            # forge unit tests
make dev             # frontend dev server
```

## Key facts (verified)

- Precompiles take **raw ABI args, no 4-byte selector** — Solidity `staticcall(abi.encode(...))`; in viem use `client.call()`, never `readContract`.
- CoreWriter is **asynchronous**: the EVM tx succeeds before HyperCore executes; L1 failures don't revert the EVM side.
- HIP-4 outcome tokens are **not** readable via the spot precompiles (their asset ids revert on `spotInfo`/`spotBalance`/`tokenInfo` even for live markets — verified on testnet).
