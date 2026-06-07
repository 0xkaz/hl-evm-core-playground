// Single Worker entry. Serves the SPA via Static Assets.
//
// SECURITY MODEL: per-asset/account READS go from the browser to HL's public
// RPC directly (CORS open). CoreWriter WRITES are signed and sent by the user's
// wallet directly to HyperEVM. No private keys, signatures, or transactions
// ever pass through this server.
//
// The ONE thing the Worker proxies is the public asset-list metadata
// (`meta` / `spotMeta`), cached with a short TTL. These lists rarely change
// (only on new listings), so caching them server-side cuts repeated info-API
// calls across all users. This is public data — no user-asset risk.
export interface Env {
  ASSETS: Fetcher;
}

const INFO = {
  testnet: "https://api.hyperliquid-testnet.xyz/info",
  mainnet: "https://api.hyperliquid.xyz/info",
} as const;

const META_TTL_SECONDS = 120; // asset lists change rarely; 2 min is plenty.
const ALLOWED_META = new Set(["meta", "spotMeta"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "hl-evm-core-playground" });
    }

    // Cached asset-list metadata. GET /api/meta?network=...&type=meta|spotMeta
    if (url.pathname === "/api/meta" && request.method === "GET") {
      const network = url.searchParams.get("network") === "mainnet" ? "mainnet" : "testnet";
      const type = url.searchParams.get("type") ?? "";
      if (!ALLOWED_META.has(type)) {
        return Response.json({ error: "meta type not allowed" }, { status: 403 });
      }

      const cache = caches.default;
      // Cache key is the canonical GET URL (method+url). Reuse the request URL.
      const cacheKey = new Request(url.toString(), { method: "GET" });
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const upstream = await fetch(INFO[network], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const res = new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${META_TTL_SECONDS}`,
        },
      });
      if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
