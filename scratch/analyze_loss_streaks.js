import fs from 'fs';

// Read backtest history for ZEC
const zecPath = 'C:\\Users\\hitech\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\scratch\\zec_backtest_debug.json';

if (!fs.existsSync(zecPath)) {
  console.log("ZEC backtest debug file not found. Run ZEC backtest first.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(zecPath, 'utf8'));
const trades = data.trades;

console.log(`=== ANALYZING ZEC LOSS STREAKS (${trades.length} TOTAL TRADES) ===`);

let currentStreak = 0;
let maxStreak = 0;
let streakStartIdx = -1;
let worstStreak = [];

let consecutiveLosses = 0;
let lossStreaks = [];

for (let i = 0; i < trades.length; i++) {
  const t = trades[i];
  const isLoss = t.pnlUsd < 0;

  if (isLoss) {
    currentStreak++;
    if (currentStreak === 1) streakStartIdx = i;
  } else {
    if (currentStreak >= 3) {
      lossStreaks.push({
        start: streakStartIdx,
        end: i - 1,
        count: currentStreak,
        trades: trades.slice(streakStartIdx, i)
      });
    }
    if (currentStreak > maxStreak) {
      maxStreak = currentStreak;
      worstStreak = trades.slice(streakStartIdx, i);
    }
    currentStreak = 0;
  }
}
// Handle trailing streak if it ended in a loss
if (currentStreak >= 3) {
  lossStreaks.push({
    start: streakStartIdx,
    end: trades.length - 1,
    count: currentStreak,
    trades: trades.slice(streakStartIdx)
  });
}

console.log(`\nMax Consecutive Loss Streak: ${maxStreak} losses in a row.`);
console.log(`Total Loss Streaks (3+ consecutive losses): ${lossStreaks.length}`);

console.log("\n--- Sample of a Bad Loss Streak ---");
if (lossStreaks.length > 0) {
  const sample = lossStreaks[0];
  console.log(`Streak of ${sample.count} losses (Trades #${sample.start + 1} to #${sample.end + 1}):`);
  sample.trades.forEach((t, idx) => {
    const entryTime = new Date(t.entryTime).toISOString();
    const exitTime = new Date(t.exitTime).toISOString();
    console.log(`  [Trade #${sample.start + 1 + idx}] Dir: ${t.dir} | Entry Px: ${t.entryPrice} | Exit Px: ${t.exitPrice} (${t.exitType})`);
    console.log(`    PnL: $${t.pnlUsd.toFixed(2)} | Entry Time: ${entryTime} | Exit Time: ${exitTime}`);
  });
}

// Check average time between trades in loss streaks
console.log("\n--- Time Gap analysis in loss streaks ---");
let totalGaps = 0;
let gapCount = 0;
lossStreaks.forEach(s => {
  for (let i = 0; i < s.trades.length - 1; i++) {
    const gapMs = s.trades[i+1].entryTime - s.trades[i].exitTime;
    totalGaps += gapMs;
    gapCount++;
  }
});
if (gapCount > 0) {
  const avgGapHours = (totalGaps / gapCount) / 3600000;
  console.log(`Average time between a trade exit and the next entry during loss streaks: ${avgGapHours.toFixed(1)} hours.`);
}
