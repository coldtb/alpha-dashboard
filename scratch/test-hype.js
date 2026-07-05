import handler from "../api/backtest.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runBacktestForHYPE(sl, tp) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin: "HYPE",
        days: "365",
        min_score: "90",
        sl_buffer: String(sl),
        tp_buffer: String(tp)
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
  console.log("=== Running 365-day Backtests for HYPE ===");
  
  // Test 1: Config A (SL=1.0%, TP=2.0%)
  // Test 2: Config B (SL=1.0%, TP=5.0%)
  // Test 3: Config C (SL=2.0%, TP=5.0%) - wider SL for high volatility HYPE
  
  const tests = [
    { sl: 0.010, tp: 0.020, name: "SL=1.0%, TP=2.0%" },
    { sl: 0.010, tp: 0.050, name: "SL=1.0%, TP=5.0%" },
    { sl: 0.020, tp: 0.050, name: "SL=2.0%, TP=5.0%" }
  ];

  const results = [];

  for (const t of tests) {
    try {
      console.log(`Running HYPE backtest with ${t.name}...`);
      const data = await runBacktestForHYPE(t.sl, t.tp);
      results.push({
        config: t.name,
        totalTrades: data.summary.totalTrades,
        winRate: `${data.summary.winRate}%`,
        totalReturn: `${data.summary.totalReturnPct.toFixed(2)}%`,
        maxDrawdown: `${data.summary.maxDrawdown}%`,
        profitFactor: data.summary.profitFactor
      });
      await sleep(2000);
    } catch (e) {
      console.error(`Error running HYPE with ${t.name}:`, e.message);
      await sleep(2000);
    }
  }

  console.log("\n=== HYPE Backtest Performance Summary ===");
  console.table(results);
}

run().catch(console.error);
