import handler from "../api/backtest.js";

const watchlistCoins = ["BTC", "ETH", "SOL", "HYPE", "LINK", "XRP", "INJ", "WLD"];
const days = 30;

function runBacktestFor(coin) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        days: String(days),
        min_score: "80"
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
  console.log(`=== Running 30-Day Backtest for Watchlist Coins ===\n`);
  
  const results = [];

  for (const coin of watchlistCoins) {
    console.log(`>>> Running backtest for ${coin}...`);
    try {
      const data = await runBacktestFor(coin);
      results.push({
        "Coin": data.coin,
        "Total Trades": data.summary.totalTrades,
        "Win Rate": `${data.summary.winRate.toFixed(2)}%`,
        "Total Return": `${data.summary.totalReturnPct.toFixed(2)}%`,
        "Max Drawdown": `${data.summary.maxDrawdown.toFixed(2)}%`,
        "Profit Factor": data.summary.profitFactor.toFixed(2),
        "Final Balance": `$${data.summary.finalBalance.toFixed(2)}`
      });
    } catch (e) {
      console.error(`Error running backtest for ${coin}:`, e.message);
    }
  }

  console.log("\n================ BACKTEST SUMMARY TABLE (30 DAYS) ================");
  console.table(results);
  console.log("==================================================================\n");
}

run().catch(console.error);
