import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

// Re-implement or import the pure strategy helper functions to match api/bot.js

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

function detectAutoDirection(coin) {
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

  if (score > 0) return 'LONG';
  if (score < 0) return 'SHORT';
  return change24h >= 0 ? 'LONG' : 'SHORT';
}

function computeStrategyLevels(coin, dir) {
  const price = coin.price;
  const funding = coin.funding || 0;
  const dec = price < 1 ? 6 : (price < 10 ? 4 : 2);

  // Fallback calculations since we don't have TrueNorth channels/options
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

  // Safety enforcements
  if (dir === 'LONG') {
    const maxSlAllowed = entry * 0.992;
    if (sl > maxSlAllowed) sl = maxSlAllowed;
    const minTpAllowed = entry * 1.01;
    if (tp < minTpAllowed) tp = minTpAllowed;
  } else {
    const minSlAllowed = entry * 1.008;
    if (sl < minSlAllowed) sl = minSlAllowed;
    const maxTpAllowed = entry * 0.99;
    if (tp > maxTpAllowed) tp = maxTpAllowed;
  }

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl: parseFloat(sl.toFixed(dec)),
    tp: parseFloat(tp.toFixed(dec)),
    reason
  };
}

async function runBacktest(coinSymbol, days, minScore) {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  console.log(`\n=== Backtesting Strategy for ${coinSymbol} ===`);
  console.log(`Period: ${days} days`);
  console.log(`Min Score: ${minScore}`);
  console.log("Fetching historical candles and funding rate...");

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
    console.error("Error: Not enough historical candles fetched.");
    return;
  }

  // Fetch funding rate history
  const fundingHistory = await info.fundingHistory({
    coin: coinSymbol,
    startTime,
    endTime
  });

  // Map funding rates by hour timestamp (rounded to the nearest hour)
  const fundingMap = {};
  fundingHistory.forEach(item => {
    const hourTimestamp = Math.floor(item.time / 3600000) * 3600000;
    fundingMap[hourTimestamp] = parseFloat(item.fundingRate);
  });

  console.log(`Fetched ${candles.length} candles, and ${fundingHistory.length} funding rates.`);
  console.log("Simulating hourly steps...");

  // Simulation variables
  const initialBalance = 10000;
  let balance = initialBalance;
  let position = null;
  let pendingOrder = null;
  const trades = [];
  const leverage = 5;
  const roundTripFeePct = 0.0005; // 0.05% total entry + exit fee/slippage
  const entryShiftThreshold = 0.0075; // 0.75% entry shift cancels order

  // Iterate over candles starting from index 24 to have a full 24h rolling window
  for (let i = 24; i < candles.length; i++) {
    const c = candles[i];
    const timestamp = c.t;
    const currentPrice = parseFloat(c.c);
    const low = parseFloat(c.l);
    const high = parseFloat(c.h);

    // 1. Calculate 24h rolling features
    const candle24hAgo = candles[i - 24];
    const prevPrice = parseFloat(candle24hAgo.c) || currentPrice;
    const change = ((currentPrice - prevPrice) / prevPrice) * 100;

    // Rolling 24h high/low/volume
    let high24h = low;
    let low24h = high;
    let volume24hUsd = 0;

    for (let j = i - 24; j <= i; j++) {
      const cj = candles[j];
      const cjHigh = parseFloat(cj.h);
      const cjLow = parseFloat(cj.l);
      if (cjHigh > high24h) high24h = cjHigh;
      if (cjLow < low24h) low24h = cjLow;
      volume24hUsd += parseFloat(cj.v) * parseFloat(cj.c);
    }

    // Get hourly funding rate (multiply by 8 for 8h equivalent, matching bot)
    const hourKey = Math.floor(timestamp / 3600000) * 3600000;
    const fundingRateRaw = fundingMap[hourKey] || 0.0000125; // default 0.01%
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

    // 2. Position Handling
    if (position) {
      // Check if SL or TP is hit
      const isLong = position.dir === 'LONG';
      let hitSl = false;
      let hitTp = false;

      if (isLong) {
        // Breakeven check: if price is up 1.5%, move SL to entry
        if (!position.slMovedToEntry && high >= position.entryPrice * 1.015) {
          position.sl = position.entryPrice;
          position.slMovedToEntry = true;
        }

        // Check SL first for conservative simulation
        if (low <= position.sl) {
          hitSl = true;
        } else if (high >= position.tp) {
          hitTp = true;
        }
      } else { // SHORT
        // Breakeven check: if price is down 1.5%, move SL to entry
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
          entryTime: new Date(position.fillTime).toISOString(),
          exitTime: new Date(timestamp).toISOString(),
          returnPct: netReturn * 100,
          pnlUsd: tradePnl,
          balanceAfter: balance,
          score: position.score
        });

        position = null;
      }
      continue; // Skip setting up new orders while in position
    }

    // 3. Pending Order Handling
    if (pendingOrder) {
      // Check if entry filled
      const isLong = pendingOrder.dir === 'LONG';
      let filled = false;

      if (isLong && low <= pendingOrder.entryPrice) {
        filled = true;
      } else if (!isLong && high >= pendingOrder.entryPrice) {
        filled = true;
      }

      if (filled) {
        position = {
          ...pendingOrder,
          fillTime: timestamp,
          slMovedToEntry: false
        };
        pendingOrder = null;
        
        // Check if the fill candle also immediately triggers SL/TP
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
          
          const leveragedReturn = priceReturn * leverage;
          const netReturn = leveragedReturn - roundTripFeePct;
          const tradePnl = balance * netReturn;

          balance += tradePnl;
          trades.push({
            dir: position.dir,
            entryPrice: position.entryPrice,
            exitPrice,
            exitType: hitSl ? 'SL' : 'TP',
            entryTime: new Date(position.fillTime).toISOString(),
            exitTime: new Date(timestamp).toISOString(),
            returnPct: netReturn * 100,
            pnlUsd: tradePnl,
            balanceAfter: balance,
            score: position.score
          });
          position = null;
        }
      } else {
        // Cancel/trail order logic
        const direction = detectAutoDirection(coinData);
        const levels = computeStrategyLevels(coinData, direction);
        const entryDiffPct = Math.abs(pendingOrder.entryPrice - levels.entry) / levels.entry;

        if (score < minScore) {
          // Cancel order because setup is no longer high scoring
          pendingOrder = null;
        } else if (entryDiffPct >= entryShiftThreshold) {
          // Trail: Replace pending order with new levels
          pendingOrder = {
            dir: direction,
            entryPrice: levels.entry,
            tp: levels.tp,
            sl: levels.sl,
            score,
            setupTime: timestamp
          };
        }
      }
    } else {
      // 4. Place new order if score is high enough
      if (score >= minScore) {
        const direction = detectAutoDirection(coinData);
        const levels = computeStrategyLevels(coinData, direction);

        pendingOrder = {
          dir: direction,
          entryPrice: levels.entry,
          tp: levels.tp,
          sl: levels.sl,
          score,
          setupTime: timestamp
        };
      }
    }
  }

  // Backtest report
  console.log("\n=== Backtest Complete ===");
  if (trades.length === 0) {
    console.log("No trades executed during the backtest window.");
    return;
  }

  const winTrades = trades.filter(t => t.pnlUsd > 0);
  const lossTrades = trades.filter(t => t.pnlUsd <= 0);
  const winRate = (winTrades.length / trades.length) * 100;
  
  const totalReturnPct = ((balance - initialBalance) / initialBalance) * 100;

  // Calculate drawdown
  let peak = initialBalance;
  let maxDrawdown = 0;
  trades.forEach(t => {
    if (t.balanceAfter > peak) {
      peak = t.balanceAfter;
    }
    const dd = (peak - t.balanceAfter) / peak * 100;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
    }
  });

  // Calculate profit factor
  const grossProfit = winTrades.reduce((sum, t) => sum + t.pnlUsd, 0);
  const grossLoss = Math.abs(lossTrades.reduce((sum, t) => sum + t.pnlUsd, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : grossProfit;

  console.table(trades.map(t => ({
    Dir: t.dir,
    Entry: t.entryPrice,
    Exit: t.exitPrice,
    Outcome: t.exitType,
    "Net PnL %": t.returnPct.toFixed(2) + "%",
    "PnL ($)": "$" + t.pnlUsd.toFixed(2),
    "Balance": "$" + t.balanceAfter.toFixed(2)
  })));

  console.log("\nSummary Statistics:");
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Win Rate: ${winRate.toFixed(2)}% (${winTrades.length} W / ${lossTrades.length} L)`);
  console.log(`Total Return: ${totalReturnPct.toFixed(2)}% (Final Balance: $${balance.toFixed(2)})`);
  console.log(`Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`Profit Factor: ${profitFactor.toFixed(2)}`);
}

// Extract CLI arguments
const args = process.argv.slice(2);
const coin = args[0] || "BTC";
const days = parseInt(args[1]) || 30;
const minScore = parseInt(args[2]) || 85;

runBacktest(coin, days, minScore).catch(e => {
  console.error("Backtest failed:", e.message);
});
