// api/scanner.js — mirrors bot.js scoring logic exactly
// Browser calls /api/scanner instead of Hyperliquid directly (avoids rate limiting)

const MIN_SCORE = 85;

// Exact copy of bot.js calculateScore (isHyperliquidScale=true path)
function calculateScore(coin) {
  const change24h = coin.change || 0;
  const funding = coin.funding || 0;
  let score = 0;

  // 1. Primary Momentum: 24h Price Change
  if (change24h > 0) score += 2;
  else if (change24h < 0) score -= 2;

  // 2. Extreme Funding Rate Squeeze
  if (funding < -0.0005) score += 2;
  else if (funding > 0.0005) score -= 2;

  // 3. Momentum amplifier
  if (change24h > 3) score += 1;
  else if (change24h < -3) score -= 1;

  return score;
}

function getDirection(coin) {
  const change24h = coin.change || 0;
  const funding = coin.funding || 0;
  let score = 0;

  if (change24h > 0) score += 2;
  else if (change24h < 0) score -= 2;
  if (funding < -0.0005) score += 2;
  else if (funding > 0.0005) score -= 2;
  if (change24h > 3) score += 1;
  else if (change24h < -3) score -= 1;

  if (score > 0) return 'LONG';
  if (score < 0) return 'SHORT';
  return change24h >= 0 ? 'LONG' : 'SHORT';
}

const SL_PCT = {
  BTC:0.015, ETH:0.015, SOL:0.015, BNB:0.015, XRP:0.015,
  DOGE:0.015, ADA:0.015, AVAX:0.015, LINK:0.015, DOT:0.015,
  TON:0.015, TRX:0.015, LTC:0.015, TAO:0.015, SUI:0.015,
  ARB:0.015, NEAR:0.015, ALGO:0.015, UNI:0.015, AAVE:0.015,
  CRV:0.015, HYPE:0.015, XMR:0.015, ZEC:0.015, ENA:0.015,
  ZRO:0.015, WLD:0.015, PUMP:0.020, kPEPE:0.020
};

// In-memory cache
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 20000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');

  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    return res.status(200).json({ ..._cache, cached: true });
  }

  try {
    // ONE single request — same as bot does
    const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    });

    if (!hlRes.ok) {
      return res.status(200).json({ error: `HL ${hlRes.status}`, signals: [], regime: 'UNKNOWN' });
    }

    const [meta, ctxs] = await hlRes.json();
    if (!meta?.universe || !Array.isArray(ctxs)) {
      return res.status(200).json({ error: 'Invalid HL response', signals: [], regime: 'UNKNOWN' });
    }

    // Build all coins with score — exact same as bot fallback path
    const allCoins = meta.universe.map((asset, index) => {
      const ctx = ctxs[index];
      if (!ctx) return null;

      const price = parseFloat(ctx.markPx || ctx.midPx || '0');
      const prevPrice = parseFloat(ctx.prevDayPx || '0') || price;
      const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
      const volume = parseFloat(ctx.dayNtlVlm || '0');
      // Bot converts funding: per-8hr * 3 = daily equivalent
      const funding = parseFloat(ctx.funding || '0') * 3;

      if (price === 0) return null;

      const coin = { symbol: asset.name, price, change, volume, funding };
      const rawScore = calculateScore(coin);
      const direction = getDirection(coin);

      return {
        symbol: asset.name,
        price,
        change24h: change,
        volume,
        funding,
        rawScore,    // bot's internal score (can be negative)
        direction,
        assetIndex: index
      };
    }).filter(Boolean);

    // Sort: same as bot — score desc, then volume desc
    allCoins.sort((a, b) => {
      if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
      return b.volume - a.volume;
    });

    // Bot's minScore: 85 for most, 40 for BTC
    const candidates = allCoins.filter(c =>
      c.rawScore >= (c.symbol === 'BTC' ? 40 : MIN_SCORE) &&
      !['PAXG', 'FET'].includes(c.symbol)
    );

    // Build entry zones for candidates
    const signals = candidates.slice(0, 30).map(c => {
      const slPct = SL_PCT[c.symbol] ?? 0.015;
      const minRR = 1.5;
      const dec = c.price < 0.01 ? 6 : c.price < 1 ? 5 : c.price < 10 ? 4 : 2;
      const slPx = c.direction === 'LONG'
        ? parseFloat((c.price * (1 - slPct)).toFixed(dec))
        : parseFloat((c.price * (1 + slPct)).toFixed(dec));
      const tpPx = c.direction === 'LONG'
        ? parseFloat((c.price * (1 + slPct * minRR)).toFixed(dec))
        : parseFloat((c.price * (1 - slPct * minRR)).toFixed(dec));
      const entryGate = c.direction === 'LONG'
        ? parseFloat((c.price * (1 - slPct)).toFixed(dec))
        : parseFloat((c.price * (1 + slPct)).toFixed(dec));
      const distToEntry = Math.abs((c.price - entryGate) / c.price) * 100;
      // Entry is ready when price is at support/resistance zone (within 0.15%)
      const entryReady = distToEntry <= 0.15;
      return {
        ...c,
        slPx,
        tpPx,
        entryGate,
        distToEntry,
        entryReady,
        statusText: entryReady
          ? `🟢 ENTRY READY — near ${c.direction === 'LONG' ? 'support' : 'resistance'}`
          : `⏳ ${distToEntry.toFixed(2)}% away from entry gate`
      };
    });

    // Watching list: top 20 coins under minScore (monitoring zone)
    const watching = allCoins
      .filter(c => !candidates.find(x => x.symbol === c.symbol))
      .slice(0, 20)
      .map(c => ({
        symbol: c.symbol,
        price: c.price,
        change24h: c.change24h,
        funding: c.funding,
        rawScore: c.rawScore,
        direction: c.direction,
        volume: c.volume
      }));

    // Regime summary
    const btc = allCoins.find(c => c.symbol === 'BTC');
    const avgFunding = allCoins.slice(0, 50)
      .reduce((s, c) => s + c.funding, 0) / 50;

    const result = {
      status: 'success',
      regime: 'OPEN',
      regimeReason: 'Market scanning active',
      minScore: MIN_SCORE,
      totalScanned: allCoins.length,
      candidateCount: candidates.length,
      readyCount: signals.filter(s => s.entryReady).length,
      btcPrice: btc?.price ?? 0,
      btcChange24h: btc?.change24h ?? 0,
      avgFunding,
      signals,
      watching,
      timestamp: now,
      cached: false
    };

    _cache = result;
    _cacheTime = now;
    return res.status(200).json(result);

  } catch (err) {
    console.error('[api/scanner]', err.message);
    return res.status(200).json({ error: err.message, signals: [], regime: 'ERROR' });
  }
}
