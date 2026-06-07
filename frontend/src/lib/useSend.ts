import { useState } from "react";
import type { Hex } from "viem";
import { evmClient, type Network } from "./l1read";
import { sendAction } from "./corewriter";

export type SendState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "mining"; txHash: Hex; sentAt: number }
  | { phase: "mined"; txHash: Hex; evmMs: number }
  | { phase: "error"; message: string };

// Generic CoreWriter sender: signs+sends an encoded action via the wallet and
// measures EVM confirmation time. (Per-action L1 settle tracking is layered on
// top where it makes sense — see the USD class transfer / bridge pages.)
export function useSend(network: Network, user: Hex | null) {
  const [state, setState] = useState<SendState>({ phase: "idle" });

  const send = async (action: Hex, onMined?: (txHash: Hex, sentAt: number, evmMs: number) => void) => {
    if (!user) return;
    setState({ phase: "sending" });
    try {
      const sentAt = Date.now();
      const txHash = await sendAction(network, user, action);
      setState({ phase: "mining", txHash, sentAt });
      await evmClient(network).waitForTransactionReceipt({ hash: txHash });
      const evmMs = Date.now() - sentAt;
      setState({ phase: "mined", txHash, evmMs });
      onMined?.(txHash, sentAt, evmMs);
    } catch (e) {
      setState({ phase: "error", message: (e as Error).message.split("\n")[0] });
    }
  };

  const busy = state.phase === "sending" || state.phase === "mining";
  return { state, send, busy };
}

export function txScanUrl(network: Network, txHash: string): string {
  const base = network === "mainnet" ? "https://app.hyperliquid.xyz/explorer/tx/" : "https://app.hyperliquid-testnet.xyz/explorer/tx/";
  return `${base}${txHash}`;
}
