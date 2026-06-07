import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";

// Minimal EIP-1193 wallet access (MetaMask etc.). No library needed.
interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

function provider(): Eip1193 | undefined {
  return (globalThis as { ethereum?: Eip1193 }).ethereum;
}

export function hasWallet(): boolean {
  return !!provider();
}

interface WalletCtx {
  user: Hex | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

const Ctx = createContext<WalletCtx>({
  user: null,
  connect: async () => {},
  disconnect: () => {},
  error: null,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setError(null);
    const p = provider();
    if (!p) {
      setError("No wallet found (install MetaMask).");
      return;
    }
    try {
      const accounts = (await p.request({ method: "eth_requestAccounts" })) as Hex[];
      if (!accounts?.length) throw new Error("No account authorized.");
      setUser(accounts[0]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // App-level disconnect: EIP-1193 has no programmatic disconnect, so we just
  // forget the address. To fully revoke, the user removes the site in MetaMask.
  const disconnect = () => setUser(null);

  // Follow MetaMask account switches.
  useEffect(() => {
    const p = provider();
    if (!p?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as Hex[];
      setUser(accounts?.length ? accounts[0] : null);
    };
    p.on("accountsChanged", onAccounts);
    return () => p.removeListener?.("accountsChanged", onAccounts);
  }, []);

  return <Ctx.Provider value={{ user, connect, disconnect, error }}>{children}</Ctx.Provider>;
}

export const useWallet = () => useContext(Ctx);
