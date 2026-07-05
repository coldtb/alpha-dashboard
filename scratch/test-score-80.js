import handler from "../api/backtest.js";

const coins = ["BTC", "ETH", "SOL", "LINK", "XRP"];

// Helper to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runBacktestFor(coin) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        days: "365",
        min_score: "80",
        sl_buffer: "0.01",
        tp_buffer: "0.05"
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
  console.log("=== Running 365-day Backtest with minScore=80 (SL=1.0%, TP=5.0%) ===");
  console.log("Adding 2-second delay between coin requests to prevent rate limit...");
  
  const results = [];
  
  for (const coin of coins) {
    try {
      console.log(`Running backtest for ${coin}...`);
      const data = await runBacktestFor(coin);
      results.push({
        coin: data.coin,
        totalTrades: data.summary.totalTrades,
        winRate: `${data.summary.winRate}%`,
        totalReturn: `${data.summary.totalReturnPct.toFixed(2)}%`,
        maxDrawdown: `${data.summary.maxDrawdown}%`,
        profitFactor: data.summary.profitFactor
      });
      await sleep(2000); // 2s sleep
    } catch (e) {
      console.error(`Error running backtest for ${coin}:`, e.message);
      await sleep(2000);
    }
  }

  console.log("\n=== Strategy Performance Table (minScore=80) ===");
  console.table(results);
}

run().catch(console.error);
