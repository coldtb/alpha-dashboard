import handler from "../api/backtest.js";

const coins = ["BTC", "ETH", "SOL", "LINK", "XRP"];
const periods = [30, 365];

// Helper to mock request and response for the Next.js/Vercel handler
function runBacktestFor(coin, days) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        days: String(days),
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

async function run() {
  console.log("=== Running Backtests for 30 Days and 365 Days (208 Days database cap) ===\n");
  
  const results = [];

  for (const days of periods) {
    console.log(`>>> Running backtests for ${days} days...`);
    for (const coin of coins) {
      try {
        const data = await runBacktestFor(coin, days);
        results.push({
          period: `${days} Days`,
          coin: data.coin,
          totalTrades: data.summary.totalTrades,
          winRate: `${data.summary.winRate}%`,
          totalReturn: `${data.summary.totalReturnPct.toFixed(2)}%`,
          maxDrawdown: `${data.summary.maxDrawdown}%`,
          profitFactor: data.summary.profitFactor
        });
      } catch (e) {
        console.error(`Error running backtest for ${coin} (${days} days):`, e.message);
      }
    }
    console.log("");
  }

  console.log("=== Backtest Results Summary Table ===");
  console.table(results);
}

run().catch(console.error);
