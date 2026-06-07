import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Note: React.StrictMode is intentionally omitted. In dev it double-invokes
// effects (to surface bugs), which makes every read fire twice in the network
// tab. Our effects are idempotent (cancelled-flag guarded), so this is cosmetic
// — but it's confusing in a demo. Production builds never double-invoke either way.
createRoot(document.getElementById("root")!).render(<App />);
