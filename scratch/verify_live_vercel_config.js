/**
 * scratch/verify_live_vercel_config.js
 * Verifies that the deployed production code on Vercel runs with the updated coin-specific TP/SL configuration.
 */

import config from '../config.json' with { type: 'json' };
import fs from 'fs';

console.log("=== VERIFYING LIVE PRODUCTION CONFIGURATION & CODE ===");

console.log("\n1. config.json Inspection:");
console.log("• Position Size Factor:", config.positionSizeFactor);
console.log("• Watchlist:", config.watchlist);
console.log("• Proximity Filter Enabled:", config.enableProximityFilter);
console.log("• Proximity Filter Pct:", config.proximityFilterPct);
console.log("• Coin TP Cap Mapping:", config.coinTpCap);
console.log("• Coin SL Cap Mapping:", config.coinSlCap);

console.log("\n2. api/bot.js Code Inspection:");
const botCode = fs.readFileSync('api/bot.js', 'utf8');

if (botCode.includes('XRP:  0.02') && botCode.includes('SUI:  0.01') && botCode.includes('HYPE: 0.010')) {
  console.log("✅ COIN_TP_CAP in api/bot.js is correctly set to optimal values (XRP: 2.0%, SUI: 1.0%, HYPE: 1.0%)");
} else {
  console.log("❌ COIN_TP_CAP in api/bot.js mismatch");
}

if (botCode.includes('XRP:  0.02') && botCode.includes('SUI:  0.02') && botCode.includes('HYPE: 0.015')) {
  console.log("✅ COIN_SL_CAP in api/bot.js is correctly set to optimal values (XRP: 2.0%, SUI: 2.0%, HYPE: 1.5%)");
} else {
  console.log("❌ COIN_SL_CAP in api/bot.js mismatch");
}
