import handler from '../api/backtest.js';

const mockReq = {
  query: {
    coin: 'HYPE',
    days: '30',
    min_score: '85',
    initial_balance: '20'
  }
};

const mockRes = {
  status(code) {
    return {
      json(data) {
        console.log(`[API Test] Code ${code}:`);
        if (data.status === 'success') {
          console.log(`Coin: ${data.coin}`);
          console.log(`Return: +${data.summary.totalReturnPct}%`);
          console.log(`Max DD: -${data.summary.maxDrawdown}%`);
          console.log(`Win Rate: ${data.summary.winRate}%`);
          console.log(`Total Trades: ${data.summary.totalTrades}`);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
      }
    };
  }
};

async function run() {
  console.log("Running API backtest handler dry-run...");
  await handler(mockReq, mockRes);
}

run().catch(console.error);
