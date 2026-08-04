import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import fs from "fs";
import path from "path";

let config = {
  minScore: 85,
  minSlBuffer: 0.010,
  minTpBuffer: 0.005,
  entryShiftThreshold: 0.0075,
  replacementScoreDiff: 10,
  positionSizeFactor: 0.95
};

try {
  const configPath = path.join(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    config = { ...config, ...JSON.parse(rawConfig) };
    console.log("Loaded config.json in backtest handler:", config);
  }
} catch (e) {
  console.warn("Failed to load config.json in backtest, using defaults:", e.message);
}

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

  const watchlist = config.watchlist || ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD", "SUI"];
  if (watchlist.includes(coin.symbol) || coin.symbol === 'BTC') {
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
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;

  if (symbol === 'HYPE') {
    if (sma24 === null) return 'SKIP';
    return coin.price >= sma24 ? 'LONG' : 'SHORT';
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
    if (dir === 'LONG' && coin.price < smaTrend) return 'SKIP';
    if (dir === 'SHORT' && coin.price > smaTrend) return 'SKIP';
  }

  if (sma24 !== null) {
    const price = coin.price;
    const maxDistancePct = config.maxDistancePct !== undefined ? config.maxDistancePct : 0.05;
    if (dir === 'LONG') {
      if (price < sma24 || price > sma24 * (1 + maxDistancePct)) return 'SKIP';
    }
    if (dir === 'SHORT') {
      if (price > sma24 || price < sma24 * (1 - maxDistancePct)) return 'SKIP';
    }
  }
  return dir;
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

export default async function handler(req, res) {
  let coinSymbol = req.query.coin || "BTC";
  if (coinSymbol.startsWith("1000")) {
    coinSymbol = "k" + coinSymbol.slice(4);
  }
  const days = parseInt(req.query.days) || 30;
  let minScore = coinSymbol === 'BTC' ? 40 : (parseInt(req.query.min_score) || config.minScore);
  const initialBalance = req.query.initial_balance ? parseFloat(req.query.initial_balance) : 10000;

  try {
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });

    const endTime = req.query.end_time ? parseInt(req.query.end_time) : Date.now();
    const startTime = req.query.start_time ? parseInt(req.query.start_time) : (endTime - days * 24 * 60 * 60 * 1000);

    // Fetch candles in chunks of 150 days to avoid the 5000-candle limit
    const candles = [];
    const candleChunkMs = 150 * 24 * 60 * 60 * 1000;
    let candleStart = startTime - 200 * 3600000; // start early for SMAs
    while (candleStart < endTime) {
      const candleEnd = Math.min(candleStart + candleChunkMs, endTime);
      const chunk = await info.candleSnapshot({
        coin: coinSymbol,
        interval: "1h",
        startTime: candleStart,
        endTime: candleEnd
      });
      if (chunk && chunk.length > 0) {
        chunk.forEach(c => {
          if (candles.length === 0 || c.t > candles[candles.length - 1].t) {
            candles.push(c);
          }
        });
      }
      candleStart += candleChunkMs;
    }

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

    // Simulation parameters
    const spreadMap = {
      "BTC": 0.0001,
      "ETH": 0.0002,
      "SOL": 0.0003,
      "HYPE": 0.0004,
      "XRP": 0.0004,
      "SUI": 0.0004
    };
    
    let balance = initialBalance;
    let position = null;
    let pendingOrder = null;
    const trades = [];
    const leverage = 5;
    const roundTripFeePct = 0.0008; 

    // Live Bot parameters:
    const coinParams = {
      BTC:  { tpCap: 0.02,   slCap: 0.015, trendPeriod: 200 },
      XRP:  { tpCap: 0.0075, slCap: 0.015, trendPeriod: 50  },
      SUI:  { tpCap: 0.0075, slCap: 0.015, trendPeriod: 200 },
      HYPE: { tpCap: 0.0075, slCap: 0.015, trendPeriod: 24  },
    };
    const params = coinParams[coinSymbol] || { tpCap: 0.01, slCap: 0.015, trendPeriod: 24 };

    // Daily equity tracking for chart
    const dailyBalances = [];
    let lastLoggedDay = 0;

    const startSimIdx = candles.findIndex(c => c.t >= startTime);
    const warmupIdx = startSimIdx === -1 ? 200 : startSimIdx;

    for (let i = warmupIdx; i < candles.length; i++) {
      const c = candles[i];
      const timestamp = c.t;
      const currentPrice = parseFloat(c.c);
      const low = parseFloat(c.l);
      const high = parseFloat(c.h);

      // Track daily balance point
      const currentDay = Math.floor(timestamp / 86400000);
      if (currentDay > lastLoggedDay) {
        dailyBalances.push({ time: timestamp, balance: parseFloat(balance.toFixed(2)) });
        lastLoggedDay = currentDay;
      }

      // Calculate 24h rolling features
      const candle24hAgo = candles[i - 24];
      const prevPrice = candle24hAgo ? parseFloat(candle24hAgo.c) : currentPrice;
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
      for (let j = i - params.trendPeriod; j <= i; j++) {
        if (candles[j]) sumTrend += parseFloat(candles[j].c);
      }
      const smaTrend = sumTrend / (params.trendPeriod + 1);

      const volatility24h = (high24h - low24h) / low24h;

      const hourKey = Math.floor(timestamp / 3600000) * 3600000;
      const fundingRateRaw = fundingMap[hourKey] || 0.0000125; 
      const funding = fundingRateRaw * 3;

      const coinData = {
        symbol: coinSymbol,
        price: currentPrice,
        change,
        volume: volume24hUsd,
        funding,
        high: high24h,
        low: low24h
      };

      const score = calculateScore(coinData);
      const direction = detectAutoDirection(coinData, sma24, smaTrend);

      // Position Handling
      if (position) {
        const isLong = position.dir === 'LONG';
        let hitSl = false;
        let hitTp = false;
        let exitReason = 'SL';

        const currentProfitPct = isLong
          ? (currentPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - currentPrice) / position.entryPrice;

        // 1. Trailing Activation Check:
        // Generalized isNearTp: true only if price has completed >= 85% of entry-to-TP distance
        const totalTpDistance = Math.abs(position.initialTp - position.entryPrice);
        const currentTpDistance = Math.abs(currentPrice - position.entryPrice);
        const isNearTp = totalTpDistance > 0 && currentTpDistance >= totalTpDistance * 0.85 && (isLong ? currentPrice > position.entryPrice : currentPrice < position.entryPrice);

        if (!position.trailed && isNearTp) {
          position.trailed = true;
          position.sl = position.initialTp; // Lock in Stop Loss at original TP
          position.tp = isLong ? currentPrice * 1.02 : currentPrice * 0.98; // Trail TP by 2%
          position.marginScale = 1.5; // Simulate 0.5x Pyramiding
          position.entryPrice = (position.entryPrice * 1.0 + currentPrice * 0.5) / 1.5; // Update average entry price
        }

        // 2. Standard breakeven if trailing is disabled or not yet triggered
        if (!position.trailed) {
          const beTrigger = 0.015;
          if (!position.slMovedToEntry && currentProfitPct >= beTrigger) {
            position.sl = position.entryPrice;
            position.slMovedToEntry = true;
          }
        }

        // 3. Check SL/TP triggers
        if (isLong) {
          if (low <= position.sl) {
            hitSl = true;
            exitReason = position.trailed ? 'TRAILING_SL' : (position.slMovedToEntry ? 'BE' : 'SL');
          } else if (high >= position.tp) {
            hitTp = true;
            exitReason = position.trailed ? 'TRAILING_TP' : 'TP';
          }
        } else {
          if (high >= position.sl) {
            hitSl = true;
            exitReason = position.trailed ? 'TRAILING_SL' : (position.slMovedToEntry ? 'BE' : 'SL');
          } else if (low <= position.tp) {
            hitTp = true;
            exitReason = position.trailed ? 'TRAILING_TP' : 'TP';
          }
        }

        // 24h Max hold force close
        const durationHours = Math.round((timestamp - position.fillTime) / 3600000);
        if (!hitSl && !hitTp && durationHours >= 24) {
          hitSl = true;
          exitReason = 'TIMEOUT';
        }

        if (hitSl || hitTp) {
          let exitPrice = position.sl;
          if (hitTp) {
            exitPrice = position.tp;
          } else if (exitReason === 'TIMEOUT') {
            exitPrice = currentPrice;
          } else {
            // Honest Fill adjustment:
            if (isLong && exitPrice > currentPrice) {
              exitPrice = currentPrice;
            } else if (!isLong && exitPrice < currentPrice) {
              exitPrice = currentPrice;
            }
          }

          const priceReturn = isLong 
            ? (exitPrice - position.entryPrice) / position.entryPrice
            : (position.entryPrice - exitPrice) / position.entryPrice;

          // Calculate Hourly Funding Fee impact
          let totalFundingReturn = 0;
          for (let h = position.fillTime + 3600000; h <= timestamp; h += 3600000) {
            const hFundingRate = fundingMap[Math.floor(h / 3600000) * 3600000] || 0.0000125;
            totalFundingReturn += (isLong ? -hFundingRate : hFundingRate) * leverage;
          }

          const netReturn = priceReturn * leverage + totalFundingReturn - roundTripFeePct;
          const scale = position.marginScale || 1.0;
          
          // Position size factor 0.95 capped to 50k max compounding
          const baseSizeFactor = config.positionSizeFactor !== undefined ? config.positionSizeFactor : 0.95;
          const activeMargin = Math.min(balance * baseSizeFactor, 50000) * scale;
          const tradePnl = activeMargin * netReturn;

          balance += tradePnl;
          trades.push({
            dir: position.dir,
            entryPrice: position.entryPrice,
            exitPrice: exitPrice,
            exitType: exitReason,
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

      // Check pending limit order execution
      if (pendingOrder) {
        const isLong = pendingOrder.dir === 'LONG';
        let filled = false;
        
        if (isLong) {
          if (low <= pendingOrder.entryPrice) {
            filled = true;
          }
        } else {
          if (high >= pendingOrder.entryPrice) {
            filled = true;
          }
        }

        if (filled) {
          position = {
            dir: pendingOrder.dir,
            entryPrice: pendingOrder.entryPrice,
            initialTp: pendingOrder.tp,
            tp: pendingOrder.tp,
            sl: pendingOrder.sl,
            score: pendingOrder.score,
            fillTime: timestamp,
            slMovedToEntry: false,
            trailed: false,
            marginScale: 1.0
          };
          pendingOrder = null;
          continue; 
        }

        // Cancel pending order if score drops below minScore or direction shifts to SKIP
        if (score < minScore || direction === 'SKIP') {
          pendingOrder = null;
        }
      }

      // No active position: Evaluate new signals to set/update pending limit order
      if (!position) {
        if (score >= minScore && direction !== 'SKIP') {
          // SHORT Trend Block
          if (direction === 'SHORT' && smaTrend !== null && currentPrice > smaTrend) {
            continue;
          }

          let slCap = params.slCap;
          if (direction === 'SHORT') {
            slCap = 0.015;
          }

          const pivotLevels = calculatePivotLevels(high24h, low24h, currentPrice);
          const levels = computeStrategyLevels(coinData, direction, pivotLevels, params, slCap);

          const spreadPct = spreadMap[coinSymbol] || 0.0004;
          const slippagePct = Math.max(0.0002, volatility24h * 0.02);

          let entryFinal = levels.entry;
          let volShift = 0;
          if (volatility24h > 0.035) {
            volShift = 0.005;
          }

          if (direction === 'LONG') {
            entryFinal *= (1 + spreadPct / 2 + slippagePct - volShift);
          } else {
            entryFinal *= (1 - spreadPct / 2 - slippagePct + volShift);
          }

          pendingOrder = {
            dir: direction,
            entryPrice: entryFinal,
            tp: levels.tp,
            sl: levels.sl,
            score: score
          };

          // Check if it can be filled in the same hour it is placed
          const isLong = direction === 'LONG';
          let filled = false;
          if (isLong) {
            if (low <= entryFinal) filled = true;
          } else {
            if (high >= entryFinal) filled = true;
          }

          if (filled) {
            position = {
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
            pendingOrder = null;
          }
        }
      }
    }

    // Push final balance point
    if (candles.length > 0 && (dailyBalances.length === 0 || dailyBalances[dailyBalances.length - 1].time !== candles[candles.length - 1].t)) {
      dailyBalances.push({ time: candles[candles.length - 1].t, balance: parseFloat(balance.toFixed(2)) });
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
