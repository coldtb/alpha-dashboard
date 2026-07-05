import handler from "../api/backtest.js";

const req = {
  query: {
    coin: "HYPE",
    days: "30",
    min_score: "80",
    initial_balance: "40"
  }
};

const res = {
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    if (this.statusCode !== 200) {
      console.error("Backtest failed:", data.error || data);
      return this;
    }
    
    console.log("\n================ HYPE 30-DAY BACKTEST SUMMARY ================");
    console.log(`Coin:              ${data.coin}`);
    console.log(`Period:            ${data.days} Days`);
    console.log(`Total Trades:      ${data.summary.totalTrades}`);
    console.log(`Win Rate:          ${data.summary.winRate.toFixed(2)}%`);
    console.log(`Total Return:      ${data.summary.totalReturnPct.toFixed(2)}%`);
    console.log(`Max Drawdown:      ${data.summary.maxDrawdown.toFixed(2)}%`);
    console.log(`Profit Factor:     ${data.summary.profitFactor.toFixed(2)}`);
    console.log(`Initial Balance:   $${req.query.initial_balance || 10000}`);
    console.log(`Final Balance:     $${data.summary.finalBalance.toFixed(2)}`);
    console.log("=============================================================\n");

    if (data.trades && data.trades.length > 0) {
      console.log("=== Detailed Trades List ===");
      const formattedTrades = data.trades.map((t, idx) => ({
        "#": idx + 1,
        "Type": t.dir,
        "Entry Time": new Date(t.entryTime).toISOString().slice(0, 16).replace("T", " "),
        "Exit Time": new Date(t.exitTime).toISOString().slice(0, 16).replace("T", " "),
        "Entry Px": t.entryPrice.toFixed(4),
        "Exit Px": t.exitPrice.toFixed(4),
        "Result": t.exitType,
        "Return %": `${t.returnPct > 0 ? "+" : ""}${t.returnPct.toFixed(2)}%`,
        "P&L ($)": `${t.pnlUsd > 0 ? "+" : ""}$${t.pnlUsd.toFixed(2)}`,
        "Balance": `$${t.balanceAfter.toFixed(2)}`
      }));
      console.table(formattedTrades);
    } else {
      console.log("No trades were executed during this period.");
    }
    return this;
  }
};

async function main() {
  console.log("Starting HYPE 30-Day Backtest locally using actual Hyperliquid hourly candle data...");
  await handler(req, res);
}

main().catch(console.error);
