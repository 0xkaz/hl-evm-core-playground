# hl-evm-core-playground

HyperEVM の **L1Read プリコンパイル**（HyperCore の状態を読む）と **CoreWriter システムコントラクト**（HyperCore へアクションを書く）で、何ができて何ができないかを示す動作デモ。実行可能なコードと Web UI 付き。読み取りは Hyperliquid mainnet/testnet 両方で動作（UI のデフォルトは mainnet）、書き込みはウォレット署名で testnet 推奨。公開デプロイ: https://hl-evm.0xkaz.com

## 構成

```text
hl-evm-core-playground/
├── Makefile          # タスクランナー — make help
├── contracts/        # Foundry — L1Read.sol, CoreWriter.sol + CoreWriterDemo 呼び出し
│   ├── src/
│   └── test/         # エンコーダのユニットテスト + L1Read fork テスト
├── scripts/          # viem デモ
│   └── src/          #   l1read.ts, demo-l1read.ts (読み取り), corewriter.ts, demo-corewriter.ts
└── frontend/         # React + Vite + Tailwind v4 + react-router、単一 Cloudflare Worker
                      #   Explore · Account · Orders · CoreWriter · Bridge · System
```

### フロントエンド UX

- **Explore** (`/`) — アプリの説明（機能カード）、HYPE 価格チャート（info API `candleSnapshot`）、perp / spot / token 一覧。ここでは precompile を呼ばない。
- **詳細** (`/perp/:id`, `/spot/:id`, `/token/:id`) — そのアセット関連の precompile だけを JSON-RPC バッチで1リクエストに。生の `eth_call` の to/data も表示。
- **Account** (`/account`) — ウォレット接続し、そのアカウントの HyperCore 状態を読む（プレースホルダアドレス無し）。
- **Orders** (`/orders`) — 指値注文の発注（資産ピッカー・現在価格・bbo・保有表示）と未約定注文の一覧/キャンセルを1画面で。発注=CoreWriter #1、キャンセル=#10、一覧=info API `openOrders`。
- **CoreWriter** (`/corewriter`) — 全15アクションの一覧に加え、#1 指値注文・#6 spot 送金・#7 USD class transfer の実送信フォーム。ウォレットが直接 HyperEVM に署名・送信し、チェーン切替・エンコード結果表示・EVM 確定時間（#7 は非同期 L1 着金ラグも）を計測。
- **Bridge** (`/bridge`) — HYPE を HyperCore ⇄ EVM で移動（EVM ガス調達）。HYPE システムアドレス `0x222…2` 経由、両方向、レイヤー間着金時間も計測。
- **System** (`/system`) — 全体マップ: L1Read プリコンパイル、CoreWriter コントラクト、トークンのシステムアドレス。
- 読み取りはブラウザから HL 公開 RPC/info へ **直接**（CORS 開放）、書き込みはウォレットが直接署名。サーバは静的配信のみ。**デフォルトは mainnet**（読み取りは実データ）、書き込みは testnet 推奨の警告あり。

## 読み取り vs 書き込み

- **読み取り**（L1Read プリコンパイル）: 署名不要・資金ゼロ・両ネットワーク対応。
- **書き込み**（CoreWriter アクション + Core⇄EVM 転送）: ユーザーのウォレットが直接 HyperEVM に署名・送信。testnet 推奨、秘密鍵は絶対コミットしない。

## クイックスタート（make 経由）

```bash
make help
make install         # forge-std + npm 依存
make demo-l1read     # testnet に対するライブ L1Read 読み取りデモ
make demo-corewriter # CoreWriter アクションをエンコード（送信はオプトイン）
make test            # forge ユニットテスト
make dev             # frontend 開発サーバー
```

## 重要な事実（検証済み）

- プリコンパイルは **引数の生 ABI のみ、4バイト selector を付けない** — Solidity は `staticcall(abi.encode(...))`、viem は `client.call()` を使い `readContract` は使わない。
- CoreWriter は **非同期**: EVM tx は HyperCore 実行前に成功する。L1 側の失敗は EVM 側を revert しない。
- HIP-4 アウトカムトークンは spot プリコンパイル経由で **読めない**（その asset id は実在市場でも `spotInfo`/`spotBalance`/`tokenInfo` で revert — testnet で検証済み）。
