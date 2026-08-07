// api/scanner.js
// Mirrors the real bot's 5-stage pipeline for dashboard display:
// Scout → Filter → 5-Layer Confluence → Signals → Monitoring

const MIN_SCORE = 85;
const BLACKLIST = ['PAXG', 'FET'];

// ── In-memory cache ──────────────────────────────────────────────
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 20000;

// ── Helper: fetch with timeout ───────────────────────────────────
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

// ── STAGE 3 Layer 1: Fear & Greed ───────────────────────────────
async function fetchFearAndGreed() {
  try {
    const res = await fetchWithTimeout('https://api.alternative.me/fng/?limit=1', {}, 4000);
    const json = await res.json();
    const val = parseInt(json?.data?.[0]?.value ?? '0');
    const label = json?.data?.[0]?.value_classification ?? '';
    return { value: val, label, ok: val >= 30 && val <= 65 };
  } catch {
    return { value: 0, label: 'N/A', ok: null };
  }
}

// ── STAGE 3 Layer 2: BTC Funding Rate (Hyperliquid) ─────────────
async function fetchBtcFunding() {
  try {
    const res = await fetchWithTimeout('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    }, 5000);
    const [meta, ctxs] = await res.json();
    const btcIdx = meta?.universe?.findIndex(u => u.name === 'BTC') ?? -1;
    if (btcIdx === -1) return { fundingPct: 0, markPx: 0, change24h: 0, ok: null };
    const ctx = ctxs[btcIdx];
    const funding = parseFloat(ctx?.funding ?? '0') * 3 * 100; // daily %
    const markPx = parseFloat(ctx?.markPx ?? '0');
    const prevPx = parseFloat(ctx?.prevDayPx ?? '0');
    const change24h = prevPx > 0 ? ((markPx - prevPx) / prevPx) * 100 : 0;
    return { fundingPct: funding, markPx, change24h, ok: Math.abs(funding) < 0.1 };
  } catch {
    return { fundingPct: 0, markPx: 0, change24h: 0, ok: null };
  }
}

// ── STAGE 1: GeckoTerminal Scout (Solana + Base trending pools) ──
async function fetchGeckoTerminalPools() {
  const networks = ['solana', 'base'];
  const endpoints = ['trending_pools', 'new_pools'];
  const pools = [];

  for (const network of networks) {
    for (const endpoint of endpoints) {
      try {
        const res = await fetchWithTimeout(
          `https://api.geckoterminal.com/api/v2/networks/${network}/pools?page=1&include=base_token`,
          { headers: { 'Accept': 'application/json;version=20230302' } },
          5000
        );
        if (!res.ok) continue;
        const json = await res.json();
        const items = json?.data ?? [];
        for (const item of items.slice(0, 15)) {
          const attrs = item?.attributes ?? {};
          const baseToken = json?.included?.find(inc =>
            inc.id === item?.relationships?.base_token?.data?.id
          )?.attributes ?? {};

          const price = parseFloat(attrs.base_token_price_usd ?? '0');
          const vol24h = parseFloat(attrs.volume_usd?.h24 ?? '0');
          const mcap = parseFloat(attrs.market_cap_usd ?? attrs.fdv_usd ?? '0');
          const change24h = parseFloat(attrs.price_change_percentage?.h24 ?? '0');
          const liquidity = parseFloat(attrs.reserve_in_usd ?? '0');
          const name = baseToken.name ?? attrs.name ?? 'Unknown';
          const symbol = baseToken.symbol ?? '???';

          if (price === 0 || mcap === 0) continue;

          const volMcapRatio = mcap > 0 ? vol24h / mcap : 0;
          const liquidityMcapRatio = mcap > 0 ? liquidity / mcap : 0;

          pools.push({
            symbol,
            name,
            network,
            price,
            change24h,
            volume24h: vol24h,
            mcap,
            liquidity,
            volMcapRatio,
            liquidityMcapRatio,
            poolAddress: item?.attributes?.address ?? '',
            source: endpoint
          });
        }
      } catch (e) {
        console.warn(`[GeckoTerminal] ${network}/${endpoint} failed:`, e.message);
      }
    }
  }
  return pools;
}

// ── STAGE 2: Token Gatekeeper Filter ────────────────────────────
function tokenGatekeeperFilter(pool) {
  const reasons = [];
  let pass = true;

  // L/MC >= 10%
  if (pool.liquidityMcapRatio < 0.10) {
    pass = false; reasons.push(`L/MC ${(pool.liquidityMcapRatio * 100).toFixed(1)}% < 10%`);
  }
  // 4h pump < 12%
  if (pool.change24h > 12) {
    pass = false; reasons.push(`Pump ${pool.change24h.toFixed(1)}% > 12%`);
  }
  // MCap $1M - $100M
  if (pool.mcap < 1_000_000 || pool.mcap > 100_000_000) {
    pass = false; reasons.push(`MCap $${(pool.mcap / 1e6).toFixed(1)}M out of $1M–$100M`);
  }
  // Vol/MCap >= 5%
  if (pool.volMcapRatio < 0.05) {
    pass = false; reasons.push(`Vol/MCap ${(pool.volMcapRatio * 100).toFixed(1)}% < 5%`);
  }

  return { pass, reasons };
}

// ── STAGE 3: 5-Layer Confluence Check ────────────────────────────
function checkConfluence(pool, fg, btcData) {
  const layers = [];

  // Layer 1: Macro & Sentiment
  const l1 = fg.value >= 30 && fg.value <= 65;
  layers.push({
    id: 1, name: 'Macro & Sentiment',
    detail: `F&G: ${fg.value} (${fg.label})`,
    pass: fg.ok === null ? null : l1
  });

  // Layer 2: Derivatives (BTC funding proxy)
  const l2 = btcData.ok !== null ? Math.abs(btcData.fundingPct) < 0.1 : null;
  layers.push({
    id: 2, name: 'Derivatives / Funding',
    detail: `BTC Funding: ${btcData.fundingPct.toFixed(4)}%/day`,
    pass: l2
  });

  // Layer 3: TrueNorth TA (unavailable client-side — use price momentum as proxy)
  // Proxy: positive 24h change implies bullish momentum
  const l3 = pool.change24h > -5 && pool.change24h < 15;
  layers.push({
    id: 3, name: 'Technical Analysis',
    detail: `Price action: ${pool.change24h.toFixed(2)}% (proxy — TrueNorth MCP not exposed)`,
    pass: l3
  });

  // Layer 4: Volume/MCap Density >= 15%
  const l4 = pool.volMcapRatio >= 0.15;
  layers.push({
    id: 4, name: 'Vol/MCap Density',
    detail: `Vol/MCap: ${(pool.volMcapRatio * 100).toFixed(1)}%`,
    pass: l4
  });

  // Layer 5: Price Stability (-5% to +10%)
  const l5 = pool.change24h >= -5 && pool.change24h <= 10;
  layers.push({
    id: 5, name: 'Price Stability',
    detail: `24h change: ${pool.change24h.toFixed(2)}%`,
    pass: l5
  });

  const passedCount = layers.filter(l => l.pass === true).length;
  const unknownCount = layers.filter(l => l.pass === null).length;
  const isValid = passedCount >= 3;

  return { layers, passedCount, unknownCount, isValid };
}

// ── Token Class (MCap-based) ──────────────────────────────────────
function tokenClass(mcap) {
  if (mcap < 10_000_000) return { label: 'Class A', color: 'green', slPct: 0.02 };
  return { label: 'Class B', color: 'yellow', slPct: 0.03 };
}

// ── Main Handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');

  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    return res.status(200).json({ ..._cache, cached: true });
  }

  try {
    // Parallel: fetch all data sources simultaneously
    const [fg, btcData, pools] = await Promise.all([
      fetchFearAndGreed(),
      fetchBtcFunding(),
      fetchGeckoTerminalPools()
    ]);

    // Macro Regime check
    const macroOk = (fg.ok !== false) && (btcData.ok !== false);
    const regimeStatus = macroOk ? 'OPEN' : 'CAUTION';
    const regimeReason = !macroOk
      ? (fg.value < 30 ? `Extreme Fear (F&G: ${fg.value}) — High caution` :
         fg.value > 65 ? `Greed zone (F&G: ${fg.value}) — Overheated` :
         `BTC Funding ${btcData.fundingPct.toFixed(4)}% — Elevated`)
      : `F&G ${fg.value} · BTC Funding ${btcData.fundingPct.toFixed(4)}%`;

    // Stage 1+2: Scout + Gatekeeper
    const scoutResults = pools.map(pool => {
      const gate = tokenGatekeeperFilter(pool);
      const confluence = gate.pass ? checkConfluence(pool, fg, btcData) : null;
      const tc = tokenClass(pool.mcap);

      const slPct = tc.slPct;
      const minRR = 3.0;
      const entryPx = pool.price;
      const slPx = parseFloat((entryPx * (1 - slPct)).toFixed(6));
      const tpPx = parseFloat((entryPx * (1 + slPct * minRR)).toFixed(6));

      return {
        symbol: pool.symbol,
        name: pool.name,
        network: pool.network,
        price: pool.price,
        change24h: pool.change24h,
        volume24h: pool.volume24h,
        mcap: pool.mcap,
        liquidity: pool.liquidity,
        volMcapRatio: pool.volMcapRatio,
        liquidityMcapRatio: pool.liquidityMcapRatio,
        tokenClass: tc.label,
        slPct,
        slPx,
        tpPx,
        gatePass: gate.pass,
        gateReasons: gate.reasons,
        confluence: confluence,
        validSignal: gate.pass && (confluence?.isValid ?? false),
        source: pool.source,
        poolAddress: pool.poolAddress
      };
    });

    const validSignals = scoutResults.filter(s => s.validSignal);
    const gatePassed = scoutResults.filter(s => s.gatePass);
    const gateRejected = scoutResults.filter(s => !s.gatePass);

    const result = {
      status: 'success',
      regime: regimeStatus,
      regimeReason,
      fearAndGreed: fg,
      btcData,
      minScore: MIN_SCORE,
      pipeline: {
        scouted: pools.length,
        gateRejected: gateRejected.length,
        gatePassed: gatePassed.length,
        validSignals: validSignals.length
      },
      signals: validSignals,
      watching: gatePassed.filter(s => !s.validSignal),
      rejected: gateRejected.slice(0, 10),
      timestamp: now,
      cached: false
    };

    _cache = result;
    _cacheTime = now;
    return res.status(200).json(result);

  } catch (err) {
    console.error('[api/scanner] Error:', err.message);
    return res.status(200).json({ error: err.message, signals: [], regime: 'ERROR', timestamp: Date.now() });
  }
}
