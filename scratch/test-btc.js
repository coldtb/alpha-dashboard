import backtestHandler from '../api/backtest.js';

async function runBtcBacktest(days) {
  const req = {
    query: {
      coin: 'BTC',
      days: days.toString(),
      initialBalance: '10000',
      min_score: '30',
      smart_sl_tp: 'true'
    }
  };

  let responseData = null;
  const res = {
    status: function() { return this; },
    json: function(data) {
      responseData = data;
      return this;
    }
  };

  await backtestHandler(req, res);
  return responseData;
}

async function main() {
  console.log("=== RUNNING BTC BASELINE BACKTESTS ===");
  
  console.log("Running BTC - 90 Days...");
  const r90 = await runBtcBacktest(90);
  const s90 = r90.summary;
  console.log(`[BTC - 90 Days]`);
  console.log(`  Final Balance: $${s90.finalBalance.toFixed(2)}`);
  console.log(`  Return: ${s90.totalReturnPct.toFixed(2)}%`);
  console.log(`  Win Rate: ${s90.winRate.toFixed(1)}%`);
  console.log(`  Max Drawdown: ${s90.maxDrawdown.toFixed(2)}%`);
  console.log(`  Profit Factor: ${s90.profitFactor}`);
  console.log(`  Total Trades: ${s90.totalTrades}`);

  console.log("\nRunning BTC - 180 Days...");
  const r180 = await runBtcBacktest(180);
  const s180 = r180.summary;
  console.log(`[BTC - 180 Days]`);
  console.log(`  Final Balance: $${s180.finalBalance.toFixed(2)}`);
  console.log(`  Return: ${s180.totalReturnPct.toFixed(2)}%`);
  console.log(`  Win Rate: ${s180.winRate.toFixed(1)}%`);
  console.log(`  Max Drawdown: ${s180.maxDrawdown.toFixed(2)}%`);
  console.log(`  Profit Factor: ${s180.profitFactor}`);
  console.log(`  Total Trades: ${s180.totalTrades}`);
}

main().catch(console.error);
