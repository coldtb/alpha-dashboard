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
  if (dir === 'LONG' && price < sma24) return 'SKIP';
  if (dir === 'SHORT' && price > sma24) return 'SKIP';

  return dir;
}

function computeStrategyLevels(coin, dir, slBuffer, tpBuffer) {
  const price = coin.price;
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
    const minTp = entry + (entry - sl) * 1.5;
    tp = vwap > minTp ? vwap : entry + (entry - sl) * 2;
  } else {
    entry = high - (high - low) * 0.382;
    sl = high * 1.015;
    const minTp = entry - (sl - entry) * 1.5;
    tp = vwap < minTp ? vwap : entry - (sl - entry) * 2;
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

function simulateAsset(candles, fundingMap, minScore, slBuffer, tpBuffer) {
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
          pnlUsd: tradePnl
        });
        position = null;
      }
      continue;
    }

    if (score >= minScore) {
      const direction = detectAutoDirection(coinData, sma24);
      if (direction !== 'SKIP') {
        const levels = computeStrategyLevels(coinData, direction, slBuffer, tpBuffer);
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

async function runSweep() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });
  const coins = ["BTC", "ETH", "SOL", "LINK", "XRP"];
  const days = 365;
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  console.log("=== STEP 1: Fetching 365-day data for watchlist coins ===");
  const coinDataMap = {};
  const chunkMs = 150 * 24 * 60 * 60 * 1000;

  for (const coin of coins) {
    try {
      console.log(`Fetching ${coin}...`);
      const candles = [];
      let currentStart = startTime;
      while (currentStart < endTime) {
        const currentEnd = Math.min(currentStart + chunkMs, endTime);
        const chunk = await info.candleSnapshot({ coin, interval: "1h", startTime: currentStart, endTime: currentEnd });
        if (chunk && chunk.length > 0) candles.push(...chunk);
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
        if (chunk && chunk.length > 0) fundingHistory.push(...chunk);
        currentStart += chunkMs;
      }
      const fundingMap = {};
      fundingHistory.forEach(item => {
        const hourTimestamp = Math.floor(item.time / 3600000) * 3600000;
        fundingMap[hourTimestamp] = parseFloat(item.fundingRate);
      });

      coinDataMap[coin] = { candles: uniqueCandles, fundingMap };
      console.log(`-> Loaded ${uniqueCandles.length} candles for ${coin}.`);
    } catch (e) {
      console.error(`Failed to load ${coin}:`, e.message);
    }
  }

  // Define parameter grid
  const minScores = [85, 90];
  const slBuffers = [0.010, 0.015, 0.020, 0.025]; // 1.0%, 1.5%, 2.0%, 2.5%
  const tpBuffers = [0.020, 0.030, 0.040, 0.050]; // 2.0%, 3.0%, 4.0%, 5.0%

  console.log("\n=== STEP 2: Running parameter sweep ===");
  const sweepResults = [];

  for (const minScore of minScores) {
    for (const slBuffer of slBuffers) {
      for (const tpBuffer of tpBuffers) {
        let totalReturn = 0;
        let totalTrades = 0;
        const coinReturns = {};

        for (const coin of coins) {
          if (!coinDataMap[coin]) continue;
          const { candles, fundingMap } = coinDataMap[coin];
          const sim = simulateAsset(candles, fundingMap, minScore, slBuffer, tpBuffer);
          totalReturn += sim.returnPct;
          totalTrades += sim.trades.length;
          coinReturns[coin] = sim.returnPct;
        }

        const avgReturn = totalReturn / coins.length;
        sweepResults.push({
          minScore,
          slBuffer,
          tpBuffer,
          avgReturn,
          totalTrades,
          coinReturns
        });
      }
    }
  }

  // Sort sweep results by average basket return descending
  sweepResults.sort((a, b) => b.avgReturn - a.avgReturn);

  console.log("\n=== Top 5 Configurations found ===");
  sweepResults.slice(0, 5).forEach((res, i) => {
    console.log(`\nRank ${i + 1}: avgBasketReturn = ${res.avgReturn.toFixed(2)}% | trades = ${res.totalTrades}`);
    console.log(`  - Parameters: minScore = ${res.minScore} | SL = ${(res.slBuffer*100).toFixed(1)}% | TP = ${(res.tpBuffer*100).toFixed(1)}%`);
    console.log(`  - Breakdown: BTC: ${res.coinReturns.BTC.toFixed(1)}% | ETH: ${res.coinReturns.ETH.toFixed(1)}% | SOL: ${res.coinReturns.SOL.toFixed(1)}% | LINK: ${res.coinReturns.LINK.toFixed(1)}% | XRP: ${res.coinReturns.XRP.toFixed(1)}%`);
  });

  const best = sweepResults[0];
  console.log(`\n🏆 BEST ROBUST CONFIGURATION:`);
  console.log(`minScore = ${best.minScore}`);
  console.log(`minSlBuffer = ${best.slBuffer} (${(best.slBuffer*100).toFixed(1)}%)`);
  console.log(`minTpBuffer = ${best.tpBuffer} (${(best.tpBuffer*100).toFixed(1)}%)`);
}

runSweep().catch(console.error);
