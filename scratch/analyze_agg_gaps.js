import handler from "../api/backtest.js";

function runBacktest(coin, minScore, maxDistancePct) {
  return new Promise((resolve, reject) => {
    const req = {
      query: {
        coin,
        start_time: "1775088000000", // 2026 Q2 start
        end_time: "1782604800000",   // 2026 Q2 end
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

function analyzeGaps(coin, trades) {
  const gaps = [];
  for (let i = 1; i < trades.length; i++) {
    const prevTrade = trades[i - 1];
    const currentTrade = trades[i];
    
    const gapMs = currentTrade.entryTime - prevTrade.exitTime;
    const gapDays = gapMs / (24 * 60 * 60 * 1000);
    
    gaps.push({
      gapDays,
      prevExitTime: new Date(prevTrade.exitTime).toISOString().replace('T', ' ').substring(0, 16),
      currEntryTime: new Date(currentTrade.entryTime).toISOString().replace('T', ' ').substring(0, 16)
    });
  }

  // Sort by gap size descending
  gaps.sort((a, b) => b.gapDays - a.gapDays);
  return gaps;
}

async function run() {
  console.log("=== ANALYZING TRADE GAPS IN AGGRESSIVE MODE (2026 Q2) ===\n");

  try {
    const wld = await runBacktest("WLD", 65, 0.05);
    const hype = await runBacktest("HYPE", 65, 0.05);

    const wldGaps = analyzeGaps("WLD", wld.trades);
    const hypeGaps = analyzeGaps("HYPE", hype.trades);

    console.log("--- TOP 5 LONGEST TRADE GAPS FOR WLD (Aggressive Mode) ---");
    wldGaps.slice(0, 5).forEach((gap, i) => {
      console.log(`Gap #${i+1}: ${gap.gapDays.toFixed(2)} days (approx. ${(gap.gapDays * 24).toFixed(0)} hours)`);
      console.log(`  - Quiet Period: from [${gap.prevExitTime}] to [${gap.currEntryTime}]`);
    });

    console.log("\n--- TOP 5 LONGEST TRADE GAPS FOR HYPE (Aggressive Mode) ---");
    hypeGaps.slice(0, 5).forEach((gap, i) => {
      console.log(`Gap #${i+1}: ${gap.gapDays.toFixed(2)} days (approx. ${(gap.gapDays * 24).toFixed(0)} hours)`);
      console.log(`  - Quiet Period: from [${gap.prevExitTime}] to [${gap.currEntryTime}]`);
    });

  } catch (e) {
    console.error(e);
  }
}

run().catch(console.error);
