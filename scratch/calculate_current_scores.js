import fetch from 'node-fetch';
import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

const transport = new HttpTransport();
const info = new InfoClient({ transport });

const watchlist = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];

function calculateScore(coin, isHyperliquidScale = false) {
  let score = 0;
  const change = Math.abs(coin.change);
  if (change <= 3.0) {
    score += 30;
    if (change <= 1.5) score += 10;
  }
  
  const absFunding = Math.abs(coin.funding || 0);
  if (absFunding > 0) {
    score += 20;
    if (absFunding >= 0.0005) {
      score += 15;
    } else if (absFunding >= 0.0002) {
      score += 10;
    }
  }

  const vol = coin.volume;
  if (isHyperliquidScale) {
    if (vol > 30000000) score += 20;
    else if (vol > 15000000) score += 15;
    else if (vol > 5000000) score += 10;
  } else {
    if (vol > 100000000) score += 20;
    else if (vol > 50000000) score += 15;
    else if (vol > 10000000) score += 10;
  }

  if (watchlist.includes(coin.symbol)) {
    score += 15;
  }
  return Math.min(score, 100);
}

async function main() {
  console.log("=== CALCULATING CURRENT SCORES AND EVALUATION ===");

  // Fetch Binance data
  let binanceData = null;
  try {
    const [resTicker, resFunding] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v1/ticker/24hr").then(r => r.json()),
      fetch("https://fapi.binance.com/fapi/v1/premiumIndex").then(r => r.json())
    ]);
    binanceData = { tickers: resTicker, premiumData: resFunding };
  } catch (e) {
    console.error("Failed to fetch Binance data:", e.message);
    return;
  }

  const fundingMap = {};
  binanceData.premiumData.forEach(item => {
    fundingMap[item.symbol] = {
      fundingRate: parseFloat(item.lastFundingRate) || 0,
      markPrice: parseFloat(item.markPrice) || 0
    };
  });

  const binanceCoins = {};
  binanceData.tickers.forEach(coin => {
    const fundingInfo = fundingMap[coin.symbol] || { fundingRate: 0.0001, markPrice: parseFloat(coin.lastPrice) };
    const change = parseFloat(coin.priceChangePercent) || 0;
    const volume = parseFloat(coin.quoteVolume) || 0;
    const price = fundingInfo.markPrice || parseFloat(coin.lastPrice);
    const symbolBase = coin.symbol.replace("USDT", "");
    
    binanceCoins[symbolBase] = {
      symbol: symbolBase,
      price,
      change,
      volume,
      funding: fundingInfo.fundingRate,
      high: parseFloat(coin.highPrice) || price * 1.03,
      low: parseFloat(coin.lowPrice) || price * 0.97
    };
  });

  const metaAndCtxs = await info.metaAndAssetCtxs();
  const [hlMeta, hlAssetCtxs] = metaAndCtxs;

  const scoredCoins = hlMeta.universe.map((asset, index) => {
    const binCoin = binanceCoins[asset.name];
    if (!binCoin) return null;

    const ctx = hlAssetCtxs[index];
    const hlPrice = parseFloat(ctx?.markPx || ctx?.midPx || binCoin.price);

    const coinData = {
      ...binCoin,
      price: hlPrice
    };

    return {
      ...coinData,
      score: calculateScore(coinData, false),
      assetIndex: index,
      assetInfo: asset
    };
  }).filter(Boolean);

  // Sort scoredCoins
  scoredCoins.sort((a, b) => b.score - a.score || b.volume - a.volume);

  console.log(`\nTop 10 candidates by score:`);
  scoredCoins.slice(0, 10).forEach((c, idx) => {
    console.log(`${idx + 1}. ${c.symbol} (Score: ${c.score}, Price: ${c.price}, Change: ${c.change.toFixed(2)}%, Funding: ${c.funding.toFixed(6)}, Vol: $${(c.volume/1e6).toFixed(1)}M)`);
  });

  console.log("\n=== EVALUATING WATCHLIST COINS ===");
  const endTime = Date.now();
  const startTime = endTime - 30 * 60 * 60 * 1000;

  for (const coin of watchlist) {
    const cand = scoredCoins.find(c => c.symbol === coin);
    if (!cand) {
      console.log(`\n${coin}: Not found in scored coins`);
      continue;
    }

    // Get 24h SMA
    let sma24 = cand.price;
    try {
      const candles = await info.candleSnapshot({ coin: cand.symbol, interval: "1h", startTime, endTime });
      if (candles && candles.length >= 25) {
        const last25 = candles.slice(-25);
        const sumClose = last25.reduce((sum, c) => sum + parseFloat(c.c), 0);
        sma24 = sumClose / 25;
      }
    } catch (e) {
      console.error(`Failed to get SMA for ${coin}:`, e.message);
    }

    const price = cand.price;
    const diffPct = ((price - sma24) / sma24) * 100;
    
    // Evaluate raw direction based on score / change24h
    let score = 0;
    if (cand.funding < -0.0001) score += 2;
    else if (cand.funding < 0) score += 1;
    else if (cand.funding > 0.0001) score -= 2;
    else if (cand.funding > 0) score -= 1;
    
    // Check TrueNorth VWAP (not querying MCP to speed up/keep simple, using raw change24h as fallback)
    // In bot.js: score logic. If score > 0 LONG, score < 0 SHORT.
    // change24h > 3: score += 1, change24h < -3: score -= 1.
    let scoreWithChange = score;
    if (cand.change > 3) scoreWithChange += 1;
    else if (cand.change < -3) scoreWithChange -= 1;

    let dir = 'LONG';
    if (scoreWithChange > 0) dir = 'LONG';
    else if (scoreWithChange < 0) dir = 'SHORT';
    else dir = cand.change >= 0 ? 'LONG' : 'SHORT';

    console.log(`\n${coin}: Score = ${cand.score}, Price = ${price}, SMA24 = ${sma24.toFixed(4)} (Diff: ${diffPct.toFixed(2)}%)`);
    console.log(`- Raw Direction (before trend filters): ${dir} (Score details: funding_score=${score}, with_change=${scoreWithChange})`);

    // Trend filter simulation
    const maxDistancePct = 1.5;
    if (dir === 'LONG') {
      if (price < sma24) {
        console.log(`- Filter Status: SKIPPED (Reason: Price is below 24h SMA, counter-trend LONG)`);
      } else if (diffPct > maxDistancePct) {
        console.log(`- Filter Status: SKIPPED (Reason: LONG is overextended, Diff ${diffPct.toFixed(2)}% > ${maxDistancePct}%)`);
      } else {
        console.log(`- Filter Status: ALLOWED (LONG)`);
      }
    } else if (dir === 'SHORT') {
      if (price > sma24) {
        console.log(`- Filter Status: SKIPPED (Reason: Price is above 24h SMA, counter-trend SHORT)`);
      } else if (Math.abs(diffPct) > maxDistancePct) {
        console.log(`- Filter Status: SKIPPED (Reason: SHORT is overextended, Diff ${Math.abs(diffPct).toFixed(2)}% > ${maxDistancePct}%)`);
      } else {
        console.log(`- Filter Status: ALLOWED (SHORT)`);
      }
    }
  }
}

main().catch(console.error);
