import fs from 'fs';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

const config = {
  minScore: 65,
  minSlBuffer: 0.01,
  minTpBuffer: 0.005,
  maxDistancePct: 0.05,
  watchlist: [ 'HYPE', 'XRP' ],
};

// EMA calculator
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateScore(coin) {
  let score = 50;
  if (Math.abs(coin.change) > 5) score += 10;
  if (coin.volume > 15000000) score += 10;
  if (config.watchlist.includes(coin.symbol)) score += 15;
  return Math.min(score, 100);
}

function detectAutoDirection(coin, prices24, ema8, ema21, ema50) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  let score = 0;

  if (funding < -0.0001) score += 2;
  else if (funding > 0.0001) score -= 2;

  if (change24h > 3) score += 1;
  else if (change24h < -3) score -= 1;

  let dir = score >= 0 ? 'LONG' : 'SHORT';

  // EMA Alignment Trend Filter (Regime Filter)
  // If EMA8 > EMA21 > EMA50, we are in a strong UPTREND -> Only LONG allowed!
  // If EMA8 < EMA21 < EMA50, we are in a strong DOWNTREND -> Only SHORT allowed!
  const isUpTrend = ema8 > ema21 && ema21 > ema50;
  const isDownTrend = ema8 < ema21 && ema21 < ema50;

  if (dir === 'LONG' && isDownTrend) return 'SKIP';
  if (dir === 'SHORT' && isUpTrend) return 'SKIP';

  return dir;
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

  // Model 1: TrueNorth Pivot + 2% SL (Our current setup)
  // Model 2: TrueNorth Pivot + 2% SL + 24h Loss-Streak Cooldown
  // Model 3: TrueNorth Pivot + 2% SL + 24h Loss Cooldown + EMA Regime Filter

  function simulate(useLossCooldown, useEMARegime) {
    let balance = 10000;
    let position = null;
    let pendingOrder = null;
    let wins = 0;
    let losses = 0;
    const leverage = 5;
    let maxDd = 0;
    let peak = balance;

    // Cooldown tracking
    let consecutiveLosses = 0;
    let cooldownUntil = 0;

    for (let i = 50; i < candles.length; i++) {
      const c = candles[i];
      const close = parseFloat(c.c);
      const low = parseFloat(c.l);
      const high = parseFloat(c.h);
      const timestamp = c.t;

      if (balance > peak) peak = balance;
      const dd = ((peak - balance) / peak) * 100;
      if (dd > maxDd) maxDd = dd;

      // Check position exits
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
          const returnPct = isLong 
            ? (exitPrice - position.entryPrice) / position.entryPrice
            : (position.entryPrice - exitPrice) / position.entryPrice;
          
          const netReturn = returnPct * leverage - 0.0005; // 0.05% fee
          const activeMargin = Math.min(balance * 0.95, 50000);
          balance += activeMargin * netReturn;

          if (netReturn > 0) {
            wins++;
            consecutiveLosses = 0; // reset loss streak
          } else {
            losses++;
            consecutiveLosses++;
            if (useLossCooldown && consecutiveLosses >= 2) {
              cooldownUntil = timestamp + 24 * 60 * 60 * 1000; // 24h ban
            }
          }
          position = null;
        }
        continue;
      }

      // Check pending order execution
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

        // Cancel pending order
        pendingOrder = null;
      }

      // If in cooldown, skip signal evaluation
      if (useLossCooldown && timestamp < cooldownUntil) {
        continue;
      }

      // Calculate 24h and EMA metrics
      const closes = [];
      let high24h = low;
      let low24h = high;
      for (let j = i - 50; j <= i; j++) {
        closes.push(parseFloat(candles[j].c));
      }
      for (let j = i - 24; j <= i; j++) {
        const cj = candles[j];
        if (parseFloat(cj.h) > high24h) high24h = parseFloat(cj.h);
        if (parseFloat(cj.l) < low24h) low24h = parseFloat(cj.l);
      }

      const ema8 = calculateEMA(closes, 8);
      const ema21 = calculateEMA(closes, 21);
      const ema50 = calculateEMA(closes, 50);

      const coinData = {
        symbol: coinSymbol,
        price: close,
        change: ((close - parseFloat(candles[i-24].c)) / parseFloat(candles[i-24].c)) * 100,
        volume: 20000000,
        high: high24h,
        low: low24h
      };

      const score = calculateScore(coinData);
      const pivotLevels = calculatePivotLevels(high24h, low24h, close);

      const direction = useEMARegime 
        ? detectAutoDirection(coinData, closes.slice(-24), ema8, ema21, ema50)
        : (score >= config.minScore ? (close >= ema21 ? 'LONG' : 'SHORT') : 'SKIP');

      if (direction !== 'SKIP') {
        const levels = computeStrategyLevels(coinData, direction, pivotLevels);
        pendingOrder = {
          dir: direction,
          targetEntry: levels.entry,
          tp: levels.tp,
          sl: levels.sl
        };
      }
    }

    const total = wins + losses;
    const wr = total > 0 ? (wins / total) * 100 : 0;
    return { balance, total, wr, maxDd };
  }

  console.log(`\n--- Results for ${coinSymbol} (${days} Days) ---`);
  const r1 = simulate(false, false);
  console.log(`[Current Setup]:       Final Balance: $${r1.balance.toFixed(2)} | Win Rate: ${r1.wr.toFixed(1)}% | Max DD: ${r1.maxDd.toFixed(1)}% | Trades: ${r1.total}`);

  const r2 = simulate(true, false);
  console.log(`[+Loss Cooldown]:      Final Balance: $${r2.balance.toFixed(2)} | Win Rate: ${r2.wr.toFixed(1)}% | Max DD: ${r2.maxDd.toFixed(1)}% | Trades: ${r2.total}`);

  const r3 = simulate(true, true);
  console.log(`[+Cooldown + EMA]:     Final Balance: $${r3.balance.toFixed(2)} | Win Rate: ${r3.wr.toFixed(1)}% | Max DD: ${r3.maxDd.toFixed(1)}% | Trades: ${r3.total}`);
}

async function main() {
  await runTest("ZEC", 180);
  await runTest("HYPE", 180);
  await runTest("XRP", 180);
}

main().catch(console.error);
