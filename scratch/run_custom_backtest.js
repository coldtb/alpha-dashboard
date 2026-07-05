import handler from "../api/backtest.js";

function runBacktest(coin, minScore, maxDistancePct) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        start_time: "1780963200000", // June 9, 2026
        end_time: "1781740799000",   // June 17, 2026
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

function printTrades(title, trades) {
  console.log(`\n--- Trades for ${title} ---`);
  if (trades.length === 0) {
    console.log("No trades executed in this period.");
    return;
  }
  const formatted = trades.map((t, i) => ({
    "#": i + 1,
    Dir: t.dir,
    Entry: new Date(t.entryTime).toISOString().replace('T', ' ').substring(0, 16),
    Exit: new Date(t.exitTime).toISOString().replace('T', ' ').substring(0, 16),
    EntryPx: t.entryPrice.toFixed(4),
    ExitPx: t.exitPrice.toFixed(4),
    Return: `${t.returnPct.toFixed(2)}%`,
    PnL: `$${t.pnlUsd.toFixed(2)}`,
    ExitType: t.exitType
  }));
  console.table(formatted);
}

async function run() {
  console.log("=== CUSTOM RANGE BACKTEST (June 3, 2026 - June 16, 2026) ===");
  console.log("Starting Balance: $18\n");

  try {
    // 1. WLD Safe Mode
    const wldSafe = await runBacktest("WLD", 80, 0.015);
    // 2. WLD Aggressive Mode
    const wldAgg = await runBacktest("WLD", 65, 0.05);

    // 3. HYPE Safe Mode
    const hypeSafe = await runBacktest("HYPE", 80, 0.015);
    // 4. HYPE Aggressive Mode
    const hypeAgg = await runBacktest("HYPE", 65, 0.05);

    console.log("\n=================== WLD RESULTS ===================");
    printTrades("WLD Safe Mode", wldSafe.trades);
    printTrades("WLD Aggressive Mode", wldAgg.trades);
    console.log(`\nSummary (WLD):`);
    console.log(`- Safe Mode: Final Balance = $${wldSafe.summary.finalBalance.toFixed(2)} (Trades: ${wldSafe.summary.totalTrades}, Return: ${wldSafe.summary.totalReturnPct.toFixed(2)}%)`);
    console.log(`- Aggressive Mode: Final Balance = $${wldAgg.summary.finalBalance.toFixed(2)} (Trades: ${wldAgg.summary.totalTrades}, Return: ${wldAgg.summary.totalReturnPct.toFixed(2)}%)`);

    console.log("\n=================== HYPE RESULTS ===================");
    printTrades("HYPE Safe Mode", hypeSafe.trades);
    printTrades("HYPE Aggressive Mode", hypeAgg.trades);
    console.log(`\nSummary (HYPE):`);
    console.log(`- Safe Mode: Final Balance = $${hypeSafe.summary.finalBalance.toFixed(2)} (Trades: ${hypeSafe.summary.totalTrades}, Return: ${hypeSafe.summary.totalReturnPct.toFixed(2)}%)`);
    console.log(`- Aggressive Mode: Final Balance = $${hypeAgg.summary.finalBalance.toFixed(2)} (Trades: ${hypeAgg.summary.totalTrades}, Return: ${hypeAgg.summary.totalReturnPct.toFixed(2)}%)`);

  } catch (e) {
    console.error("Error running custom backtest:", e);
  }
}

run().catch(console.error);
