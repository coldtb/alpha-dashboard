import fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

console.log("=== 185-COIN WATCHLIST VERIFICATION ===");
console.log(`Loaded Watchlist Count: ${config.watchlist.length} coins!`);
console.log(`Enable Eterna Signals: ${config.enableEternaSignals}`);
console.log(`Dynamic Watchlist Active: ${config.dynamicWatchlist}`);

if (config.watchlist.length === 185) {
  console.log("✅ SUCCESS: Watchlist contains exactly 185 overlapping coins!");
} else {
  console.log(`⚠️ Note: Watchlist count is ${config.watchlist.length}`);
}
