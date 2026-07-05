import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

function calculateScoreDetailed(coin) {
  let score = 0;
  const details = {};

  const change = Math.abs(coin.change);
  if (change <= 3.0) {
    score += 30;
    details["Change <= 3%"] = 30;
    if (change <= 1.5) {
      score += 10;
      details["Change <= 1.5%"] = 10;
    }
  } else {
    details["Change > 3%"] = 0;
  }
  
  const absFunding = Math.abs(coin.funding || 0);
  if (absFunding > 0) {
    score += 20;
    details["Funding is active"] = 20;
    if (absFunding >= 0.0005) {
      score += 15;
      details["Funding >= 0.05%"] = 15;
    } else if (absFunding >= 0.0002) {
      score += 10;
      details["Funding >= 0.02%"] = 10;
    }
  }

  const vol = coin.volume;
  if (vol > 30000000) {
    score += 20;
    details["Volume > $30M"] = 20;
  } else if (vol > 15000000) {
    score += 15;
    details["Volume > $15M"] = 15;
  } else if (vol > 5000000) {
    score += 10;
    details["Volume > $5M"] = 10;
  }

  const watchlist = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];
  if (watchlist.includes(coin.symbol)) {
    score += 15;
    details["Watchlist Coin"] = 15;
  }

  const finalScore = Math.min(score, 100);
  return { finalScore, details };
}

function detectAutoDirectionDetailed(coin, sma24) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  let score = 0;
  const details = [];

  if (funding < -0.0001) {
    score += 2;
    details.push("Funding is negative (< -0.0001) -> bullish (+2 points)");
  } else if (funding < 0) {
    score += 1;
    details.push("Funding is slightly negative -> bullish (+1 point)");
  } else if (funding > 0.0001) {
    score -= 2;
    details.push("Funding is positive (> 0.0001) -> bearish (-2 points)");
  } else if (funding > 0) {
    score -= 1;
    details.push("Funding is slightly positive -> bearish (-1 point)");
  }

  if (change24h > 3) {
    score += 1;
    details.push("24h Change is positive (> 3%) -> bullish (+1 point)");
  } else if (change24h < -3) {
    score -= 1;
    details.push("24h Change is negative (< -3%) -> bearish (-1 point)");
  }

  let dir = 'LONG';
  if (score > 0) dir = 'LONG';
  else if (score < 0) dir = 'SHORT';
  else dir = change24h >= 0 ? 'LONG' : 'SHORT';

  const price = coin.price;
  let skipped = false;
  let skipReason = "";

  if (dir === 'LONG' && price < sma24) {
    skipped = true;
    skipReason = `LONG but price ($${price}) < 24h SMA ($${sma24.toFixed(4)})`;
  }
  if (dir === 'SHORT' && price > sma24) {
    skipped = true;
    skipReason = `SHORT but price ($${price}) > 24h SMA ($${sma24.toFixed(4)})`;
  }

  return { dir: skipped ? 'SKIP' : dir, score, details, skipReason };
}

async function inspect() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });
  const coin = "XRP";
  const days = 365;
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  console.log("Fetching historical data...");
  const candles = [];
  const chunkMs = 150 * 24 * 60 * 60 * 1000;
  let currentStart = startTime;
  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + chunkMs, endTime);
    const chunk = await info.candleSnapshot({ coin, interval: "1h", startTime: currentStart, endTime: currentEnd });
    if (chunk && chunk.length > 0) {
      candles.push(...chunk);
    }
    currentStart += chunkMs;
  }
  const seenTimes = new Set();
  const uniqueCandles = candles.filter(c => {
    if (seenTimes.has(c.t)) return false;
    seenTimes.add(c.t);
    return true;
  }).sort((a, b) => a.t - b.t);

  const fundingHistory = [];
  currentStart = startTime;
  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + chunkMs, endTime);
    const chunk = await info.fundingHistory({ coin, startTime: currentStart, endTime: currentEnd });
    if (chunk && chunk.length > 0) {
      fundingHistory.push(...chunk);
    }
    currentStart += chunkMs;
  }
  const fundingMap = {};
  fundingHistory.forEach(item => {
    const hourTimestamp = Math.floor(item.time / 3600000) * 3600000;
    fundingMap[hourTimestamp] = parseFloat(item.fundingRate);
  });

  // Target entry timestamp: 2026-06-04T03:00:00.000Z -> 1780542000000
  const targetTime = 1780542000000;
  
  // Find the index of the candle closest to the target time
  let targetIdx = -1;
  for (let i = 24; i < uniqueCandles.length; i++) {
    if (uniqueCandles[i].t === targetTime) {
      targetIdx = i;
      break;
    }
  }

  if (targetIdx === -1) {
    console.log("Target trade timestamp not found in fetched candles.");
    return;
  }

  // Extract variables at target index
  const c = uniqueCandles[targetIdx];
  const currentPrice = parseFloat(c.c);
  const low = parseFloat(c.l);
  const high = parseFloat(c.h);

  const candle24hAgo = uniqueCandles[targetIdx - 24];
  const prevPrice = parseFloat(candle24hAgo.c) || currentPrice;
  const change = ((currentPrice - prevPrice) / prevPrice) * 100;

  let high24h = low;
  let low24h = high;
  let volume24hUsd = 0;
  let sumClose24 = 0;

  for (let j = targetIdx - 24; j <= targetIdx; j++) {
    const cj = uniqueCandles[j];
    const cjHigh = parseFloat(cj.h);
    const cjLow = parseFloat(cj.l);
    if (cjHigh > high24h) high24h = cjHigh;
    if (cjLow < low24h) low24h = cjLow;
    volume24hUsd += parseFloat(cj.v) * parseFloat(cj.c);
    sumClose24 += parseFloat(cj.c);
  }

  const sma24 = sumClose24 / 25;
  const hourKey = Math.floor(targetTime / 3600000) * 3600000;
  const fundingRateRaw = fundingMap[hourKey] || 0.0000125;
  const funding = fundingRateRaw * 8;

  const coinData = {
    symbol: coin,
    price: currentPrice,
    change,
    volume: volume24hUsd,
    funding,
    high: high24h,
    low: low24h
  };

  const scoreResult = calculateScoreDetailed(coinData);
  const dirResult = detectAutoDirectionDetailed(coinData, sma24);

  // Strategy levels calculation details
  const slBuffer = 0.010;
  const tpBuffer = 0.020;
  const dec = currentPrice < 1 ? 6 : (currentPrice < 10 ? 4 : 2);
  let fibHigh = high24h;
  let fibLow = low24h;
  let vwap = (fibHigh + fibLow + currentPrice) / 3;

  // Since dir was SHORT:
  let fibEntry = fibHigh - (fibHigh - fibLow) * 0.382;
  let fibSl = fibHigh * 1.015;
  const minTp = fibEntry - (fibSl - fibEntry) * 1.5;
  let fibTp = vwap < minTp ? vwap : fibEntry - (fibSl - fibEntry) * 2;

  // Safety bounds
  const minSlAllowed = fibEntry * (1 + slBuffer);
  let slFinal = fibSl;
  let slReason = "standard_fib";
  if (fibSl < minSlAllowed) {
    slFinal = minSlAllowed;
    slReason = "capped_by_1.0%_buffer";
  }

  const maxTpAllowed = fibEntry * (1 - tpBuffer);
  let tpFinal = fibTp;
  let tpReason = "standard_fib";
  if (fibTp > maxTpAllowed) {
    tpFinal = maxTpAllowed;
    tpReason = "capped_by_2.0%_buffer";
  }

  console.log("\n=== DETAILED XRP TRADE STATE INSPECTION ===");
  console.log(`Timestamp: ${new Date(targetTime).toISOString()} (${targetTime})`);
  console.log(`Hourly Candle Close (Entry Price): $${currentPrice}`);
  console.log(`Hourly Candle High: $${high}`);
  console.log(`Hourly Candle Low: $${low}`);
  console.log(`24h Rolling High: $${high24h}`);
  console.log(`24h Rolling Low: $${low24h}`);
  console.log(`24h Rolling Volume: $${(volume24hUsd / 1000000).toFixed(2)}M USD`);
  console.log(`24h SMA: $${sma24.toFixed(4)}`);
  console.log(`24h Percentage Change: ${change.toFixed(2)}%`);
  console.log(`Funding Rate (8h equivalent): ${(funding * 100).toFixed(4)}% ($${fundingRateRaw.toFixed(6)} per hour)`);

  console.log("\n1. SCORE CALCULATION BREAKDOWN:");
  console.log(`- Base watchlist coin: +15 points`);
  Object.keys(scoreResult.details).forEach(key => {
    console.log(`- ${key}: +${scoreResult.details[key]} points`);
  });
  console.log(`=> TOTAL SCORE: ${scoreResult.finalScore}/100`);

  console.log("\n2. DIRECTION DETECTION BREAKDOWN:");
  dirResult.details.forEach(detail => {
    console.log(`- ${detail}`);
  });
  console.log(`=> Net direction score: ${dirResult.score}`);
  console.log(`=> Selected Direction: ${dirResult.dir}`);

  console.log("\n3. LEVEL CALCULATIONS (SHORT):");
  console.log(`- Fibonacci Pullback Entry: $${fibEntry.toFixed(dec)} (derived from 24h High $${fibHigh} and Low $${fibLow})`);
  console.log(`- Fibonacci Stop Loss: $${fibSl.toFixed(dec)}`);
  console.log(`- Fibonacci Take Profit (VWAP base): $${fibTp.toFixed(dec)} (VWAP was $${vwap.toFixed(dec)}, minTp was $${minTp.toFixed(dec)})`);
  console.log(`- Safety Bounds Check:`);
  console.log(`  * SL Allowed boundary (Entry + 1.0%): $${minSlAllowed.toFixed(dec)}`);
  console.log(`  * TP Allowed boundary (Entry - 2.0%): $${maxTpAllowed.toFixed(dec)}`);
  console.log(`  * Final Stop Loss set: $${slFinal.toFixed(dec)} (${slReason})`);
  console.log(`  * Final Take Profit set: $${tpFinal.toFixed(dec)} (${tpReason})`);

  console.log("\n4. THE WINNING SYMMETRY (MARKET ENTRY EXECUTION):");
  console.log(`- The bot enters at Market Price: $${currentPrice}`);
  console.log(`- Calculated TP Level: $${tpFinal.toFixed(dec)}`);
  console.log(`- Calculated SL Level: $${slFinal.toFixed(dec)}`);
  console.log(`- Price distance from Entry ($${currentPrice}) to TP ($${tpFinal.toFixed(dec)}): ${((currentPrice - tpFinal)/currentPrice * 100).toFixed(2)}%`);
  console.log(`- Price distance from Entry ($${currentPrice}) to SL ($${slFinal.toFixed(dec)}): ${((slFinal - currentPrice)/currentPrice * 100).toFixed(2)}%`);
  console.log(`- Leveraged (5x) Return on hit TP: ${(((currentPrice - tpFinal)/currentPrice * 5 - 0.0005) * 100).toFixed(2)}%`);
}

inspect().catch(console.error);
