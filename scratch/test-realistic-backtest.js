import fs from 'fs';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

const config = {
  minScore: 65,
  minSlBuffer: 0.01,
  minTpBuffer: 0.005,
  maxDistancePct: 0.05,
  watchlist: [ 'HYPE', 'XRP' ],
};

function calculateScore(coin) {
  let score = 50;
  if (Math.abs(coin.change) > 5) score += 10;
  if (coin.volume > 15000000) score += 10;
  if (config.watchlist.includes(coin.symbol)) score += 15;
  return Math.min(score, 100);
}

function detectAutoDirection(coin, sma24) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  let score = 0;

  if (funding < -0.0001) score += 2;
  else if (funding > 0.0001) score -= 2;

  if (change24h > 3) score += 1;
  else if (change24h < -3) score -= 1;

  let dir = score >= 0 ? 'LONG' : 'SHORT';

  if (sma24) {
    const price = coin.price;
    const maxDist = config.maxDistancePct;
    if (dir === 'LONG') {
      if (price < sma24 || price > sma24 * (1 + maxDist)) return 'SKIP';
    } else {
      if (price > sma24 || price < sma24 * (1 - maxDist)) return 'SKIP';
    }
  }
  return dir;
}

function computeStrategyLevels(coin, dir) {
  const price = coin.price;
  const high = coin.high || price * 1.03;
  const low  = coin.low  || price * 0.97;
  const vwap = (high + low + price) / 3;

  let entry = price;
  let sl = dir === 'LONG' ? price * 0.97 : price * 1.03;
  let tp = dir === 'LONG' ? price * 1.06 : price * 0.94;

  if (dir === 'LONG') {
    entry = high - (high - low) * 0.618;
    sl = low * 0.985;
    const minSl = price * 0.98;
    if (sl < minSl) sl = minSl;
    const maxSl = price * 0.99;
    if (sl > maxSl) sl = maxSl;
    tp = entry + (entry - sl) * 2;
    if (tp < price * 1.005) tp = price * 1.005;
    if (tp > price * 1.03) tp = price * 1.03;
  } else {
    entry = high - (high - low) * 0.382;
    sl = high * 1.015;
    const maxSl = price * 1.02;
    if (sl > maxSl) sl = maxSl;
    const minSl = price * 1.01;
    if (sl < minSl) sl = minSl;
    tp = entry - (sl - entry) * 2;
    if (tp > price * 0.995) tp = price * 0.995;
    if (tp < price * 0.97) tp = price * 0.97;
  }

  return { entry, sl, tp };
}

async function runTest() {
  const coinSymbol = "ZEC";
  const days = 90;
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  console.log("Fetching ZEC candles...");
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

  console.log(`Loaded ${candles.length} candles.`);

  // Model A: Current simplified (Limit Entry, instant fill without touch check)
  // Model B: Realistic Market Entry (Enters at actual close price of the hour)
  // Model C: Realistic Limit Entry (Checks if candle low/high touches levels.entry before filling)

  function simulate(mode) {
    let balance = 10000;
    let position = null;
    let pendingOrder = null;
    let wins = 0;
    let losses = 0;
    const leverage = 5;

    for (let i = 24; i < candles.length; i++) {
      const c = candles[i];
      const close = parseFloat(c.c);
      const low = parseFloat(c.l);
      const high = parseFloat(c.h);

      // 24h metrics
      let sumClose = 0;
      let high24h = low;
      let low24h = high;
      for (let j = i - 24; j <= i; j++) {
        const cj = candles[j];
        sumClose += parseFloat(cj.c);
        if (parseFloat(cj.h) > high24h) high24h = parseFloat(cj.h);
        if (parseFloat(cj.l) < low24h) low24h = parseFloat(cj.l);
      }
      const sma24 = sumClose / 25;

      const coinData = {
        symbol: coinSymbol,
        price: close,
        change: ((close - parseFloat(candles[i-24].c)) / parseFloat(candles[i-24].c)) * 100,
        volume: 20000000,
        high: high24h,
        low: low24h
      };

      const score = calculateScore(coinData);

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

          if (netReturn > 0) wins++; else losses++;
          position = null;
        }
        continue;
      }

      // Check pending order execution for Model C
      if (mode === 'C' && pendingOrder) {
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

        // Cancel pending if trend/score changes
        if (score < config.minScore || detectAutoDirection(coinData, sma24) === 'SKIP') {
          pendingOrder = null;
        }
      }

      // Evaluate new signal
      if (score >= config.minScore) {
        const direction = detectAutoDirection(coinData, sma24);
        if (direction !== 'SKIP') {
          const levels = computeStrategyLevels(coinData, direction);

          if (mode === 'A') {
            // Simplified (Instant Limit Entry)
            position = {
              dir: direction,
              entryPrice: levels.entry,
              tp: levels.tp,
              sl: levels.sl
            };
          } else if (mode === 'B') {
            // Market Entry (Enter at actual candle close)
            position = {
              dir: direction,
              entryPrice: close,
              tp: levels.tp,
              sl: levels.sl
            };
          } else if (mode === 'C') {
            // Limit Order (Wait for touch)
            pendingOrder = {
              dir: direction,
              targetEntry: levels.entry,
              tp: levels.tp,
              sl: levels.sl
            };
          }
        }
      }
    }

    const total = wins + losses;
    const wr = total > 0 ? (wins / total) * 100 : 0;
    return { balance, total, wr };
  }

  console.log("\n=== SIMULATION RESULTS FOR ZEC (90 DAYS) ===");
  const resA = simulate('A');
  console.log(`[Model A - Instant Limit Fill (Current)]: Final Balance: $${resA.balance.toFixed(2)} | Trades: ${resA.total} | Win Rate: ${resA.wr.toFixed(1)}%`);

  const resB = simulate('B');
  console.log(`[Model B - Market Order Entry]:           Final Balance: $${resB.balance.toFixed(2)} | Trades: ${resB.total} | Win Rate: ${resB.wr.toFixed(1)}%`);

  const resC = simulate('C');
  console.log(`[Model C - Limit Touch (Realistic)]:      Final Balance: $${resC.balance.toFixed(2)} | Trades: ${resC.total} | Win Rate: ${resC.wr.toFixed(1)}%`);
}

runTest().catch(console.error);
