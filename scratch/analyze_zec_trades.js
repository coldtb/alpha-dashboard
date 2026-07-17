import fs from 'fs';

const zecPath = 'C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636/scratch/zec_real_debug.json';

if (!fs.existsSync(zecPath)) {
  console.log("ZEC backtest debug file not found.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(zecPath, 'utf8'));
const trades = data.trades;

let longWins = 0, longLosses = 0, longPnL = 0;
let shortWins = 0, shortLosses = 0, shortPnL = 0;

trades.forEach(t => {
  if (t.dir === 'LONG') {
    if (t.pnlUsd > 0) longWins++; else longLosses++;
    longPnL += t.pnlUsd;
  } else {
    if (t.pnlUsd > 0) shortWins++; else shortLosses++;
    shortPnL += t.pnlUsd;
  }
});

console.log("=== ZEC DIRECTIONAL P&L ANALYSIS ===");
console.log(`LONG Trades:  Wins: ${longWins} | Losses: ${longLosses} | Win Rate: ${(longWins / (longWins + longLosses) * 100).toFixed(1)}% | Net PnL: $${longPnL.toFixed(2)}`);
console.log(`SHORT Trades: Wins: ${shortWins} | Losses: ${shortLosses} | Win Rate: ${(shortWins / (shortWins + shortLosses) * 100).toFixed(1)}% | Net PnL: $${shortPnL.toFixed(2)}`);
console.log(`Total Net PnL: $${(longPnL + shortPnL).toFixed(2)}`);
