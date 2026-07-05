import handler from "../api/backtest.js";

function runBacktestForXRP() {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin: "XRP",
        days: "365",
        min_score: "90"
      }
    };

    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        if (statusCode !== 200) {
          reject(new Error(data.error || "Unknown error"));
        } else {
          resolve(data);
        }
        return this;
      }
    };

    handler(req, res).catch(reject);
  });
}

async function analyze() {
  console.log("Analyzing XRP 365 Days Backtest to find peak profits and peak equity...");
  const data = await runBacktestForXRP();
  const trades = data.trades;
  const equityCurve = data.equityCurve;

  if (!trades || trades.length === 0) {
    console.log("No trades found to analyze.");
    return;
  }

  // 1. Find the single trade with the highest profit
  let bestTrade = trades[0];
  trades.forEach(t => {
    if (t.pnlUsd > bestTrade.pnlUsd) {
      bestTrade = t;
    }
  });

  // 2. Find the peak of the equity curve
  let peakPoint = equityCurve[0];
  equityCurve.forEach(p => {
    if (p.balance > peakPoint.balance) {
      peakPoint = p;
    }
  });

  console.log("\n=== XRP Backtest Peak Analysis ===");
  
  console.log("\n1. SINGLE HIGHEST PROFIT TRADE:");
  console.log(`- Direction: ${bestTrade.dir}`);
  console.log(`- Entry Time: ${new Date(bestTrade.entryTime).toISOString()}`);
  console.log(`- Exit Time: ${new Date(bestTrade.exitTime).toISOString()}`);
  console.log(`- Entry Price: $${bestTrade.entryPrice}`);
  console.log(`- Exit Price: $${bestTrade.exitPrice}`);
  console.log(`- Exit Type: ${bestTrade.exitType}`);
  console.log(`- Return Percentage: ${bestTrade.returnPct}%`);
  console.log(`- Profit in USD: $${bestTrade.pnlUsd}`);
  console.log(`- Account Balance after trade: $${bestTrade.balanceAfter}`);

  console.log("\n2. ACCOUNT BALANCES OVERALL PEAK POINT (EQUITY PEAK):");
  console.log(`- Peak Account Balance: $${peakPoint.balance.toFixed(2)}`);
  console.log(`- Peak Time: ${new Date(peakPoint.time).toISOString()}`);
  console.log(`- Growth from initial $10,000: +${((peakPoint.balance - 10000)/10000 * 100).toFixed(2)}%`);
}

analyze().catch(console.error);
