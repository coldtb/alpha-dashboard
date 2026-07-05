import fs from "fs";
import path from "path";

// Load original backtest handler and dynamically modify it to support Trailing TP/SL and Pyramiding
const originalPath = path.join(process.cwd(), "api/backtest.js");
let code = fs.readFileSync(originalPath, "utf8");

// 1. Modify position state initialization at entry (around line 441)
// Add `isPyramided: false, pyramidedSizeMultiplier: 1.0`
code = code.replace(
  `          position = {
            dir: direction,
            entryPrice: entryPriceWithPenalties,
            tp: levels.tp,
            sl: levels.sl,
            score,
            fillTime: timestamp,
            slMovedToEntry: false,
            entrySlippagePct: slippagePct
          };`,
  `          position = {
            dir: direction,
            entryPrice: entryPriceWithPenalties,
            tp: levels.tp,
            sl: levels.sl,
            score,
            fillTime: timestamp,
            slMovedToEntry: false,
            entrySlippagePct: slippagePct,
            isPyramided: false,
            pyramidedSizeMultiplier: 1.0
          };`
);

// 2. Replace Position Handling logic (lines 343-370) with Trailing & Pyramiding simulation
const oldPositionHandling = `        if (isLong) {
          if (!position.slMovedToEntry && high >= position.entryPrice * 1.015) {
            position.sl = position.entryPrice;
            position.slMovedToEntry = true;
          }

          if (low <= position.sl) {
            hitSl = true;
          } else if (high >= position.tp) {
            hitTp = true;
          }
        } else {
          if (!position.slMovedToEntry && low <= position.entryPrice * 0.985) {
            position.sl = position.entryPrice;
            position.slMovedToEntry = true;
          }

          if (high >= position.sl) {
            hitSl = true;
          } else if (low <= position.tp) {
            hitTp = true;
          }
        }`;

const newPositionHandling = `        if (isLong) {
          // Breakeven lock at +1.5%
          if (!position.slMovedToEntry && high >= position.entryPrice * 1.015) {
            position.sl = position.entryPrice;
            position.slMovedToEntry = true;
          }

          // Trailing & Pyramiding at TP
          if (!position.isPyramided && high >= position.tp) {
            const oldTp = position.tp;
            position.isPyramided = true;
            position.entryPrice = (position.entryPrice + oldTp) / 2; // Average price after pyramiding
            position.sl = oldTp * 0.99; // Lock SL at old TP - 1%
            position.tp = oldTp * 1.03; // Extend TP by 3%
            position.pyramidedSizeMultiplier = 2.0; // Double the size
          } else if (position.isPyramided && high >= position.tp) {
            hitTp = true; // Hit extended TP
          }

          // Trigger SL/TP
          if (low <= position.sl) {
            hitSl = true;
          } else if (!position.isPyramided && high >= position.tp) {
            hitTp = true; // Fallback standard TP fill
          }
        } else {
          // Breakeven lock at -1.5%
          if (!position.slMovedToEntry && low <= position.entryPrice * 0.985) {
            position.sl = position.entryPrice;
            position.slMovedToEntry = true;
          }

          // Trailing & Pyramiding at TP
          if (!position.isPyramided && low <= position.tp) {
            const oldTp = position.tp;
            position.isPyramided = true;
            position.entryPrice = (position.entryPrice + oldTp) / 2; // Average price
            position.sl = oldTp * 1.01; // Lock SL at old TP + 1%
            position.tp = oldTp * 0.97; // Extend TP by -3%
            position.pyramidedSizeMultiplier = 2.0; // Double the size
          } else if (position.isPyramided && low <= position.tp) {
            hitTp = true;
          }

          // Trigger SL/TP
          if (high >= position.sl) {
            hitSl = true;
          } else if (!position.isPyramided && low <= position.tp) {
            hitTp = true;
          }
        }`;

code = code.replace(oldPositionHandling, newPositionHandling);

// 3. Modify PnL calculation to apply size multiplier (around line 402)
code = code.replace(
  `          const tradePnl = activeMargin * netReturn;`,
  `          const sizeMultiplier = position.pyramidedSizeMultiplier || 1.0;
          const tradePnl = activeMargin * netReturn * sizeMultiplier;`
);

// Write to temp file for execution
const tempPath = path.join(process.cwd(), "scratch/backtest-pyramid-temp.js");
fs.writeFileSync(tempPath, code, "utf8");

// Import the modified handler
const { default: handler } = await import("./backtest-pyramid-temp.js");

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
  console.log("=== RUNNING WALK-FORWARD ANALYSIS FOR XRP & HYPE (WITH TRAILING & PYRAMIDING) ===");
  console.log("Starting Balance: $18\n");

  const results = [];

  for (const coin of ["XRP", "HYPE"]) {
    console.log(`\n--- Running for ${coin} ---`);
    for (const phase of phases) {
      console.log(`> Running for ${phase.name}...`);
      try {
        const agg = await runBacktest(coin, phase.start, phase.end, 65, 0.05);

        results.push({
          Coin: coin,
          Phase: phase.name,
          Mode: "Trailing + Pyramid Aggressive",
          Trades: agg.summary.totalTrades,
          "Win Rate": `${agg.summary.winRate.toFixed(2)}%`,
          "Max DD": `${agg.summary.maxDrawdown.toFixed(2)}%`,
          Return: `${agg.summary.totalReturnPct.toFixed(2)}%`,
          "Final Bal": `$${agg.summary.finalBalance.toFixed(2)}`
        });
      } catch (e) {
        console.error(`Error for ${coin} during ${phase.name}:`, e.message);
      }
    }
  }

  console.log("\n=================== XRP & HYPE TRAILING + PYRAMIDING SUMMARY ===================");
  console.table(results);

  // Clean up temp file
  try {
    fs.unlinkSync(tempPath);
  } catch (e) {}
}

run().catch(console.error);
