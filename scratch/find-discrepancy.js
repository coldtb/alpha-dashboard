import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

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

  const watchlist = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];
  if (watchlist.includes(coin.symbol)) {
    score += 15;
  }
  return Math.min(score, 100);
}

function detectAutoDirection(coin, sma24) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  let score = 0;

  if (funding < -0.0001) {
    score += 2;
  } else if (funding < 0) {
    score += 1;
  } else if (funding > 0.0001) {
    score -= 2;
  } else if (funding > 0) {
    score -= 1;
  }

  if (change24h > 3) score += 1;
  else if (change24h < -3) score -= 1;

  let dir = 'LONG';
  if (score > 0) dir = 'LONG';
  else if (score < 0) dir = 'SHORT';
  else dir = change24h >= 0 ? 'LONG' : 'SHORT';

  const price = coin.price;
  if (dir === 'LONG' && price < sma24) {
    return 'SKIP';
  }
  if (dir === 'SHORT' && price > sma24) {
    return 'SKIP';
  }

  return dir;
}

function computeStrategyLevels(coin, dir, slBuffer, tpBuffer, isBackend = false) {
  const price = coin.price;
  const funding = coin.funding || 0;
  const dec = price < 1 ? 6 : (price < 10 ? 4 : 2);

  let high = coin.high || price * 1.03;
  let low  = coin.low  || price * 0.97;
  let vwap = (high + low + price) / 3;

  let entry = price;
  let sl = dir === 'LONG' ? price * 0.97 : price * 1.03;
  let tp = dir === 'LONG' ? price * 1.06 : price * 0.94;

  if (dir === 'LONG') {
    entry = high - (high - low) * 0.618;
    sl = low * 0.985;

    if (coin.score >= 90) {
      const shallowEntry = price * 0.997;
      if (shallowEntry > entry) entry = shallowEntry;
    }

    const minTp = entry + (entry - sl) * 1.5;
    tp = vwap > minTp ? vwap : entry + (entry - sl) * 2;

    // Backend-specific squeeze entry
    if (isBackend && funding < -0.0005) {
      entry = price;
    }
  } else {
    entry = high - (high - low) * 0.382;
    sl = high * 1.015;

    if (coin.score >= 90) {
      const shallowEntry = price * 1.003;
      if (shallowEntry < entry) entry = shallowEntry;
    }

    const minTp = entry - (sl - entry) * 1.5;
    tp = vwap < minTp ? vwap : entry - (sl - entry) * 2;

    // Backend-specific overextended long entry
    if (isBackend && funding > 0.001) {
      entry = price;
    }
  }

  if (dir === 'LONG') {
    const maxSlAllowed = entry * (1 - slBuffer);
    if (sl > maxSlAllowed) sl = maxSlAllowed;
    const minTpAllowed = entry * (1 + tpBuffer);
    if (tp < minTpAllowed) tp = minTpAllowed;
  } else {
    const minSlAllowed = entry * (1 + slBuffer);
    if (sl < minSlAllowed) sl = minSlAllowed;
    const maxTpAllowed = entry * (1 - tpBuffer);
    if (tp > maxTpAllowed) tp = maxTpAllowed;
  }

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl: parseFloat(sl.toFixed(dec)),
    tp: parseFloat(tp.toFixed(dec))
  };
}

function simulateAsset(candles, fundingMap, minScore, slBuffer, tpBuffer, isBackend = false) {
  const initialBalance = 10000;
  let balance = initialBalance;
  let position = null;
  const trades = [];
  const leverage = 5;
  const roundTripFeePct = 0.0005;

  for (let i = 24; i < candles.length; i++) {
    const c = candles[i];
    const timestamp = c.t;
    const currentPrice = parseFloat(c.c);
    const low = parseFloat(c.l);
    const high = parseFloat(c.h);

    const candle24hAgo = candles[i - 24];
    const prevPrice = parseFloat(candle24hAgo.c) || currentPrice;
    const change = ((currentPrice - prevPrice) / prevPrice) * 100;

    let high24h = low;
    let low24h = high;
    let volume24hUsd = 0;
    let sumClose24 = 0;

    for (let j = i - 24; j <= i; j++) {
      const cj = candles[j];
      const cjHigh = parseFloat(cj.h);
      const cjLow = parseFloat(cj.l);
      if (cjHigh > high24h) high24h = cjHigh;
      if (cjLow < low24h) low24h = cjLow;
      volume24hUsd += parseFloat(cj.v) * parseFloat(cj.c);
      sumClose24 += parseFloat(cj.c);
    }

    const sma24 = sumClose24 / 25;
    const hourKey = Math.floor(timestamp / 3600000) * 3600000;
    const fundingRateRaw = fundingMap[hourKey] || 0.0000125;
    const funding = fundingRateRaw * 8;

    const coinData = {
      symbol: candles[0].s,
      price: currentPrice,
      change,
      volume: volume24hUsd,
      funding,
      high: high24h,
      low: low24h
    };

    const score = calculateScore(coinData);
    // coinData.score = score; // set score on coinData for computeStrategyLevels

    if (position) {
      const isLong = position.dir === 'LONG';
      let hitSl = false;
      let hitTp = false;

      if (isLong) {
        if (!position.slMovedToEntry && high >= position.entryPrice * 1.015) {
          position.sl = position.entryPrice;
          position.slMovedToEntry = true;
        }
        if (low <= position.sl) hitSl = true;
        else if (high >= position.tp) hitTp = true;
      } else {
        if (!position.slMovedToEntry && low <= position.entryPrice * 0.985) {
          position.sl = position.entryPrice;
          position.slMovedToEntry = true;
        }
        if (high >= position.sl) hitSl = true;
        else if (low <= position.tp) hitTp = true;
      }

      if (hitSl || hitTp) {
        const exitPrice = hitSl ? position.sl : position.tp;
        const priceReturn = isLong 
          ? (exitPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - exitPrice) / position.entryPrice;

        const leveragedReturn = priceReturn * leverage;
        const netReturn = leveragedReturn - roundTripFeePct;
        const tradePnl = balance * netReturn;

        balance += tradePnl;
        trades.push({
          dir: position.dir,
          entryPrice: position.entryPrice,
          exitPrice,
          exitType: hitSl ? 'SL' : 'TP',
          entryTime: position.fillTime,
          exitTime: timestamp,
          returnPct: netReturn * 100,
          pnlUsd: tradePnl,
          balanceAfter: balance
        });
        position = null;
      }
      continue;
    }

    if (score >= minScore) {
      const direction = detectAutoDirection(coinData, sma24);
      if (direction !== 'SKIP') {
        const levels = computeStrategyLevels(coinData, direction, slBuffer, tpBuffer, isBackend);
        position = {
          dir: direction,
          entryPrice: currentPrice,
          tp: levels.tp,
          sl: levels.sl,
          score,
          fillTime: timestamp,
          slMovedToEntry: false
        };
      }
    }
  }

  return {
    trades,
    finalBalance: balance,
    returnPct: ((balance - initialBalance) / initialBalance) * 100
  };
}

async function runCompare() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });
  const coin = "XRP";
  const days = 365;
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  console.log("=== Fetching Method A (Chunked, like standalone test) ===");
  const candlesA = [];
  const chunkMs = 150 * 24 * 60 * 60 * 1000;
  let currentStart = startTime;
  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + chunkMs, endTime);
    const chunk = await info.candleSnapshot({ coin, interval: "1h", startTime: currentStart, endTime: currentEnd });
    if (chunk && chunk.length > 0) {
      candlesA.push(...chunk);
    }
    currentStart += chunkMs;
  }
  
  const seenTimes = new Set();
  const uniqueCandlesA = candlesA.filter(c => {
    if (seenTimes.has(c.t)) return false;
    seenTimes.add(c.t);
    return true;
  }).sort((a, b) => a.t - b.t);

  console.log(`Method A: fetched ${candlesA.length} total, ${uniqueCandlesA.length} unique candles.`);

  console.log("\n=== Fetching Method B (Single Snapshot, like backend API) ===");
  const uniqueCandlesB = await info.candleSnapshot({
    coin,
    interval: "1h",
    startTime,
    endTime
  });
  console.log(`Method B: fetched ${uniqueCandlesB.length} candles.`);

  // Check if they are identical
  let identicalCandles = true;
  if (uniqueCandlesA.length !== uniqueCandlesB.length) {
    console.log(`WARNING: Candle count mismatch! A: ${uniqueCandlesA.length}, B: ${uniqueCandlesB.length}`);
    identicalCandles = false;
  } else {
    for (let i = 0; i < uniqueCandlesA.length; i++) {
      if (uniqueCandlesA[i].t !== uniqueCandlesB[i].t || uniqueCandlesA[i].c !== uniqueCandlesB[i].c) {
        console.log(`WARNING: Candle mismatch at index ${i}!`);
        console.log(`A: time=${uniqueCandlesA[i].t}, close=${uniqueCandlesA[i].c}`);
        console.log(`B: time=${uniqueCandlesB[i].t}, close=${uniqueCandlesB[i].c}`);
        identicalCandles = false;
        break;
      }
    }
  }
  if (identicalCandles) {
    console.log("SUCCESS: Candle histories are 100% identical!");
  }

  // Fetch funding rate (single snapshot style)
  const fundingHistory = await info.fundingHistory({
    coin,
    startTime,
    endTime
  });
  const fundingMap = {};
  fundingHistory.forEach(item => {
    const hourTimestamp = Math.floor(item.time / 3600000) * 3600000;
    fundingMap[hourTimestamp] = parseFloat(item.fundingRate);
  });

  const minScore = 90;
  const slBuffer = 0.010;
  const tpBuffer = 0.020;

  // Run simulation on Method A
  console.log("\nRunning simulation with Method A candles (No funding-based entry check)...");
  const resA = simulateAsset(uniqueCandlesA, fundingMap, minScore, slBuffer, tpBuffer, false);
  console.log(`Simulation A return: ${resA.returnPct.toFixed(4)}% | Trades: ${resA.trades.length}`);

  // Run simulation on Method B with Backend Logic (No funding entry check first)
  console.log("Running simulation with Method B candles (No funding-based entry check)...");
  const resB = simulateAsset(uniqueCandlesB, fundingMap, minScore, slBuffer, tpBuffer, false);
  console.log(`Simulation B return: ${resB.returnPct.toFixed(4)}% | Trades: ${resB.trades.length}`);

  // Run simulation on Method B with Backend Logic (WITH funding entry check)
  console.log("Running simulation with Method B candles (WITH funding-based entry check)...");
  const resC = simulateAsset(uniqueCandlesB, fundingMap, minScore, slBuffer, tpBuffer, true);
  console.log(`Simulation C return: ${resC.returnPct.toFixed(4)}% | Trades: ${resC.trades.length}`);

  // Compare trades of A vs B
  console.log("\n=== Comparing Trades between A and B (No funding entry checks) ===");
  const len = Math.min(resA.trades.length, resB.trades.length);
  let diffCount = 0;
  for (let i = 0; i < len; i++) {
    const tA = resA.trades[i];
    const tB = resB.trades[i];
    if (tA.entryTime !== tB.entryTime || Math.abs(tA.entryPrice - tB.entryPrice) > 0.0001 || tA.exitType !== tB.exitType) {
      console.log(`Mismatch at Trade ${i}:`);
      console.log(`A: dir=${tA.dir}, entryPrice=${tA.entryPrice}, exitPrice=${tA.exitPrice}, exitType=${tA.exitType}, time=${tA.entryTime}, return=${tA.returnPct.toFixed(2)}%`);
      console.log(`B: dir=${tB.dir}, entryPrice=${tB.entryPrice}, exitPrice=${tB.exitPrice}, exitType=${tB.exitType}, time=${tB.entryTime}, return=${tB.returnPct.toFixed(2)}%`);
      diffCount++;
      if (diffCount > 5) break;
    }
  }

  // Compare trades of B vs C
  console.log("\n=== Comparing Trades between B (No funding entry check) and C (WITH funding entry check) ===");
  let diffCountBC = 0;
  const lenBC = Math.min(resB.trades.length, resC.trades.length);
  for (let i = 0; i < lenBC; i++) {
    const tB = resB.trades[i];
    const tC = resC.trades[i];
    if (tB.entryTime !== tC.entryTime || Math.abs(tB.entryPrice - tC.entryPrice) > 0.0001 || tB.exitType !== tC.exitType) {
      console.log(`Mismatch at Trade ${i}:`);
      console.log(`B: dir=${tB.dir}, entryPrice=${tB.entryPrice}, exitPrice=${tB.exitPrice}, exitType=${tB.exitType}, time=${tB.entryTime}, return=${tB.returnPct.toFixed(2)}%`);
      console.log(`C: dir=${tC.dir}, entryPrice=${tC.entryPrice}, exitPrice=${tC.exitPrice}, exitType=${tC.exitType}, time=${tC.entryTime}, return=${tC.returnPct.toFixed(2)}%`);
      diffCountBC++;
      if (diffCountBC > 5) break;
    }
  }
}

runCompare().catch(console.error);
