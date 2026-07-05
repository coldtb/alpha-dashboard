import handler from "../api/backtest.js";

const phases = [
  { name: "2025 Q4 (Bull Run)",   start: 1759276800000, end: 1767225600000 },
  { name: "2026 Q1 (Bear/Range)", start: 1767225600000, end: 1775001600000 },
  { name: "2026 Q2 (Forward)",    start: 1775088000000, end: 1782604800000 }
];

const coins = ["HYPE", "WLD", "BTC"];

function runBacktestFor(coin, start, end) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        start_time: String(start),
        end_time: String(end),
        min_score: "80",
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
  console.log("=== Running Walk-Forward Analysis (WLD & BTC) ===\n");
  
  const results = [];

  for (const coin of coins) {
    console.log(`>>> Running segments for ${coin}...`);
    for (const phase of phases) {
      console.log(`    > ${phase.name}...`);
      try {
        const data = await runBacktestFor(coin, phase.start, phase.end);
        results.push({
          "Coin": coin,
          "Phase": phase.name,
          "Total Trades": data.summary.totalTrades,
          "Win Rate": `${data.summary.winRate.toFixed(2)}%`,
          "Total Return": `${data.summary.totalReturnPct.toFixed(2)}%`,
          "Max Drawdown": `${data.summary.maxDrawdown.toFixed(2)}%`,
          "Profit Factor": data.summary.profitFactor.toFixed(2),
          "Final Balance": `$${data.summary.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        });
      } catch (e) {
        console.error(`    x Error for ${coin} (${phase.name}):`, e.message);
      }
    }
    console.log("");
  }

  console.log("================ WALK-FORWARD ANALYSIS SUMMARY ================");
  console.table(results);
  console.log("===============================================================\n");
}

run().catch(console.error);
