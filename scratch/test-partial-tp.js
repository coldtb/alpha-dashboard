import fs from 'fs';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

function calculateSMA(prices) {
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function getDirection(coinSymbol, coin, sma24, smaTrend) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  const price = coin.price;

  if (coinSymbol === 'HYPE') {
    if (sma24 === null) return change24h >= 0 ? 'LONG' : 'SHORT';
    return price >= sma24 ? 'LONG' : 'SHORT';
  }

  let score = 0;
  if (funding < -0.0001) score += 2;
  else if (funding < 0) score += 1;
  else if (funding > 0.0001) score -= 2;
  else if (funding > 0) score -= 1;

  if (change24h > 3) score += 1;
  else if (change24h < -3) score -= 1;

  let dir = score > 0 ? 'LONG' : (score < 0 ? 'SHORT' : (change24h >= 0 ? 'LONG' : 'SHORT'));
  
  if (smaTrend !== null) {
    if (dir === 'LONG' && price < smaTrend) return 'SKIP';
    if (dir === 'SHORT' && price > smaTrend) return 'SKIP';
  }

  if (sma24 !== null) {
    const maxDistancePct = coinSymbol === 'BTC' ? 0.03 : 0.015;
    if (dir === 'LONG') {
      if (price < sma24 || price > sma24 * (1 + maxDistancePct)) return 'SKIP';
    }
    if (dir === 'SHORT') {
      if (price > sma24 || price < sma24 * (1 - maxDistancePct)) return 'SKIP';
    }
  }
  return dir;
}

function computeStrategyLevels(coinSymbol, coin, dir, pivotLevels, maxTpPct, maxSlPct) {
  const price = coin.price;
  const high = coin.high || price * 1.03;
  const low  = coin.low  || price * 0.97;

  let entry = price;
  let sl = dir === 'LONG' ? price * (1 - maxSlPct) : price * (1 + maxSlPct);
  let tp = dir === 'LONG' ? price * (1 + maxTpPct) : price * (1 - maxTpPct);

  if (pivotLevels) {
    if (dir === 'LONG') {
      entry = high - (high - low) * 0.618;
      sl = pivotLevels.s2 * 0.995;
      const minSl = entry * (1 - maxSlPct);
      if (sl < minSl) sl = minSl;
      tp = pivotLevels.r1;
      const minTp = entry * 1.005;
      if (tp < minTp) tp = minTp;
      const maxTp = entry * (1 + maxTpPct);
      if (tp > maxTp) tp = maxTp;
    } else {
      entry = high - (high - low) * 0.382;
      sl = pivotLevels.r2 * 1.005;
      const maxSl = entry * (1 + maxSlPct);
      if (sl > maxSl) sl = maxSl;
      tp = pivotLevels.s1;
      const maxTp = entry * (1 - maxTpPct);
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

async function runBacktest(coinSymbol, candles, fundingMap, maxTpPct, maxSlPct, trendPeriod, usePartialTp = false) {
  let balance = 10000;
  let position = null;
  let pendingOrder = null;
  let wins = 0;
  let losses = 0;
  let partialWins = 0;
  const leverage = 5;
  let maxDd = 0;
  let peak = balance;

  let consecutiveLosses = 0;
  let cooldownUntil = 0;

  for (let i = 200; i < candles.length; i++) {
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
      
      // If we use Partial TP and haven't hit it yet, check if price touched the halfway threshold
      if (usePartialTp && !position.partialTpHit) {
        let hitPartial = false;
        if (isLong) {
          if (high >= position.partialTpThreshold) hitPartial = true;
        } else {
          if (low <= position.partialTpThreshold) hitPartial = true;
        }

        if (hitPartial) {
          // Close 50% of size at partial TP threshold
          const priceReturn = isLong 
            ? (position.partialTpThreshold - position.entryPrice) / position.entryPrice
            : (position.entryPrice - position.partialTpThreshold) / position.entryPrice;
          
          const netReturn = priceReturn * leverage - 0.0005; // Taker fee
          const activeMargin = Math.min(balance * 0.95, 50000);
          
          // Add 50% profit to balance
          balance += (activeMargin * 0.5) * netReturn;
          partialWins++;

          // Move Stop Loss of the remaining 50% to Entry!
          position.sl = position.entryPrice;
          position.partialTpHit = true;
        }
      }

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
        
        // Multiplier is 0.5 if we already closed half, or 1.0 otherwise
        const sizeMult = position.partialTpHit ? 0.5 : 1.0;
        balance += (activeMargin * sizeMult) * netReturn;

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
        const tpDistance = Math.abs(pendingOrder.tp - pendingOrder.targetEntry);
        const partialTpThreshold = pendingOrder.targetEntry + (isLong ? 1 : -1) * (tpDistance * 0.5);

        position = {
          dir: pendingOrder.dir,
          entryPrice: pendingOrder.targetEntry,
          tp: pendingOrder.tp,
          sl: pendingOrder.sl,
          partialTpThreshold,
          partialTpHit: false
        };
        pendingOrder = null;
        continue;
      }
      pendingOrder = null;
    }

    if (timestamp < cooldownUntil) continue;

    const closes24 = [];
    const closesTrend = [];
    let high24h = low;
    let low24h = high;

    for (let j = i - 24; j <= i; j++) {
      closes24.push(parseFloat(candles[j].c));
      if (parseFloat(candles[j].h) > high24h) high24h = parseFloat(candles[j].h);
      if (parseFloat(candles[j].l) < low24h) low24h = parseFloat(candles[j].l);
    }
    for (let j = i - trendPeriod; j <= i; j++) {
      closesTrend.push(parseFloat(candles[j].c));
    }

    const sma24 = calculateSMA(closes24);
    const smaTrend = calculateSMA(closesTrend);
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

    const pivotLevels = calculatePivotLevels(high24h, low24h, close);
    const direction = getDirection(coinSymbol, coinData, sma24, smaTrend);

    if (direction !== 'SKIP') {
      const levels = computeStrategyLevels(coinSymbol, coinData, direction, pivotLevels, maxTpPct, maxSlPct);
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
        sl: levels.sl
      };

      const isLong = direction === 'LONG';
      let filled = false;
      if (isLong) {
        if (low <= entryPriceWithPenalties) filled = true;
      } else {
        if (high >= entryPriceWithPenalties) filled = true;
      }

      if (filled) {
        const tpDistance = Math.abs(levels.tp - entryPriceWithPenalties);
        const partialTpThreshold = entryPriceWithPenalties + (isLong ? 1 : -1) * (tpDistance * 0.5);

        position = {
          dir: direction,
          entryPrice: entryPriceWithPenalties,
          tp: levels.tp,
          sl: levels.sl,
          partialTpThreshold,
          partialTpHit: false
        };
        pendingOrder = null;
      }
    }
  }

  const total = wins + losses;
  const wr = total > 0 ? (wins / total) * 100 : 0;
  return { balance, total, wr, maxDd, partialWins };
}

async function testCoin(coinSymbol, days, maxTpPct, maxSlPct, trendPeriod) {
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

  const baseResult = await runBacktest(coinSymbol, candles, fundingMap, maxTpPct, maxSlPct, trendPeriod, false);
  const partialResult = await runBacktest(coinSymbol, candles, fundingMap, maxTpPct, maxSlPct, trendPeriod, true);

  console.log(`\n==========================================`);
  console.log(`Results for ${coinSymbol} (180 days)`);
  console.log(`==========================================`);
  console.log(`Baseline (Full TP/SL):`);
  console.log(`  Return = +${(((baseResult.balance - 10000) / 10000) * 100).toFixed(2)}% | Drawdown = -${baseResult.maxDd.toFixed(2)}% | Trades = ${baseResult.total}`);
  console.log(`Partial TP + Breakeven:`);
  console.log(`  Return = +${(((partialResult.balance - 10000) / 10000) * 100).toFixed(2)}% | Drawdown = -${partialResult.maxDd.toFixed(2)}% | Trades = ${partialResult.total} | Partial TPs Hit = ${partialResult.partialWins}`);
}

async function main() {
  // Test SUI, XRP, HYPE, BTC with their optimal parameters
  // BTC: TP=4%, SL=1.5%, Trend=SMA200
  // SUI: TP=5%, SL=1.5%, Trend=SMA24
  // HYPE: TP=5%, SL=1.5%, Trend=SMA24
  // XRP: TP=2%, SL=3%, Trend=SMA50
  await testCoin('BTC', 180, 0.04, 0.015, 200);
  await testCoin('SUI', 180, 0.05, 0.015, 24);
  await testCoin('HYPE', 180, 0.05, 0.015, 24);
  await testCoin('XRP', 180, 0.02, 0.03, 50);
}

main().catch(console.error);
