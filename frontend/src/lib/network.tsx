import { createContext, useContext, useState, type ReactNode } from "react";
import type { Network } from "./l1read";

const Ctx = createContext<{ network: Network; setNetwork: (n: Network) => void }>({
  network: "mainnet",
  setNetwork: () => {},
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Default to mainnet so reads show real data. Writes warn to use testnet.
  const [network, setNetwork] = useState<Network>("mainnet");
  return <Ctx.Provider value={{ network, setNetwork }}>{children}</Ctx.Provider>;
}

export const useNetwork = () => useContext(Ctx);
