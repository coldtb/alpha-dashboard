import fs from 'fs';
import path from 'path';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

const config = {
  minScore: 65,
  minSlBuffer: 0.01,
  minTpBuffer: 0.005,
  watchlist: [ 'HYPE', 'XRP' ],
};

// EMA/SMA calculator
function calculateSMA(prices) {
  const sum = prices.reduce((a, b) => a + b, 0);
  return sum / prices.length;
}

// Improved detectAutoDirection
function detectAutoDirectionImproved(coin, sma24, sma100, maxDistancePct) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  
  // Primary direction based on trend
  let dir = change24h >= 0 ? 'LONG' : 'SHORT';

  // Apply funding rate bias ONLY if funding is extremely high (exhaustion phase)
  if (funding > 0.0004) { // Highly positive funding -> potential exhaustion
    dir = 'SHORT';
  } else if (funding < -0.0004) { // Highly negative funding -> potential squeeze
    dir = 'LONG';
  }

  // Dual SMA Filter: Price must align with both short-term (SMA24) and medium-term (SMA100) trend
  const price = coin.price;
  if (dir === 'LONG') {
    if (price < sma24 || price < sma100) return 'SKIP';
    if (price > sma24 * (1 + maxDistancePct)) return 'SKIP';
  } else {
    if (price > sma24 || price > sma100) return 'SKIP';
    if (price < sma24 * (1 - maxDistancePct)) return 'SKIP';
  }

  return dir;
}

function calculateScore(coin) {
  let score = 50;
  if (Math.abs(coin.change) > 5) score += 10;
  if (coin.volume > 15000000) score += 10;
  if (config.watchlist.includes(coin.symbol)) score += 15;
  return Math.min(score, 100);
}

function computeStrategyLevels(coin, dir, pivotLevels) {
  const price = coin.price;
  const high = coin.high || price * 1.03;
  const low  = coin.low  || price * 0.97;

  let entry = price;
  let sl = dir === 'LONG' ? price * 0.97 : price * 1.03;
  let tp = dir === 'LONG' ? price * 1.06 : price * 0.94;

  if (dir === 'LONG') {
    entry = high - (high - low) * 0.618;
    sl = pivotLevels.s2 * 0.995;
    const minSl = entry * 0.98; // 2% hard cap
    if (sl < minSl) sl = minSl;
    tp = pivotLevels.r1;
    const minTp = entry * 1.005;
    if (tp < minTp) tp = minTp;
    const maxTp = entry * 1.03;
    if (tp > maxTp) tp = maxTp;
  } else {
    entry = high - (high - low) * 0.382;
    sl = pivotLevels.r2 * 1.005;
    const maxSl = entry * 1.02; // 2% hard cap
    if (sl > maxSl) sl = maxSl;
    tp = pivotLevels.s1;
    const maxTp = entry * 0.995;
    if (tp > maxTp) tp = maxTp;
    const minTp = entry * 0.97;
    if (tp < minTp) tp = minTp;
  }

  return { entry, sl, tp };
}

function calculatePivotLevels(high, low, close) {
  const p = (high + low + close) / 3;
  const r1 = p + (high - low) * 0.382;
  const s1 = p - (high - low) * 0.382;
  const r2 = p + (high - low) * 0.618;
  const s2 = p - (high - low) * 0.618;
  const r3 = p + (high - low) * 1.0;
  const s3 = p - (high - low) * 1.0;
  return { p, r1, s1, r2, s2, r3, s3 };
}

async function runTest(coinSymbol, days) {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  const candles = [];
  const chunkMs = 150 * 24 * 60 * 60 * 1000;
  let candleStart = startTime;
  while (candleStart < endTime) {
    const chunk = await info.candleSnapshot({
      coin: coinSymbol,
      interval: "1h",
      startTime: candleStart,
      endTime: Math.min(candleStart + chunkMs, endTime)
    });
    if (chunk) {
      chunk.forEach(c => {
        if (candles.length === 0 || c.t > candles[candles.length - 1].t) candles.push(c);
      });
    }
    candleStart += chunkMs;
  }

  // Load funding rate history
  const fundingHistory = [];
  let currentStart = startTime;
  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + chunkMs, endTime);
    const chunk = await info.fundingHistory({
      coin: coinSymbol,
      startTime: currentStart,
      endTime: currentEnd
    });
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

  const spreadMap = { "XRP": 0.0004, "HYPE": 0.0008, "ZEC": 0.0005 };

  function simulate(useImprovedFilter) {
    let balance = 10000;
    let position = null;
    let pendingOrder = null;
    let wins = 0;
    let losses = 0;
    const leverage = 5;
    let maxDd = 0;
    let peak = balance;

    for (let i = 100; i < candles.length; i++) {
      const c = candles[i];
      const close = parseFloat(c.c);
      const low = parseFloat(c.l);
      const high = parseFloat(c.h);
      const timestamp = c.t;

      if (balance > peak) peak = balance;
      const dd = ((peak - balance) / peak) * 100;
      if (dd > maxDd) maxDd = dd;

      // Check exits
      if (position) {
        const isLong = position.dir === 'LONG';
        let hitSl = false;
        let hitTp = false;

        if (isLong) {
          if (low <= position.sl) hitSl = true;
          else if (high >= position.tp) hitTp = true;
        } else {
          if (high >= position.sl) hitSl = true;
          else if (low <= position.tp) hitTp = true;
        }

        if (hitSl || hitTp) {
          const exitPrice = hitSl ? position.sl : position.tp;
          const priceReturn = isLong 
            ? (exitPrice - position.entryPrice) / position.entryPrice
            : (position.entryPrice - exitPrice) / position.entryPrice;
          
          const netReturn = priceReturn * leverage - 0.0005; // fee
          const activeMargin = Math.min(balance * 0.95, 50000);
          balance += activeMargin * netReturn;

          if (netReturn > 0) wins++; else losses++;
          position = null;
        }
        continue;
      }

      // Check pending order
      if (pendingOrder) {
        const isLong = pendingOrder.dir === 'LONG';
        let filled = false;
        if (isLong) {
          if (low <= pendingOrder.targetEntry) filled = true;
        } else {
          if (high >= pendingOrder.targetEntry) filled = true;
        }

        if (filled) {
          position = {
            dir: pendingOrder.dir,
            entryPrice: pendingOrder.targetEntry,
            tp: pendingOrder.tp,
            sl: pendingOrder.sl
          };
          pendingOrder = null;
          continue;
        }
        pendingOrder = null;
      }

      // Calculate indicators
      const closes24 = [];
      const closes100 = [];
      let high24h = low;
      let low24h = high;

      for (let j = i - 24; j <= i; j++) {
        closes24.push(parseFloat(candles[j].c));
        if (parseFloat(candles[j].h) > high24h) high24h = parseFloat(candles[j].h);
        if (parseFloat(candles[j].l) < low24h) low24h = parseFloat(candles[j].l);
      }
      for (let j = i - 100; j <= i; j++) {
        closes100.push(parseFloat(candles[j].c));
      }

      const sma24 = calculateSMA(closes24);
      const sma100 = calculateSMA(closes100);
      const volatility24h = (high24h - low24h) / low24h;

      const hourKey = Math.floor(timestamp / 3600000) * 3600000;
      const fundingRate = fundingMap[hourKey] || 0.0000125;
      const funding = fundingRate * 8;

      const coinData = {
        symbol: coinSymbol,
        price: close,
        change: ((close - parseFloat(candles[i-24].c)) / parseFloat(candles[i-24].c)) * 100,
        volume: 20000000,
        high: high24h,
        low: low24h,
        funding
      };

      const score = calculateScore(coinData);
      const pivotLevels = calculatePivotLevels(high24h, low24h, close);

      // Evaluate signal
      let direction = 'SKIP';
      if (score >= config.minScore) {
        if (useImprovedFilter) {
          direction = detectAutoDirectionImproved(coinData, sma24, sma100, 0.05);
        } else {
          // Current direction logic
          let dirScore = 0;
          if (funding < -0.0001) dirScore += 2;
          else if (funding > 0.0001) dirScore -= 2;
          if (coinData.change > 3) dirScore += 1;
          else if (coinData.change < -3) dirScore -= 1;
          
          let dir = dirScore >= 0 ? 'LONG' : 'SHORT';
          if (dir === 'LONG') {
            if (close >= sma24 && close <= sma24 * 1.05) direction = 'LONG';
          } else {
            if (close <= sma24 && close >= sma24 * 0.95) direction = 'SHORT';
          }
        }
      }

      if (direction !== 'SKIP') {
        const levels = computeStrategyLevels(coinData, direction, pivotLevels);
        const spreadPct = spreadMap[coinSymbol] || 0.0005;
        const slippagePct = Math.max(0.0002, volatility24h * 0.02);

        let entryPriceWithPenalties = levels.entry;
        if (direction === 'LONG') {
          entryPriceWithPenalties = levels.entry * (1 + spreadPct / 2) * (1 + slippagePct);
        } else {
          entryPriceWithPenalties = levels.entry * (1 - spreadPct / 2) * (1 - slippagePct);
        }

        pendingOrder = {
          dir: direction,
          targetEntry: entryPriceWithPenalties,
          tp: levels.tp,
          sl: levels.sl
        };

        // Same hour fill check
        const isLong = direction === 'LONG';
        let filled = false;
        if (isLong) {
          if (low <= entryPriceWithPenalties) filled = true;
        } else {
          if (high >= entryPriceWithPenalties) filled = true;
        }

        if (filled) {
          position = {
            dir: direction,
            entryPrice: entryPriceWithPenalties,
            tp: levels.tp,
            sl: levels.sl
          };
          pendingOrder = null;
        }
      }
    }

    const total = wins + losses;
    const wr = total > 0 ? (wins / total) * 100 : 0;
    return { balance, total, wr, maxDd };
  }

  console.log(`\n--- Comparative Results for ${coinSymbol} (${days} Days) ---`);
  const r1 = simulate(false);
  console.log(`[Current Setup]:     Final Balance: $${r1.balance.toFixed(2)} | Win Rate: ${r1.wr.toFixed(1)}% | Max DD: ${r1.maxDd.toFixed(1)}% | Trades: ${r1.total}`);

  const r2 = simulate(true);
  console.log(`[Improved Filter]:   Final Balance: $${r2.balance.toFixed(2)} | Win Rate: ${r2.wr.toFixed(1)}% | Max DD: ${r2.maxDd.toFixed(1)}% | Trades: ${r2.total}`);
}

async function main() {
  await runTest("ZEC", 180);
  await runTest("HYPE", 180);
  await runTest("XRP", 180);
}

main().catch(console.error);
