import fs from 'fs';
import path from 'path';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

function calculateSMA(prices) {
  const sum = prices.reduce((a, b) => a + b, 0);
  return sum / prices.length;
}

function getDirection(variant, coin, sma24, sma100) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  const price = coin.price;

  if (variant === 'baseline') {
    // Standard Funding-Biased Mean Reversion
    let score = 0;
    if (funding < -0.0001) score += 2;
    else if (funding < 0) score += 1;
    else if (funding > 0.0001) score -= 2;
    else if (funding > 0) score -= 1;
    if (change24h > 3) score += 1;
    else if (change24h < -3) score -= 1;

    let dir = score > 0 ? 'LONG' : (score < 0 ? 'SHORT' : (change24h >= 0 ? 'LONG' : 'SHORT'));
    if (sma24 !== null) {
      if (dir === 'LONG' && (price < sma24 || price > sma24 * 1.05)) return 'SKIP';
      if (dir === 'SHORT' && (price > sma24 || price < sma24 * 0.95)) return 'SKIP';
    }
    return dir;
  }

  if (variant === 'sma24_neutral' || variant === 'vol_sizing') {
    // Pure Trend-Following (Option A)
    if (sma24 === null) return 'SKIP';
    return price >= sma24 ? 'LONG' : 'SHORT';
  }

  if (variant === 'sma100_lock') {
    // Mean Reversion locked with SMA100 trend
    let score = 0;
    if (funding < -0.0001) score += 2;
    else if (funding < 0) score += 1;
    else if (funding > 0.0001) score -= 2;
    else if (funding > 0) score -= 1;
    if (change24h > 3) score += 1;
    else if (change24h < -3) score -= 1;

    let dir = score > 0 ? 'LONG' : (score < 0 ? 'SHORT' : (change24h >= 0 ? 'LONG' : 'SHORT'));
    if (sma100 !== null) {
      if (dir === 'LONG' && price < sma100) return 'SKIP';
      if (dir === 'SHORT' && price > sma100) return 'SKIP';
    }
    if (sma24 !== null) {
      if (dir === 'LONG' && (price < sma24 || price > sma24 * 1.05)) return 'SKIP';
      if (dir === 'SHORT' && (price > sma24 || price < sma24 * 0.95)) return 'SKIP';
    }
    return dir;
  }

  return 'SKIP';
}

function computeStrategyLevels(coin, dir, pivotLevels) {
  const price = coin.price;
  const high = coin.high || price * 1.03;
  const low  = coin.low  || price * 0.97;

  let entry = price;
  let sl = dir === 'LONG' ? price * 0.97 : price * 1.03;
  let tp = dir === 'LONG' ? price * 1.06 : price * 0.94;

  if (pivotLevels) {
    if (dir === 'LONG') {
      entry = high - (high - low) * 0.618;
      sl = pivotLevels.s2 * 0.995;
      const minSl = entry * 0.98; // 2% cap
      if (sl < minSl) sl = minSl;
      tp = pivotLevels.r1;
      const minTp = entry * 1.005;
      if (tp < minTp) tp = minTp;
      const maxTp = entry * 1.03; // 3% cap
      if (tp > maxTp) tp = maxTp;
    } else {
      entry = high - (high - low) * 0.382;
      sl = pivotLevels.r2 * 1.005;
      const maxSl = entry * 1.02; // 2% cap
      if (sl > maxSl) sl = maxSl;
      tp = pivotLevels.s1;
      const maxTp = entry * 0.97; // 3% cap
      if (tp < maxTp) tp = maxTp;
      const minTp = entry * 0.97;
      if (tp < minTp) tp = minTp;
    }
  }

  return { entry, sl, tp };
}

function calculatePivotLevels(high, low, close) {
  const p = (high + low + close) / 3;
  const r1 = p + (high - low) * 0.382;
  const s1 = p - (high - low) * 0.382;
  const r2 = p + (high - low) * 0.618;
  const s2 = p - (high - low) * 0.618;
  return { p, r1, s1, r2, s2 };
}

async function runBtcBacktest(variant, days = 90) {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  const candles = [];
  const chunkMs = 150 * 24 * 60 * 60 * 1000;
  let candleStart = startTime;
  while (candleStart < endTime) {
    const chunk = await info.candleSnapshot({
      coin: "BTC",
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

  const fundingHistory = [];
  let currentStart = startTime;
  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + chunkMs, endTime);
    const chunk = await info.fundingHistory({
      coin: "BTC",
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

  let balance = 10000;
  let position = null;
  let pendingOrder = null;
  let wins = 0;
  let losses = 0;
  const leverage = 5;
  let maxDd = 0;
  let peak = balance;

  let consecutiveLosses = 0;
  let cooldownUntil = 0;

  for (let i = 100; i < candles.length; i++) {
    const c = candles[i];
    const close = parseFloat(c.c);
    const low = parseFloat(c.l);
    const high = parseFloat(c.h);
    const timestamp = c.t;

    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDd) maxDd = dd;

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
        
        const netReturn = priceReturn * leverage - 0.0005;
        const positionSizeFactor = position.sizeFactor !== undefined ? position.sizeFactor : 0.95;
        const activeMargin = Math.min(balance * positionSizeFactor, 50000);
        balance += activeMargin * netReturn;

        if (netReturn > 0) {
          wins++;
          consecutiveLosses = 0;
        } else {
          losses++;
          consecutiveLosses++;
          if (consecutiveLosses >= 2) {
            cooldownUntil = timestamp + 24 * 60 * 60 * 1000;
            consecutiveLosses = 0;
          }
        }
        position = null;
      }
      continue;
    }

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
          sl: pendingOrder.sl,
          sizeFactor: pendingOrder.sizeFactor
        };
        pendingOrder = null;
        continue;
      }
      pendingOrder = null;
    }

    if (timestamp < cooldownUntil) continue;

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
      symbol: "BTC",
      price: close,
      change: ((close - parseFloat(candles[i-24].c)) / parseFloat(candles[i-24].c)) * 100,
      volume: 20000000,
      high: high24h,
      low: low24h,
      funding
    };

    const pivotLevels = calculatePivotLevels(high24h, low24h, close);
    const direction = getDirection(variant, coinData, sma24, sma100);

    if (direction !== 'SKIP') {
      const levels = computeStrategyLevels(coinData, direction, pivotLevels);
      const spreadPct = 0.0004;
      const slippagePct = Math.max(0.0002, volatility24h * 0.02);

      let entryPriceWithPenalties = levels.entry;
      if (direction === 'LONG') {
        entryPriceWithPenalties = levels.entry * (1 + spreadPct / 2) * (1 + slippagePct);
      } else {
        entryPriceWithPenalties = levels.entry * (1 - spreadPct / 2) * (1 - slippagePct);
      }

      // Dynamic sizing in vol_sizing variant
      const dynamicSizeFactor = (variant === 'vol_sizing')
        ? Math.min(0.95, Math.max(0.15, 0.05 / volatility24h))
        : 0.95;

      pendingOrder = {
        dir: direction,
        targetEntry: entryPriceWithPenalties,
        tp: levels.tp,
        sl: levels.sl,
        sizeFactor: dynamicSizeFactor
      };

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
          sl: levels.sl,
          sizeFactor: dynamicSizeFactor
        };
        pendingOrder = null;
      }
    }
  }

  const total = wins + losses;
  const wr = total > 0 ? (wins / total) * 100 : 0;
  return { balance, total, wr, maxDd };
}

async function main() {
  const periods = [90, 180];
  const variants = ['baseline', 'sma24_neutral', 'vol_sizing', 'sma100_lock'];

  for (const days of periods) {
    console.log(`\n=== RUNNING BTC OPTIMIZATION TESTS (${days} Days) ===`);
    for (const v of variants) {
      const r = await runBtcBacktest(v, days);
      const returnPct = ((r.balance - 10000) / 10000) * 100;
      console.log(`[BTC - ${days}d - ${v}] Balance: $${r.balance.toFixed(2)} | Return: ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}% | WR: ${r.wr.toFixed(1)}% | Max DD: ${r.maxDd.toFixed(1)}% | Trades: ${r.total}`);
      await new Promise(res => setTimeout(res, 500));
    }
  }
}

main().catch(console.error);
