import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Strategy scoring and direction detection matching api/bot.js
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

function computeStrategyLevels(coin, dir, slBuffer, tpBuffer) {
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

    if (funding < -0.0005) {
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

    if (funding > 0.001) {
      entry = price;
    }
  }

  // Safety enforcements using dynamic buffers
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

// Simulates trading a coin under a specific parameter set
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

    for (let j = i - 24; j <= i; j++) {
      const cj = candles[j];
      const cjHigh = parseFloat(cj.h);
      const cjLow = parseFloat(cj.l);
      if (cjHigh > high24h) high24h = cjHigh;
      if (cjLow < low24h) low24h = cjLow;
      volume24hUsd += parseFloat(cj.v) * parseFloat(cj.c);
    }

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

    const score = calculateScore(coinData, true);

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

    // Pending Order check
    if (pendingOrder) {
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
      } else {
        const direction = detectAutoDirection(coinData);
        const levels = computeStrategyLevels(coinData, direction, slBuffer, tpBuffer);
        const entryDiffPct = Math.abs(pendingOrder.entryPrice - levels.entry) / levels.entry;

        if (score < minScore) {
          pendingOrder = null;
        } else if (entryDiffPct >= entryShiftThreshold) {
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
      if (score >= minScore) {
        const direction = detectAutoDirection(coinData);
        const levels = computeStrategyLevels(coinData, direction, slBuffer, tpBuffer);

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

  return {
    trades,
    finalBalance: balance,
    returnPct: ((balance - initialBalance) / initialBalance) * 100
  };
}

async function runOptimization() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  console.log("=== Strategy Parameter Optimizer Initiated ===");
  
  const coins = ["BTC", "ETH", "SOL", "HYPE"];
  const days = 14; // Optimize over last 14 days
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  console.log(`Fetching historical 1h data for basket: ${coins.join(", ")}`);
  
  const coinDataMap = {};
  for (const coin of coins) {
    try {
      const candles = await info.candleSnapshot({ coin, interval: "1h", startTime, endTime });
      const fundingHistory = await info.fundingHistory({ coin, startTime, endTime });
      const fundingMap = {};
      fundingHistory.forEach(item => {
        const hourTimestamp = Math.floor(item.time / 3600000) * 3600000;
        fundingMap[hourTimestamp] = parseFloat(item.fundingRate);
      });
      coinDataMap[coin] = { candles, fundingMap };
      console.log(`- Fetched ${candles.length} candles for ${coin}`);
    } catch (e) {
      console.error(`Failed to fetch history for ${coin}:`, e.message);
    }
  }

  // Optimization Grid
  const gridMinScore = [80, 85, 90];
  const gridSlBuffer = [0.006, 0.008, 0.012]; // 0.6%, 0.8%, 1.2%
  const gridTpBuffer = [0.010, 0.015, 0.020]; // 1.0%, 1.5%, 2.0%

  console.log("\nRunning Grid Search over parameter space...");
  
  let bestParams = null;
  let bestAvgReturn = -Infinity;
  let bestGridRuns = [];

  for (const minScore of gridMinScore) {
    for (const slBuffer of gridSlBuffer) {
      for (const tpBuffer of gridTpBuffer) {
        let totalReturnPct = 0;
        let totalTradesCount = 0;
        let allTrades = [];

        for (const coin of coins) {
          if (!coinDataMap[coin]) continue;
          const { candles, fundingMap } = coinDataMap[coin];
          const result = simulateAsset(candles, fundingMap, minScore, slBuffer, tpBuffer);
          totalReturnPct += result.returnPct;
          totalTradesCount += result.trades.length;
          allTrades = allTrades.concat(result.trades);
        }

        const avgReturn = totalReturnPct / coins.length;

        bestGridRuns.push({
          minScore,
          slBuffer,
          tpBuffer,
          avgReturn: parseFloat(avgReturn.toFixed(2)),
          tradesCount: totalTradesCount,
          allTrades
        });

        if (avgReturn > bestAvgReturn && totalTradesCount > 0) {
          bestAvgReturn = avgReturn;
          bestParams = { minScore, slBuffer, tpBuffer, allTrades, avgReturn };
        }
      }
    }
  }

  // Print grid runs table (top 10 runs)
  bestGridRuns.sort((a, b) => b.avgReturn - a.avgReturn);
  console.log("\nTop 10 Parameter Configurations:");
  console.table(bestGridRuns.slice(0, 10).map(r => ({
    "Min Score": r.minScore,
    "SL Buffer %": (r.slBuffer * 100).toFixed(1) + "%",
    "TP Buffer %": (r.tpBuffer * 100).toFixed(1) + "%",
    "Avg Basket Return %": r.avgReturn.toFixed(2) + "%",
    "Total Trades": r.tradesCount
  })));

  if (!bestParams) {
    console.error("Optimization failed: No parameter configurations triggered any trades.");
    return;
  }

  console.log(`\n🏆 Optimal Parameter Set Found:`);
  console.log(`- Min Score: ${bestParams.minScore}`);
  console.log(`- Min Stop Loss Buffer: ${(bestParams.slBuffer * 100).toFixed(2)}%`);
  console.log(`- Min Take Profit Buffer: ${(bestParams.tpBuffer * 100).toFixed(2)}%`);
  console.log(`- Average Basket Return: ${bestParams.avgReturn.toFixed(2)}%`);

  // Level 2: Diagnostics & Feedback Analysis
  const trades = bestParams.allTrades;
  const longTrades = trades.filter(t => t.dir === 'LONG');
  const shortTrades = trades.filter(t => t.dir === 'SHORT');

  const winTrades = trades.filter(t => t.returnPct > 0);
  const lossTrades = trades.filter(t => t.returnPct <= 0);
  const overallWinRate = trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0;

  const longWinTrades = longTrades.filter(t => t.returnPct > 0);
  const longWinRate = longTrades.length > 0 ? (longWinTrades.length / longTrades.length) * 100 : 0;

  const shortWinTrades = shortTrades.filter(t => t.returnPct > 0);
  const shortWinRate = shortTrades.length > 0 ? (shortWinTrades.length / shortTrades.length) * 100 : 0;

  // Average trade duration in hours
  let totalDurationHours = 0;
  trades.forEach(t => {
    totalDurationHours += (t.exitTime - t.entryTime) / 3600000;
  });
  const avgDuration = trades.length > 0 ? (totalDurationHours / trades.length) : 0;

  // Diagnostic rules engine
  const diagnosticNotes = [];
  if (longTrades.length > 0 && shortTrades.length > 0) {
    const wrDiff = longWinRate - shortWinRate;
    if (Math.abs(wrDiff) > 20) {
      const betterDir = longWinRate > shortWinRate ? 'LONG' : 'SHORT';
      const worseDir = longWinRate > shortWinRate ? 'SHORT' : 'LONG';
      diagnosticNotes.push(`[DIAGNOSTIC] Directional Bias: ${betterDir} winrate (${(betterDir === 'LONG' ? longWinRate : shortWinRate).toFixed(1)}%) is significantly outperforming ${worseDir} winrate (${(worseDir === 'LONG' ? longWinRate : shortWinRate).toFixed(1)}%). Recommended Action: Tighten filters or disable entry on ${worseDir} signals.`);
    }
  }

  // Quick Stop Loss hit diagnosis
  const quickSlTrades = trades.filter(t => t.exitType === 'SL' && ((t.exitTime - t.entryTime) / 3600000) <= 2);
  const quickSlPct = trades.filter(t => t.exitType === 'SL').length > 0 ? (quickSlTrades.length / trades.filter(t => t.exitType === 'SL').length) * 100 : 0;
  if (quickSlPct > 40) {
    diagnosticNotes.push(`[DIAGNOSTIC] Stop Out Volatility: ${quickSlPct.toFixed(1)}% of stopped out trades hit SL within 2 hours of entry. Recommended Action: Increase Stop Loss safety cushion (SL Buffer) or increase entry pullback threshold to avoid immediate stop outs.`);
  }

  const diagnosticsReport = `=== Strategy Diagnostics & Feedback Report ===
Generated: ${new Date().toISOString()}
Data Period: Last ${days} days
Optimized parameter: MinScore=${bestParams.minScore}, SLBuffer=${bestParams.slBuffer}, TPBuffer=${bestParams.tpBuffer}

Performance Metrics:
- Total Simulated Trades: ${trades.length}
- Overall Win Rate: ${overallWinRate.toFixed(2)}%
- LONG Trades: ${longTrades.length} (Win Rate: ${longWinRate.toFixed(2)}%)
- SHORT Trades: ${shortTrades.length} (Win Rate: ${shortWinRate.toFixed(2)}%)
- Average Trade Duration: ${avgDuration.toFixed(1)} hours

Diagnostic Findings & Recommendations:
${diagnosticNotes.length > 0 ? diagnosticNotes.map(n => "- " + n).join("\n") : "- No critical performance anomalies found. Strategy parameters are balanced."}

AI REFACTOR PROMPT FOR ANTIGRAVITY (Level 3):
"You are pair programming to optimize a trading bot. Based on the last 14 days backtest diagnostics of BTC, ETH, SOL, HYPE:
- Optimal MinScore is ${bestParams.minScore}
- Optimal SL Buffer is ${(bestParams.slBuffer*100).toFixed(2)}%
- Optimal TP Buffer is ${(bestParams.tpBuffer*100).toFixed(2)}%
- LONG Win Rate: ${longWinRate.toFixed(1)}% | SHORT Win Rate: ${shortWinRate.toFixed(1)}%
- SL Volatility: ${quickSlPct.toFixed(1)}% of SLs hit within 2 hours.
Please refactor api/bot.js to implement logic that optimizes these findings, such as adding a trend-following check (e.g. moving average) to filter out ${longWinRate < shortWinRate ? 'LONG' : 'SHORT'} setups since their winrate is low, or dynamic SL sizing based on ATR."
`;

  console.log("\n" + diagnosticsReport);

  // Write reports
  const reportPath = path.join(process.cwd(), "scratch", "diagnostic-report.txt");
  fs.writeFileSync(reportPath, diagnosticsReport);
  console.log(`Saved diagnostics report to: ${reportPath}`);

  // Level 3: Dynamic Config Writing
  const configPath = path.join(process.cwd(), "api", "config.json");
  const currentConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  
  const newConfig = {
    ...currentConfig,
    minScore: bestParams.minScore,
    minSlBuffer: bestParams.slBuffer,
    minTpBuffer: bestParams.tpBuffer
  };

  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
  console.log(`Saved optimized parameters to config file: ${configPath}`);

  // GitOps auto deployment
  try {
    console.log("\nExecuting GitOps auto deployment...");
    execSync("git add api/config.json", { stdio: "inherit" });
    execSync('git commit -m "chore: auto-optimize bot parameters [auto-tuning]"', { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("🚀 GitOps push successful! Vercel will auto-deploy the new parameters.");
  } catch (gitErr) {
    console.warn("GitOps auto-push skipped or failed. Run git push manually to deploy new config:", gitErr.message);
  }
}

runOptimization().catch(e => {
  console.error("Optimization failed:", e.message);
});
