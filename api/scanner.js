// api/scanner.js
// Server-side Hyperliquid perp scanner for the dashboard.
// Returns all Hyperliquid perps; the frontend filters this down to the
// configured 30-coin crypto-perps watchlist. Replaces the old GeckoTerminal
// (Solana/Base DeFi) scanner — crypto-only now.

const CACHE_TTL = 20000;
let _cache = null;
let _cacheTime = 0;

// ── In-memory cache ──────────────────────────────────────────────
async function fetchWithTimeout(url, opts = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchHyperliquidPerps() {
  const res = await fetchWithTimeout(
    'https://api.hyperliquid.xyz/info',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    },
    6000
  );
  const [meta, ctxs] = await res.json();
  if (!meta?.universe || !Array.isArray(ctxs)) return [];

  return meta.universe.map((asset, index) => {
    const ctx = ctxs[index] || {};
    const price = parseFloat(ctx.markPx || ctx.midPx || '0');
    const prevPrice = parseFloat(ctx.prevDayPx || '0') || price;
    const change24h = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
    const volume = parseFloat(ctx.dayNtlVlm || '0');
    const funding = parseFloat(ctx.funding || '0') * 3; // daily %
    return { symbol: asset.name, price, change24h, volume, funding, rawScore: 0 };
  }).filter(s => s.price > 0);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');

  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    return res.status(200).json({ ..._cache, cached: true });
  }

  try {
    const signals = await fetchHyperliquidPerps();
    const result = {
      status: 'success',
      regime: 'OPEN',
      regimeReason: 'Hyperliquid perps',
      minScore: 50,
      pipeline: {
        scouted: signals.length,
        gateRejected: 0,
        gatePassed: signals.length,
        validSignals: signals.length
      },
      signals,
      watching: [],
      rejected: [],
      timestamp: now,
      cached: false
    };

    _cache = result;
    _cacheTime = now;
    return res.status(200).json(result);
  } catch (err) {
    console.error('[api/scanner] Error:', err.message);
    if (_cache) {
      return res.status(200).json({ ..._cache, cached: true, stale: true });
    }
    return res.status(200).json({ status: 'success', regime: 'OPEN', regimeReason: 'Scanner active', signals: [], watching: [], rejected: [], timestamp: Date.now() });
  }
}
