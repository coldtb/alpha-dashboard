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

  // Apply Trend Filter: Only align with the 24h SMA trend
  const price = coin.price;
  if (dir === 'LONG' && price < sma24) {
    return 'SKIP'; // Filter out counter-trend longs
  }
  if (dir === 'SHORT' && price > sma24) {
    return 'SKIP'; // Filter out counter-trend shorts
  }

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

    if (coin.score >= 90) {
      const shallowEntry = price * 0.997;
      if (shallowEntry > entry) entry = shallowEntry;
    }

    const minTp = entry + (entry - sl) * 1.5;
    tp = vwap > minTp ? vwap : entry + (entry - sl) * 2;
  } else {
    entry = high - (high - low) * 0.382;
    sl = high * 1.015;

    if (coin.score >= 90) {
      const shallowEntry = price * 1.003;
      if (shallowEntry < entry) entry = shallowEntry;
    }

    const minTp = entry - (sl - entry) * 1.5;
    tp = vwap < minTp ? vwap : entry - (sl - entry) * 2;
  }

  // Safety bounds
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
  let pendingOrder = null;
  const trades = [];
  const leverage = 5;
  const roundTripFeePct = 0.0005;
  const entryShiftThreshold = 0.0075;

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

    // Position check
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

    // No position: Enter instantly at market price if score is high and trend matches
    if (score >= minScore) {
      const direction = detectAutoDirection(coinData, sma24);
      if (direction !== 'SKIP') {
        const levels = computeStrategyLevels(coinData, direction, slBuffer, tpBuffer);

        // Enter at currentPrice (Market Entry)
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

async function runTest() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  console.log("=== Running Single Test with Optimized Parameters (208 Days Max History) ===");
  
  const coins = ["BTC", "ETH", "SOL", "LINK", "XRP"];
  const days = 365; 
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  const coinDataMap = {};
  for (const coin of coins) {
    try {
      console.log(`Fetching 1-year data for ${coin}...`);
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

      coinDataMap[coin] = { candles: uniqueCandles, fundingMap };
    } catch (e) {
      console.error(`Failed to fetch ${coin}:`, e.message);
    }
  }

  // Best parameters found
  const minScore = 90;
  const slBuffer = 0.010; // 1.0%
  const tpBuffer = 0.020; // 2.0%

  let totalReturnPct = 0;
  let totalTradesCount = 0;
  const allTrades = [];

  for (const coin of coins) {
    if (!coinDataMap[coin]) continue;
    const { candles, fundingMap } = coinDataMap[coin];
    const result = simulateAsset(candles, fundingMap, minScore, slBuffer, tpBuffer);
    totalReturnPct += result.returnPct;
    totalTradesCount += result.trades.length;
    allTrades.push(...result.trades);
    console.log(`- ${coin} Return: ${result.returnPct.toFixed(2)}% | Trades: ${result.trades.length}`);
    if (coin === "XRP") {
      console.log("XRP First 3 Trades:", JSON.stringify(result.trades.slice(0, 3), null, 2));
    }
  }

  const avgReturn = totalReturnPct / coins.length;
  const winTrades = allTrades.filter(t => t.returnPct > 0);
  const winRate = allTrades.length > 0 ? (winTrades.length / allTrades.length) * 100 : 0;

  console.log("\n=== Test Results with Optimized Parameters ===");
  console.log(`Average Basket Return: ${avgReturn.toFixed(2)}%`);
  console.log(`Total Trades Executed: ${totalTradesCount}`);
  console.log(`Win Rate: ${winRate.toFixed(2)}%`);
}

runTest().catch(console.error);
