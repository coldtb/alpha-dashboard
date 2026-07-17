import fs from 'fs';
import path from 'path';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

function calculateSMA(prices) {
  const sum = prices.reduce((a, b) => a + b, 0);
  return sum / prices.length;
}

function getDirection(coin, sma24, sma100) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  const price = coin.price;

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
    const minSl = entry * 0.98; // 2% cap
    if (sl < minSl) sl = minSl;
    tp = pivotLevels.r1;
    const minTp = entry * 1.005;
    if (tp < minTp) tp = minTp;
    const maxTp = entry * 1.05; // 5% cap
    if (tp > maxTp) tp = maxTp;
  } else {
    entry = high - (high - low) * 0.382;
    sl = pivotLevels.r2 * 1.005;
    const maxSl = entry * 1.02; // 2% cap
    if (sl > maxSl) sl = maxSl;
    tp = pivotLevels.s1;
    const maxTp = entry * 0.95; // 5% cap
    if (tp < maxTp) tp = maxTp;
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
  return { p, r1, s1, r2, s2 };
}

async function main() {
  console.log("Fetching SUI historical candles for loss analysis...");
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const endTime = Date.now();
  const startTime = endTime - 90 * 24 * 60 * 60 * 1000;

  const candles = [];
  const chunkMs = 150 * 24 * 60 * 60 * 1000;
  let candleStart = startTime;
  while (candleStart < endTime) {
    const chunk = await info.candleSnapshot({
      coin: "SUI",
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
      coin: "SUI",
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
  const trades = [];
  const leverage = 5;
  let consecutiveLosses = 0;
  let cooldownUntil = 0;

  for (let i = 100; i < candles.length; i++) {
    const c = candles[i];
    const close = parseFloat(c.c);
    const low = parseFloat(c.l);
    const high = parseFloat(c.h);
    const timestamp = c.t;

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
        const activeMargin = Math.min(balance * 0.95, 50000);
        const pnlUsd = activeMargin * netReturn;
        balance += pnlUsd;

        trades.push({
          dir: position.dir,
          entryPrice: position.entryPrice,
          exitPrice,
          exitType: hitSl ? 'SL' : 'TP',
          pnlUsd,
          entryTime: position.fillTime,
          exitTime: timestamp,
          fundingAtEntry: position.fundingAtEntry,
          changeAtEntry: position.changeAtEntry,
          volatilityAtEntry: position.volatilityAtEntry,
          distanceFromSma24: position.distanceFromSma24
        });

        if (netReturn > 0) {
          consecutiveLosses = 0;
        } else {
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
          fillTime: timestamp,
          fundingAtEntry: pendingOrder.funding,
          changeAtEntry: pendingOrder.change,
          volatilityAtEntry: pendingOrder.volatility,
          distanceFromSma24: pendingOrder.distanceFromSma24
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
    const volatility24h = (high24h - low24h) / low24h;

    const hourKey = Math.floor(timestamp / 3600000) * 3600000;
    const fundingRate = fundingMap[hourKey] || 0.0000125;
    const funding = fundingRate * 8;

    const coinData = {
      symbol: "SUI",
      price: close,
      change: ((close - parseFloat(candles[i-24].c)) / parseFloat(candles[i-24].c)) * 100,
      volume: 20000000,
      high: high24h,
      low: low24h,
      funding
    };

    const pivotLevels = calculatePivotLevels(high24h, low24h, close);
    const direction = getDirection(coinData, sma24, null);

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

      pendingOrder = {
        dir: direction,
        targetEntry: entryPriceWithPenalties,
        tp: levels.tp,
        sl: levels.sl,
        funding,
        change: coinData.change,
        volatility: volatility24h,
        distanceFromSma24: ((close - sma24) / sma24) * 100
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
          fillTime: timestamp,
          fundingAtEntry: funding,
          changeAtEntry: coinData.change,
          volatilityAtEntry: volatility24h,
          distanceFromSma24: pendingOrder.distanceFromSma24
        };
        pendingOrder = null;
      }
    }
  }

  const lossTrades = trades.filter(t => t.pnlUsd < 0);
  const winTrades = trades.filter(t => t.pnlUsd > 0);

  console.log(`\n=== SUI LOSS ANALYSIS ===`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${winTrades.length} | Losses: ${lossTrades.length}`);

  console.log(`\nPrinting top 10 worst loss trades on SUI:`);
  lossTrades.sort((a, b) => a.pnlUsd - b.pnlUsd);
  lossTrades.slice(0, 10).forEach((t, idx) => {
    console.log(`\n[Loss #${idx + 1}] PnL: $${t.pnlUsd.toFixed(2)} | Dir: ${t.dir} | Exit: ${t.exitType}`);
    console.log(`  Entry Price: ${t.entryPrice.toFixed(4)} | Exit Price: ${t.exitPrice.toFixed(4)}`);
    console.log(`  Funding at Entry: ${(t.fundingAtEntry * 100).toFixed(4)}% | 24h Change: ${t.changeAtEntry.toFixed(2)}%`);
    console.log(`  Volatility at Entry: ${(t.volatilityAtEntry * 100).toFixed(2)}% | Distance from SMA24: ${t.distanceFromSma24.toFixed(2)}%`);
  });

  // Calculate average indicators for losses vs wins
  const avgLossFunding = lossTrades.reduce((sum, t) => sum + t.fundingAtEntry, 0) / lossTrades.length;
  const avgWinFunding = winTrades.reduce((sum, t) => sum + t.fundingAtEntry, 0) / winTrades.length;
  
  const avgLossChange = lossTrades.reduce((sum, t) => sum + t.changeAtEntry, 0) / lossTrades.length;
  const avgWinChange = winTrades.reduce((sum, t) => sum + t.changeAtEntry, 0) / winTrades.length;

  const avgLossVol = lossTrades.reduce((sum, t) => sum + t.volatilityAtEntry, 0) / lossTrades.length;
  const avgWinVol = winTrades.reduce((sum, t) => sum + t.volatilityAtEntry, 0) / winTrades.length;

  console.log(`\n=== METRICS COMPARISON (WINS VS LOSSES) ===`);
  console.log(`Average Funding Rate: Wins = ${(avgWinFunding * 100).toFixed(4)}% | Losses = ${(avgLossFunding * 100).toFixed(4)}%`);
  console.log(`Average 24h Change: Wins = ${avgWinChange.toFixed(2)}% | Losses = ${avgLossChange.toFixed(2)}%`);
  console.log(`Average 24h Volatility: Wins = ${(avgWinVol * 100).toFixed(2)}% | Losses = ${(avgLossVol * 100).toFixed(2)}%`);
}

main().catch(console.error);
