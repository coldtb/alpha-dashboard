import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import fs from "fs";
import path from "path";

let config = {
  minScore: 85,
  minSlBuffer: 0.012,
  minTpBuffer: 0.024,
  entryShiftThreshold: 0.0075,
  replacementScoreDiff: 5
};

try {
  const configPath = path.join(process.cwd(), 'api', 'config.json');
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    config = { ...config, ...JSON.parse(rawConfig) };
    console.log("Loaded config.json in backtest handler:", config);
  }
} catch (e) {
  console.warn("Failed to load config.json in backtest, using defaults:", e.message);
}

function calculateScore(coin, isHyperliquidScale = true) {
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
  if (isHyperliquidScale) {
    if (vol > 30000000) score += 20;
    else if (vol > 15000000) score += 15;
    else if (vol > 5000000) score += 10;
  } else {
    if (vol > 100000000) score += 20;
    else if (vol > 50000000) score += 15;
    else if (vol > 10000000) score += 10;
  }

  const watchlist = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];
  if (watchlist.includes(coin.symbol)) {
    score += 15;
  }
  return Math.min(score, 100);
}

function detectAutoDirection(coin, sma24 = null) {
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
  if (sma24 !== null) {
    const price = coin.price;
    if (dir === 'LONG' && price < sma24) {
      return 'SKIP'; // Filter out counter-trend longs
    }
    if (dir === 'SHORT' && price > sma24) {
      return 'SKIP'; // Filter out counter-trend shorts
    }
  }

  return dir;
}

function computeStrategyLevels(coin, dir, slBuffer = null, tpBuffer = null) {
  const price = coin.price;
  const funding = coin.funding || 0;
  const dec = price < 1 ? 6 : (price < 10 ? 4 : 2);

  let high = coin.high || price * 1.03;
  let low  = coin.low  || price * 0.97;
  let vwap = (high + low + price) / 3;

  let entry = price;
  let sl = dir === 'LONG' ? price * 0.97 : price * 1.03;
  let tp = dir === 'LONG' ? price * 1.06 : price * 0.94;
  let reason = 'fib_fallback';

  if (dir === 'LONG') {
    entry = high - (high - low) * 0.618;
    sl = low * 0.985;

    if (coin.score >= 90) {
      const shallowEntry = price * 0.997;
      if (shallowEntry > entry) {
        entry = shallowEntry;
        reason += '+shallow_entry_high_score';
      }
    }

    const minTp = entry + (entry - sl) * 1.5;
    tp = vwap > minTp ? vwap : entry + (entry - sl) * 2;

    if (funding < -0.0005) {
      entry = price;
      reason += '+squeeze_entry';
    }
  } else {
    entry = high - (high - low) * 0.382;
    sl = high * 1.015;

    if (coin.score >= 90) {
      const shallowEntry = price * 1.003;
      if (shallowEntry < entry) {
        entry = shallowEntry;
        reason += '+shallow_entry_high_score';
      }
    }

    const minTp = entry - (sl - entry) * 1.5;
    tp = vwap < minTp ? vwap : entry - (sl - entry) * 2;

    if (funding > 0.001) {
      entry = price;
      reason += '+overextended_long';
    }
  }

  // Safety bounds
  const activeSlBuffer = slBuffer !== null ? slBuffer : config.minSlBuffer;
  const activeTpBuffer = tpBuffer !== null ? tpBuffer : config.minTpBuffer;

  if (dir === 'LONG') {
    const maxSlAllowed = entry * (1 - activeSlBuffer);
    if (sl > maxSlAllowed) sl = maxSlAllowed;
    const minTpAllowed = entry * (1 + activeTpBuffer);
    if (tp < minTpAllowed) tp = minTpAllowed;
  } else {
    const minSlAllowed = entry * (1 + activeSlBuffer);
    if (sl < minSlAllowed) sl = minSlAllowed;
    const maxTpAllowed = entry * (1 - activeTpBuffer);
    if (tp > maxTpAllowed) tp = maxTpAllowed;
  }

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl: parseFloat(sl.toFixed(dec)),
    tp: parseFloat(tp.toFixed(dec)),
    reason
  };
}

export default async function handler(req, res) {
  const coinSymbol = req.query.coin || "BTC";
  const days = parseInt(req.query.days) || 30;
  const minScore = parseInt(req.query.min_score) || config.minScore;
  const qSlBuffer = req.query.sl_buffer ? parseFloat(req.query.sl_buffer) : config.minSlBuffer;
  const qTpBuffer = req.query.tp_buffer ? parseFloat(req.query.tp_buffer) : config.minTpBuffer;

  try {
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });

    const endTime = Date.now();
    const startTime = endTime - days * 24 * 60 * 60 * 1000;

    // Fetch candles
    const candles = await info.candleSnapshot({
      coin: coinSymbol,
      interval: "1h",
      startTime,
      endTime
    });

    if (candles.length < 25) {
      return res.status(400).json({ error: `Not enough historical candles found for ${coinSymbol}.` });
    }

    // Fetch funding rate history in chunks to avoid API limit truncation
    const fundingHistory = [];
    const chunkMs = 150 * 24 * 60 * 60 * 1000;
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

    // Map funding rates by hour timestamp
    const fundingMap = {};
    fundingHistory.forEach(item => {
      const hourTimestamp = Math.floor(item.time / 3600000) * 3600000;
      fundingMap[hourTimestamp] = parseFloat(item.fundingRate);
    });

    // Simulation variables
    const initialBalance = 10000;
    let balance = initialBalance;
    let position = null;
    let pendingOrder = null;
    const trades = [];
    const leverage = 5;
    const roundTripFeePct = 0.0005; 
    const entryShiftThreshold = 0.0075;

    // Daily equity tracking for chart
    const dailyBalances = [{ time: startTime, balance: initialBalance }];
    let lastLoggedDay = Math.floor(startTime / 86400000);

    for (let i = 24; i < candles.length; i++) {
      const c = candles[i];
      const timestamp = c.t;
      const currentPrice = parseFloat(c.c);
      const low = parseFloat(c.l);
      const high = parseFloat(c.h);

      // Track daily balance point
      const currentDay = Math.floor(timestamp / 86400000);
      if (currentDay > lastLoggedDay) {
        dailyBalances.push({ time: timestamp, balance });
        lastLoggedDay = currentDay;
      }

      // Calculate 24h rolling features
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
        symbol: coinSymbol,
        price: currentPrice,
        change,
        volume: volume24hUsd,
        funding,
        high: high24h,
        low: low24h
      };

      const score = calculateScore(coinData, true);

      // Position Handling
      if (position) {
        const isLong = position.dir === 'LONG';
        let hitSl = false;
        let hitTp = false;

        if (isLong) {
          if (!position.slMovedToEntry && high >= position.entryPrice * 1.015) {
            position.sl = position.entryPrice;
            position.slMovedToEntry = true;
          }

          if (low <= position.sl) {
            hitSl = true;
          } else if (high >= position.tp) {
            hitTp = true;
          }
        } else {
          if (!position.slMovedToEntry && low <= position.entryPrice * 0.985) {
            position.sl = position.entryPrice;
            position.slMovedToEntry = true;
          }

          if (high >= position.sl) {
            hitSl = true;
          } else if (low <= position.tp) {
            hitTp = true;
          }
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
            returnPct: parseFloat((netReturn * 100).toFixed(2)),
            pnlUsd: parseFloat(tradePnl.toFixed(2)),
            balanceAfter: parseFloat(balance.toFixed(2)),
            score: position.score
          });

          position = null;
        }
        continue;
      }

      // No position: Enter instantly at market price if score is high and trend matches
      if (score >= minScore) {
        const direction = detectAutoDirection(coinData, sma24);
        if (direction !== 'SKIP') {
          const levels = computeStrategyLevels(coinData, direction, qSlBuffer, qTpBuffer);
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

    // Push final balance point if not already added
    if (dailyBalances[dailyBalances.length - 1].time !== candles[candles.length - 1].t) {
      dailyBalances.push({ time: candles[candles.length - 1].t, balance });
    }

    // Summary calculations
    const winTrades = trades.filter(t => t.pnlUsd > 0);
    const lossTrades = trades.filter(t => t.pnlUsd <= 0);
    const winRate = trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0;
    const totalReturnPct = ((balance - initialBalance) / initialBalance) * 100;

    let peak = initialBalance;
    let maxDrawdown = 0;
    trades.forEach(t => {
      if (t.balanceAfter > peak) peak = t.balanceAfter;
      const dd = (peak - t.balanceAfter) / peak * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    });

    const grossProfit = winTrades.reduce((sum, t) => sum + t.pnlUsd, 0);
    const grossLoss = Math.abs(lossTrades.reduce((sum, t) => sum + t.pnlUsd, 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : grossProfit;

    // Save to history file
    try {
      const historyPath = path.join(process.cwd(), "scratch", "backtest-history.json");
      let history = [];
      if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, "utf8") || "[]");
      }
      history.push({
        timestamp: new Date().toISOString(),
        coin: coinSymbol,
        days,
        minScore,
        summary: {
          totalTrades: trades.length,
          winRate: parseFloat(winRate.toFixed(2)),
          wins: winTrades.length,
          losses: lossTrades.length,
          totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
          finalBalance: parseFloat(balance.toFixed(2)),
          maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
          profitFactor: parseFloat(profitFactor.toFixed(2))
        }
      });
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
      console.log(`Saved backtest results to history log: ${historyPath}`);
    } catch (e) {
      console.warn("Failed to save backtest history log:", e.message);
    }

    return res.status(200).json({
      status: "success",
      coin: coinSymbol,
      days,
      minScore,
      summary: {
        totalTrades: trades.length,
        winRate: parseFloat(winRate.toFixed(2)),
        wins: winTrades.length,
        losses: lossTrades.length,
        totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
        finalBalance: parseFloat(balance.toFixed(2)),
        maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(2))
      },
      trades,
      equityCurve: dailyBalances
    });

  } catch (e) {
    console.error("Backtest API error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
