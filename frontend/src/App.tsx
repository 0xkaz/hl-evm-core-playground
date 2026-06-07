import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NetworkProvider } from "./lib/network";
import { WalletProvider } from "./lib/wallet";
import { Layout } from "./components";
import { Explore } from "./pages/Explore";
import { PerpDetail, SpotDetail, TokenDetail } from "./pages/Detail";
import { Account } from "./pages/Account";
import { CoreWriterPage } from "./pages/CoreWriterPage";
import { Bridge } from "./pages/Bridge";
import { System } from "./pages/System";
import { Orders } from "./pages/Orders";

export function App() {
  return (
    <NetworkProvider>
      <WalletProvider>
        <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Explore />} />
            <Route path="/perp/:id" element={<PerpDetail />} />
            <Route path="/spot/:id" element={<SpotDetail />} />
            <Route path="/token/:id" element={<TokenDetail />} />
            <Route path="/account" element={<Account />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/corewriter" element={<CoreWriterPage />} />
            <Route path="/bridge" element={<Bridge />} />
            <Route path="/system" element={<System />} />
          </Routes>
        </Layout>
        </BrowserRouter>
      </WalletProvider>
    </NetworkProvider>
  );
}
