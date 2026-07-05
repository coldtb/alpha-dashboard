import fs from "fs";
import path from "path";

// Load original backtest handler and dynamically modify the trend direction rules to be the exact opposite
const originalPath = path.join(process.cwd(), "api/backtest.js");
let code = fs.readFileSync(originalPath, "utf8");

// Replace direction checks with the exact opposite (Counter-Trend / Mean Reversion)
// Original LONG:
// if (price < sma24) { return 'SKIP'; }
// if (price > sma24 * (1 + maxDistancePct)) { return 'SKIP'; }
// Opposite LONG:
// if (price >= sma24) { return 'SKIP'; }
// if (price < sma24 * (1 - maxDistancePct)) { return 'SKIP'; }

// Original SHORT:
// if (price > sma24) { return 'SKIP'; }
// if (price < sma24 * (1 - maxDistancePct)) { return 'SKIP'; }
// Opposite SHORT:
// if (price <= sma24) { return 'SKIP'; }
// if (price > sma24 * (1 + maxDistancePct)) { return 'SKIP'; }

code = code.replace(
  `    if (dir === 'LONG') {
      if (price < sma24) {
        return 'SKIP'; // Filter out counter-trend longs
      }
      if (price > sma24 * (1 + maxDistancePct)) {
        return 'SKIP'; // Filter out overextended longs
      }
    }
    if (dir === 'SHORT') {
      if (price > sma24) {
        return 'SKIP'; // Filter out counter-trend shorts
      }
      if (price < sma24 * (1 - maxDistancePct)) {
        return 'SKIP'; // Filter out overextended shorts
      }
    }`,
  `    if (dir === 'LONG') {
      if (price >= sma24) {
        return 'SKIP'; // Counter-trend: skip longs above average
      }
      if (price < sma24 * (1 - maxDistancePct)) {
        return 'SKIP'; // Counter-trend: skip if too far below average
      }
    }
    if (dir === 'SHORT') {
      if (price <= sma24) {
        return 'SKIP'; // Counter-trend: skip shorts below average
      }
      if (price > sma24 * (1 + maxDistancePct)) {
        return 'SKIP'; // Counter-trend: skip if too far above average
      }
    }`
);

// Write to temp file for execution
const tempPath = path.join(process.cwd(), "scratch/backtest-opposite-temp.js");
fs.writeFileSync(tempPath, code, "utf8");

// Import the modified handler
const { default: handler } = await import("./backtest-opposite-temp.js");

function runBacktest(coin, start, end, minScore, maxDistancePct) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        start_time: String(start),
        end_time: String(end),
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

const phases = [
  { name: "2025 Q4 (Bull Run)",   start: 1759276800000, end: 1767225600000 },
  { name: "2026 Q1 (Bear/Range)", start: 1767225600000, end: 1775001600000 },
  { name: "2026 Q2 (Forward)",    start: 1775088000000, end: 1782604800000 }
];

async function run() {
  console.log("=== RUNNING WALK-FORWARD ANALYSIS FOR XRP (OPPOSITE COUNTER-TREND MODE) ===");
  console.log("Starting Balance: $18\n");

  const results = [];

  for (const phase of phases) {
    console.log(`> Running for ${phase.name}...`);
    try {
      const agg = await runBacktest("XRP", phase.start, phase.end, 65, 0.05);

      results.push({
        Phase: phase.name,
        Mode: "Opposite Aggressive (65, 5.0%)",
        Trades: agg.summary.totalTrades,
        "Win Rate": `${agg.summary.winRate.toFixed(2)}%`,
        "Max DD": `${agg.summary.maxDrawdown.toFixed(2)}%`,
        Return: `${agg.summary.totalReturnPct.toFixed(2)}%`,
        "Final Bal": `$${agg.summary.finalBalance.toFixed(2)}`
      });
    } catch (e) {
      console.error(`Error for ${phase.name}:`, e.message);
    }
  }

  console.log("\n=================== XRP OPPOSITE MODE SUMMARY ===================");
  console.table(results);

  // Clean up temp file
  try {
    fs.unlinkSync(tempPath);
  } catch (e) {}
}

run().catch(console.error);
