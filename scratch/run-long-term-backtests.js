import handler from "../api/backtest.js";

const coins = ["HYPE", "WLD"];
const periods = [180, 365]; // 6 months and 1 year

function runBacktestFor(coin, days) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        days: String(days),
        min_score: "80",
        initial_balance: "10000"
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
  console.log(`=== Running Long Term Backtests (6 Months & 1 Year) ===\n`);
  
  const results = [];

  for (const days of periods) {
    const periodLabel = days === 180 ? "6 Months" : "1 Year";
    console.log(`>>> Running backtests for ${periodLabel} (${days} days)...`);
    
    for (const coin of coins) {
      console.log(`    > ${coin}...`);
      try {
        const data = await runBacktestFor(coin, days);
        results.push({
          "Period": periodLabel,
          "Coin": data.coin,
          "Total Trades": data.summary.totalTrades,
          "Win Rate": `${data.summary.winRate.toFixed(2)}%`,
          "Total Return": `${data.summary.totalReturnPct.toFixed(2)}%`,
          "Max Drawdown": `${data.summary.maxDrawdown.toFixed(2)}%`,
          "Profit Factor": data.summary.profitFactor.toFixed(2),
          "Final Balance": `$${data.summary.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        });
      } catch (e) {
        console.error(`    x Error for ${coin} (${periodLabel}):`, e.message);
      }
    }
    console.log("");
  }

  console.log("================ LONG-TERM BACKTEST SUMMARY TABLE ================");
  console.table(results);
  console.log("==================================================================\n");
}

run().catch(console.error);
