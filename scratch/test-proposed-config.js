import handler from "../api/backtest.js";

const coins = ["BTC", "ETH", "SOL", "LINK", "XRP"];

function runBacktestFor(coin) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        days: "365",
        min_score: "90",
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
  console.log("=== Running 365-day Backtest with Proposed Config (SL=1.0%, TP=5.0%) ===");
  const results = [];
  
  for (const coin of coins) {
    try {
      const data = await runBacktestFor(coin);
      results.push({
        coin: data.coin,
        totalTrades: data.summary.totalTrades,
        winRate: `${data.summary.winRate}%`,
        totalReturn: `${data.summary.totalReturnPct.toFixed(2)}%`,
        maxDrawdown: `${data.summary.maxDrawdown}%`,
        profitFactor: data.summary.profitFactor
      });
    } catch (e) {
      console.error(`Error running proposed backtest for ${coin}:`, e.message);
    }
  }

  console.log("\n=== Proposed Strategy Performance Table ===");
  console.table(results);
}

run().catch(console.error);
