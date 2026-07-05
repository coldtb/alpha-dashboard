import handler from "../api/backtest.js";

function runBacktest(coin, start, end, minScore, maxDistancePct) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        start_time: String(start),
        end_time: String(end),
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

const phases = [
  { name: "2025 Q4 (Bull Run)",   start: 1759276800000, end: 1767225600000 },
  { name: "2026 Q1 (Bear/Range)", start: 1767225600000, end: 1775001600000 },
  { name: "2026 Q2 (Forward)",    start: 1775088000000, end: 1782604800000 }
];

async function run() {
  console.log("=== RUNNING WALK-FORWARD ANALYSIS FOR BTC ===");
  console.log("Starting Balance: $18\n");

  const results = [];

  for (const phase of phases) {
    console.log(`> Running for ${phase.name}...`);
    try {
      // 1. Safe Mode
      const safe = await runBacktest("BTC", phase.start, phase.end, 80, 0.015);
      // 2. Aggressive Mode
      const agg = await runBacktest("BTC", phase.start, phase.end, 65, 0.05);

      results.push({
        Phase: phase.name,
        Mode: "Safe (80, 1.5%)",
        Trades: safe.summary.totalTrades,
        "Win Rate": `${safe.summary.winRate.toFixed(2)}%`,
        "Max DD": `${safe.summary.maxDrawdown.toFixed(2)}%`,
        Return: `${safe.summary.totalReturnPct.toFixed(2)}%`,
        "Final Bal": `$${safe.summary.finalBalance.toFixed(2)}`
      });

      results.push({
        Phase: phase.name,
        Mode: "Aggressive (65, 5.0%)",
        Trades: agg.summary.totalTrades,
        "Win Rate": `${agg.summary.winRate.toFixed(2)}%`,
        "Max DD": `${agg.summary.maxDrawdown.toFixed(2)}%`,
        Return: `${agg.summary.totalReturnPct.toFixed(2)}%`,
        "Final Bal": `$${agg.summary.finalBalance.toFixed(2)}`
      });
    } catch (e) {
      console.error(`Error for ${phase.name}:`, e.message);
    }
  }

  console.log("\n=================== BTC COMPARISON SUMMARY ===================");
  console.table(results);
}

run().catch(console.error);
