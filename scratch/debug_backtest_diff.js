import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';

const DAYS = 30;
const initialBalance = 20;
const leverage = 5;
const roundTripFeePct = 0.0008;

const sleep = ms => new Promise(res => setTimeout(res, ms));

function calculateScore(coin) {
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
  if (vol > 30000000) score += 20;
  else if (vol > 15000000) score += 15;
  else if (vol > 5000000) score += 10;

  if (['HYPE', 'XRP', 'SUI', 'BTC'].includes(coin.symbol)) {
    score += 15;
  }
  return Math.min(score, 100);
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

function detectAutoDirection(coin, sma24 = null, smaTrend = null) {
  const symbol = coin.symbol || '';
  if (symbol === 'HYPE') {
    if (sma24 === null) return 'SKIP';
    return coin.price >= sma24 ? 'LONG' : 'SHORT';
  }
  return 'SKIP';
}

function computeStrategyLevels(coin, dir, pivotLevels, params, slCapOverride = null) {
  const price = coin.price;
  const dec = price < 1 ? 6 : (price < 10 ? 4 : 2);
  const high = coin.high || price * 1.03;
  const low  = coin.low  || price * 0.97;

  let entry, sl, tp;

  if (dir === 'LONG') {
    entry = high - (high - low) * 0.618;
    sl    = pivotLevels ? pivotLevels.s2 * 0.995 : low * 0.985;
    const minTp = entry + (entry - sl) * 1.5;
    tp = pivotLevels && pivotLevels.r1 > minTp ? pivotLevels.r1 : minTp;
  } else {
    entry = high - (high - low) * 0.382;
    sl    = pivotLevels ? pivotLevels.r2 * 1.005 : high * 1.015;
    const minTp = entry - (sl - entry) * 1.5;
    tp = pivotLevels && pivotLevels.s1 < minTp ? pivotLevels.s1 : minTp;
  }

  const tpCap = params.tpCap;
  const slCap = slCapOverride !== null ? slCapOverride : params.slCap;

  if (dir === 'LONG') {
    if (sl > entry * (1 - 0.01)) sl = entry * (1 - 0.01);
    if (sl < entry * (1 - slCap)) sl = entry * (1 - slCap);
    if (tp < entry * (1 + 0.005)) tp = entry * (1 + 0.005);
    if (tp > entry * (1 + tpCap)) tp = entry * (1 + tpCap);
  } else {
    if (sl < entry * (1 + 0.01)) sl = entry * (1 + 0.01);
    if (sl > entry * (1 + slCap)) sl = entry * (1 + slCap);
    if (tp > entry * (1 - 0.005)) tp = entry * (1 - 0.005);
    if (tp < entry * (1 - tpCap)) tp = entry * (1 - tpCap);
  }

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl:    parseFloat(sl.toFixed(dec)),
    tp:    parseFloat(tp.toFixed(dec)),
  };
}

async function run() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const endTime   = Math.floor(Date.now() / 3600000) * 3600000;
  const startTime = endTime - DAYS * 24 * 60 * 60 * 1000;
  const chunkMs   = 150 * 24 * 60 * 60 * 1000;

  const candles = [];
  let cur = startTime - 200 * 3600000;
  while (cur < endTime) {
    await sleep(100);
    const chunk = await info.candleSnapshot({
      coin: 'HYPE', interval: '1h',
      startTime: cur,
      endTime: Math.min(cur + chunkMs, endTime)
    });
    if (chunk) {
      chunk.forEach(c => {
        if (!candles.length || c.t > candles[candles.length - 1].t) candles.push(c);
      });
    }
    cur += chunkMs;
  }

  const fundingMap = {};
  cur = startTime;
  while (cur < endTime) {
    await sleep(100);
    const chunk = await info.fundingHistory({
      coin: 'HYPE',
      startTime: cur,
      endTime: Math.min(cur + chunkMs, endTime)
    });
    if (chunk) {
      chunk.forEach(f => {
        const hk = Math.floor(f.time / 3600000) * 3600000;
        fundingMap[hk] = parseFloat(f.fundingRate);
      });
    }
    cur += chunkMs;
  }

  // --- Run Sim A (test_live_20usd.js logic, HYPE-only) ---
  let balanceA = initialBalance;
  let activeMarginA = 0;
  const openPositionsA = {};
  const pendingOrdersA = {};
  const tradesA = [];

  // --- Run Sim B (api/backtest.js logic, HYPE-only) ---
  let balanceB = initialBalance;
  let positionB = null;
  let pendingOrderB = null;
  const tradesB = [];

  const coinParams = { tpCap: 0.0075, slCap: 0.015, trendPeriod: 24 };

  const startIdx = candles.findIndex(c => c.t >= startTime);
  const warmupIdx = startIdx === -1 ? 200 : startIdx;

  for (let i = warmupIdx; i < candles.length; i++) {
    const c = candles[i];
    const timestamp = c.t;
    const currentPrice = parseFloat(c.c);
    const low = parseFloat(c.l);
    const high = parseFloat(c.h);

    const prevPrice = candles[i - 24] ? parseFloat(candles[i - 24].c) : currentPrice;
    const change = ((currentPrice - prevPrice) / prevPrice) * 100;

    let high24h = low;
    let low24h = high;
    let volume24hUsd = 0;
    let sumClose24 = 0;

    for (let j = i - 24; j <= i; j++) {
      const cj = candles[j];
      if (!cj) continue;
      const cjHigh = parseFloat(cj.h);
      const cjLow = parseFloat(cj.l);
      if (cjHigh > high24h) high24h = cjHigh;
      if (cjLow < low24h) low24h = cjLow;
      volume24hUsd += parseFloat(cj.v) * parseFloat(cj.c);
      sumClose24 += parseFloat(cj.c);
    }
    const sma24 = sumClose24 / 25;

    let sumTrend = 0;
    for (let j = i - coinParams.trendPeriod; j <= i; j++) {
      if (candles[j]) sumTrend += parseFloat(candles[j].c);
    }
    const smaTrend = sumTrend / (coinParams.trendPeriod + 1);

    const volatility24h = (high24h - low24h) / low24h;

    const hourKey = Math.floor(timestamp / 3600000) * 3600000;
    const fundingRaw = fundingMap[hourKey] || 0.0000125;
    const funding = fundingRaw * 3;

    const coinData = {
      symbol: 'HYPE',
      price: currentPrice,
      change,
      volume: volume24hUsd,
      funding,
      high: high24h,
      low: low24h,
      volatility24h
    };

    const score = calculateScore(coinData);
    const direction = detectAutoDirection(coinData, sma24, smaTrend);

    if (i >= 247 && i <= 248) {
      console.log(`Step ${i}: Time=${new Date(timestamp).toISOString()}, Price=${currentPrice}, Score=${score}, Dir=${direction}`);
      console.log(`  Sim A: pos=`, openPositionsA['HYPE'], `pending=`, pendingOrdersA['HYPE']);
      console.log(`  Sim B (before): pos=`, positionB, `pending=`, pendingOrderB);
    }

    // ──────────────── SIMULATION A (test_live_20usd.js logic) ────────────────
    const posA = openPositionsA['HYPE'];
    if (posA) {
      const isLong = posA.dir === 'LONG';
      let hitSl = false, hitTp = false;
      let exitReason = 'SL';

      const currentProfitPct = isLong
        ? (currentPrice - posA.entryPrice) / posA.entryPrice
        : (posA.entryPrice - currentPrice) / posA.entryPrice;

      const totalTpDistance = Math.abs(posA.initialTp - posA.entryPrice);
      const currentTpDistance = Math.abs(currentPrice - posA.entryPrice);
      const isNearTp = totalTpDistance > 0 && currentTpDistance >= totalTpDistance * 0.85 && (isLong ? currentPrice > posA.entryPrice : currentPrice < posA.entryPrice);

      if (!posA.trailed && isNearTp) {
        posA.trailed = true;
        posA.sl = posA.initialTp;
        posA.tp = isLong ? currentPrice * 1.02 : currentPrice * 0.98;
        posA.marginScale = 1.5;
        posA.entryPrice = (posA.entryPrice * 1.0 + currentPrice * 0.5) / 1.5;
      }

      if (!posA.trailed) {
        const beTrigger = 0.015;
        if (!posA.slMovedToEntry && currentProfitPct >= beTrigger) {
          posA.sl = posA.entryPrice;
          posA.slMovedToEntry = true;
        }
      }

      if (isLong) {
        if (low <= posA.sl) { hitSl = true; exitReason = posA.trailed ? 'TRAILING_SL' : (posA.slMovedToEntry ? 'BE' : 'SL'); }
        else if (high >= posA.tp) { hitTp = true; exitReason = posA.trailed ? 'TRAILING_TP' : 'TP'; }
      } else {
        if (high >= posA.sl) { hitSl = true; exitReason = posA.trailed ? 'TRAILING_SL' : (posA.slMovedToEntry ? 'BE' : 'SL'); }
        else if (low <= posA.tp) { hitTp = true; exitReason = posA.trailed ? 'TRAILING_TP' : 'TP'; }
      }

      const durationHours = Math.round((timestamp - posA.placedAt) / 3600000);
      if (!hitSl && !hitTp && durationHours >= 24) { hitSl = true; exitReason = 'TIMEOUT'; }

      if (hitSl || hitTp) {
        let exitPrice = posA.sl;
        if (hitTp) exitPrice = posA.tp;
        else if (exitReason === 'TIMEOUT') exitPrice = currentPrice;
        else {
          if (isLong && exitPrice > currentPrice) exitPrice = currentPrice;
          else if (!isLong && exitPrice < currentPrice) exitPrice = currentPrice;
        }

        const ret = isLong
          ? (exitPrice - posA.entryPrice) / posA.entryPrice
          : (posA.entryPrice - exitPrice) / posA.entryPrice;

        let totalFundingReturn = 0;
        for (let h = posA.placedAt + 3600000; h <= timestamp; h += 3600000) {
          const hk = Math.floor(h / 3600000) * 3600000;
          const hFunding = fundingMap[hk] || 0.0000125;
          totalFundingReturn += (isLong ? -hFunding : hFunding) * leverage;
        }

        const netRet = ret * leverage + totalFundingReturn - roundTripFeePct;
        const scale = posA.marginScale || 1.0;
        const margin = posA.allocatedMargin * scale;
        const pnl = margin * netRet;
        balanceA += pnl;

        tradesA.push({ time: timestamp, dir: posA.dir, entry: posA.entryPrice, exit: exitPrice, reason: exitReason, pnl });
        delete openPositionsA['HYPE'];
        activeMarginA = 0;
      }
    }

    const orderA = pendingOrdersA['HYPE'];
    if (orderA) {
      const isLong = orderA.dir === 'LONG';
      const filled = isLong ? low <= orderA.entry : high >= orderA.entry;
      if (timestamp - orderA.placedAt > 4 * 3600000) {
        delete pendingOrdersA['HYPE'];
      } else if (filled) {
        openPositionsA['HYPE'] = {
          dir: orderA.dir,
          entryPrice: orderA.entry,
          initialTp: orderA.tp,
          tp: orderA.tp,
          sl: orderA.sl,
          placedAt: timestamp,
          slMovedToEntry: false,
          trailed: false,
          allocatedMargin: orderA.allocatedMargin,
          marginScale: 1.0
        };
        activeMarginA = orderA.allocatedMargin;
        delete pendingOrdersA['HYPE'];
      } else if (score < 85 || direction === 'SKIP') {
        delete pendingOrdersA['HYPE'];
      }
    }

    if (!openPositionsA['HYPE']) {
      if (score >= 85 && direction !== 'SKIP') {
        const requiredMargin = balanceA * 0.95;
        if (balanceA - activeMarginA >= requiredMargin) {
          let slCap = coinParams.slCap;
          if (direction === 'SHORT') slCap = 0.015;

          const pivotLevels = calculatePivotLevels(high24h, low24h, currentPrice);
          const levels = computeStrategyLevels(coinData, direction, pivotLevels, coinParams, slCap);

          const spreadPct = 0.0004;
          const slippage = Math.max(0.0002, volatility24h * 0.02);
          
          let entryFinal = levels.entry;
          let volShift = 0;
          if (volatility24h > 0.035) volShift = 0.005;

          if (direction === 'LONG') entryFinal *= (1 + spreadPct / 2 + slippage - volShift);
          else entryFinal *= (1 - spreadPct / 2 - slippage + volShift);

          const isLong = direction === 'LONG';
          const immedFill = isLong ? low <= entryFinal : high >= entryFinal;

          if (immedFill) {
            openPositionsA['HYPE'] = {
              dir: direction,
              entryPrice: entryFinal,
              initialTp: levels.tp,
              tp: levels.tp,
              sl: levels.sl,
              placedAt: timestamp,
              slMovedToEntry: false,
              trailed: false,
              allocatedMargin: requiredMargin,
              marginScale: 1.0
            };
            activeMarginA = requiredMargin;
          } else {
            pendingOrdersA['HYPE'] = {
              dir: direction,
              entry: entryFinal,
              tp: levels.tp,
              sl: levels.sl,
              placedAt: timestamp,
              allocatedMargin: requiredMargin
            };
          }
        }
      }
    }


    // ──────────────── SIMULATION B (api/backtest.js logic) ────────────────
    if (positionB) {
      const isLong = positionB.dir === 'LONG';
      let hitSl = false;
      let hitTp = false;
      let exitReason = 'SL';

      const currentProfitPct = isLong
        ? (currentPrice - positionB.entryPrice) / positionB.entryPrice
        : (positionB.entryPrice - currentPrice) / positionB.entryPrice;

      const totalTpDistance = Math.abs(positionB.initialTp - positionB.entryPrice);
      const currentTpDistance = Math.abs(currentPrice - positionB.entryPrice);
      const isNearTp = totalTpDistance > 0 && currentTpDistance >= totalTpDistance * 0.85 && (isLong ? currentPrice > positionB.entryPrice : currentPrice < positionB.entryPrice);

      if (!positionB.trailed && isNearTp) {
        positionB.trailed = true;
        positionB.sl = positionB.initialTp;
        positionB.tp = isLong ? currentPrice * 1.02 : currentPrice * 0.98;
        positionB.marginScale = 1.5;
        positionB.entryPrice = (positionB.entryPrice * 1.0 + currentPrice * 0.5) / 1.5;
      }

      if (!positionB.trailed) {
        const beTrigger = 0.015;
        if (!positionB.slMovedToEntry && currentProfitPct >= beTrigger) {
          positionB.sl = positionB.entryPrice;
          positionB.slMovedToEntry = true;
        }
      }

      if (isLong) {
        if (low <= positionB.sl) { hitSl = true; exitReason = positionB.trailed ? 'TRAILING_SL' : (positionB.slMovedToEntry ? 'BE' : 'SL'); }
        else if (high >= positionB.tp) { hitTp = true; exitReason = positionB.trailed ? 'TRAILING_TP' : 'TP'; }
      } else {
        if (high >= positionB.sl) { hitSl = true; exitReason = positionB.trailed ? 'TRAILING_SL' : (positionB.slMovedToEntry ? 'BE' : 'SL'); }
        else if (low <= positionB.tp) { hitTp = true; exitReason = positionB.trailed ? 'TRAILING_TP' : 'TP'; }
      }

      const durationHours = Math.round((timestamp - positionB.fillTime) / 3600000);
      if (!hitSl && !hitTp && durationHours >= 24) { hitSl = true; exitReason = 'TIMEOUT'; }

      if (hitSl || hitTp) {
        let exitPrice = positionB.sl;
        if (hitTp) exitPrice = positionB.tp;
        else if (exitReason === 'TIMEOUT') exitPrice = currentPrice;
        else {
          if (isLong && exitPrice > currentPrice) exitPrice = currentPrice;
          else if (!isLong && exitPrice < currentPrice) exitPrice = currentPrice;
        }

        const priceReturn = isLong 
          ? (exitPrice - positionB.entryPrice) / positionB.entryPrice
          : (positionB.entryPrice - exitPrice) / positionB.entryPrice;

        let totalFundingReturn = 0;
        for (let h = positionB.fillTime + 3600000; h <= timestamp; h += 3600000) {
          const hk = Math.floor(h / 3600000) * 3600000;
          const hFundingRate = fundingMap[hk] || 0.0000125;
          totalFundingReturn += (isLong ? -hFundingRate : hFundingRate) * leverage;
        }

        const netReturn = priceReturn * leverage + totalFundingReturn - roundTripFeePct;
        const scale = positionB.marginScale || 1.0;
        const activeMargin = Math.min(balanceB * 0.95, 50000) * scale;
        const tradePnl = activeMargin * netReturn;

        balanceB += tradePnl;
        tradesB.push({ time: timestamp, dir: positionB.dir, entry: positionB.entryPrice, exit: exitPrice, reason: exitReason, pnl: tradePnl });
        positionB = null;
      }
      continue;
    }

    if (pendingOrderB) {
      const isLong = pendingOrderB.dir === 'LONG';
      let filled = false;
      if (isLong) {
        if (low <= pendingOrderB.entryPrice) filled = true;
      } else {
        if (high >= pendingOrderB.entryPrice) filled = true;
      }

      if (filled) {
        positionB = {
          dir: pendingOrderB.dir,
          entryPrice: pendingOrderB.entryPrice,
          initialTp: pendingOrderB.tp,
          tp: pendingOrderB.tp,
          sl: pendingOrderB.sl,
          score: pendingOrderB.score,
          fillTime: timestamp,
          slMovedToEntry: false,
          trailed: false,
          marginScale: 1.0
        };
        pendingOrderB = null;
        continue;
      }

      if (score < 85 || direction === 'SKIP') {
        pendingOrderB = null;
      }
    }

    if (!positionB) {
      if (score >= 85 && direction !== 'SKIP') {
        let slCap = coinParams.slCap;
        if (direction === 'SHORT') slCap = 0.015;

        const pivotLevels = calculatePivotLevels(high24h, low24h, currentPrice);
        const levels = computeStrategyLevels(coinData, direction, pivotLevels, coinParams, slCap);

        const spreadPct = 0.0004;
        const slippagePct = Math.max(0.0002, volatility24h * 0.02);
        
        let entryFinal = levels.entry;
        let volShift = 0;
        if (volatility24h > 0.035) volShift = 0.005;

        if (direction === 'LONG') entryFinal *= (1 + spreadPct / 2 + slippagePct - volShift);
        else entryFinal *= (1 - spreadPct / 2 - slippagePct + volShift);

        const isLong = direction === 'LONG';
        const immedFill = isLong ? low <= entryFinal : high >= entryFinal;

        if (immedFill) {
          if (i === 247) console.log(`[DEBUG] Immediate fill at i=247, timestamp=${timestamp} (${new Date(timestamp).toISOString()})`);
          positionB = {
            dir: direction,
            entryPrice: entryFinal,
            initialTp: levels.tp,
            tp: levels.tp,
            sl: levels.sl,
            score: score,
            fillTime: timestamp,
            slMovedToEntry: false,
            trailed: false,
            marginScale: 1.0
          };
        } else {
          pendingOrderB = {
            dir: direction,
            entryPrice: entryFinal,
            tp: levels.tp,
            sl: levels.sl,
            score: score
          };
        }
      }
    }
    if (i >= 247 && i <= 248) {
      console.log(`  Sim B (after):  pos=`, positionB, `pending=`, pendingOrderB);
    }
  }

  console.log(`Sim A (test_live_20usd.js): Trades=${tradesA.length}, Final Balance=$${balanceA.toFixed(2)}`);
  console.log(`Sim B (api/backtest.js):   Trades=${tradesB.length}, Final Balance=$${balanceB.toFixed(2)}`);
  console.log("First 5 trades of A:", tradesA.slice(0, 5).map(t => ({ time: new Date(t.time).toISOString(), dir: t.dir, reason: t.reason })));
  console.log("First 5 trades of B:", tradesB.slice(0, 5).map(t => ({ time: new Date(t.time).toISOString(), dir: t.dir, reason: t.reason })));
}

run().catch(console.error);
