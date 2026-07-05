import handler from "../api/backtest.js";

function runBacktest(coin, minScore, maxDistancePct) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        start_time: "1775088000000", // 2026 Q2 start
        end_time: "1782604800000",   // 2026 Q2 end
        min_score: String(minScore),
        max_distance_pct: String(maxDistancePct),
        initial_balance: "18"
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

async function run() {
  console.log("=== COMPARING SAFE MODE VS AGGRESSIVE MODE FOR WLD (2026 Q2) ===");
  
  try {
    // 1. Safe Mode (Current Settings)
    const safeData = await runBacktest("WLD", 80, 0.015);
    
    // 2. Aggressive Mode (Score 65, Distance 5%)
    const aggData = await runBacktest("WLD", 65, 0.05);

    console.log("\nComparison Table (Starting Balance: $18):");
    console.table([
      {
        Mode: "Safe Mode (Current)",
        "Min Score": 80,
        "Max Distance": "1.5%",
        "Total Trades": safeData.summary.totalTrades,
        "Win Rate": `${safeData.summary.winRate}%`,
        "Max Drawdown": `${safeData.summary.maxDrawdown.toFixed(2)}%`,
        "Total Return": `${safeData.summary.totalReturnPct.toFixed(2)}%`,
        "Final Balance": `$${safeData.summary.finalBalance.toFixed(2)}`
      },
      {
        Mode: "Aggressive Mode (Proposed)",
        "Min Score": 65,
        "Max Distance": "5.0%",
        "Total Trades": aggData.summary.totalTrades,
        "Win Rate": `${aggData.summary.winRate}%`,
        "Max Drawdown": `${aggData.summary.maxDrawdown.toFixed(2)}%`,
        "Total Return": `${aggData.summary.totalReturnPct.toFixed(2)}%`,
        "Final Balance": `$${aggData.summary.finalBalance.toFixed(2)}`
      }
    ]);

    // Also run for HYPE
    console.log("\n=== COMPARING SAFE MODE VS AGGRESSIVE MODE FOR HYPE (2026 Q2) ===");
    const safeHype = await runBacktest("HYPE", 80, 0.015);
    const aggHype = await runBacktest("HYPE", 65, 0.05);

    console.table([
      {
        Mode: "Safe Mode (Current)",
        "Min Score": 80,
        "Max Distance": "1.5%",
        "Total Trades": safeHype.summary.totalTrades,
        "Win Rate": `${safeHype.summary.winRate}%`,
        "Max Drawdown": `${safeHype.summary.maxDrawdown.toFixed(2)}%`,
        "Total Return": `${safeHype.summary.totalReturnPct.toFixed(2)}%`,
        "Final Balance": `$${safeHype.summary.finalBalance.toFixed(2)}`
      },
      {
        Mode: "Aggressive Mode (Proposed)",
        "Min Score": 65,
        "Max Distance": "5.0%",
        "Total Trades": aggHype.summary.totalTrades,
        "Win Rate": `${aggHype.summary.winRate}%`,
        "Max Drawdown": `${aggHype.summary.maxDrawdown.toFixed(2)}%`,
        "Total Return": `${aggHype.summary.totalReturnPct.toFixed(2)}%`,
        "Final Balance": `$${aggHype.summary.finalBalance.toFixed(2)}`
      }
    ]);

  } catch (e) {
    console.error("Error during param sweep:", e);
  }
}

run().catch(console.error);
