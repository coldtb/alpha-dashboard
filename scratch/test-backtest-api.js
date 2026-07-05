import handler from "../api/backtest.js";

const req = {
  query: {
    coin: "BTC",
    days: "7",
    min_score: "85"
  }
};

const res = {
  status(code) {
    console.log("Response Status:", code);
    return this;
  },
  json(data) {
    console.log("Response Data Keys:", Object.keys(data));
    console.log("Summary:", JSON.stringify(data.summary, null, 2));
    if (data.trades) {
      console.log(`Executed ${data.trades.length} trades.`);
    }
    return this;
  }
};

async function test() {
  console.log("Testing api/backtest.js handler locally...");
  await handler(req, res);
}

test().catch(console.error);
