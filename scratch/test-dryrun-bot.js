import handler from "../api/bot.js";

// Setup environment variables for Dry Run test
process.env.HYPERLIQUID_PRIVATE_KEY = "0x1000000000000000000000000000000000000000000000000000000000000002";
process.env.HYPERLIQUID_WALLET_ADDRESS = "0x0000000000000000000000000000000000000002";
process.env.DRY_RUN = "true";
process.env.HYPERLIQUID_ACCOUNT_SIZE = "100";
process.env.HYPERLIQUID_MIN_SCORE = "50";

const req = {
  headers: {},
  query: {
    dry_run: "true",
    min_score: "50"
  }
};

const res = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    console.log(`\nResponse Status: ${this.statusCode || 200}`);
    console.log("Response JSON:");
    console.log(JSON.stringify(data, null, 2));
  }
};

console.log("=== Launching Bot Dry Run Test ===");
handler(req, res).catch(err => {
  console.error("Handler crashed with error:", err);
});
