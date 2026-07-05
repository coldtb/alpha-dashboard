import fs from "fs";
import path from "path";

// Load original backtest handler and write a complete, high-fidelity replica of the live bot's strategy
// including simulated Support/Resistance Rebound channels, Trailing TP/SL, and Pyramiding.
const originalPath = path.join(process.cwd(), "api/backtest.js");
let code = fs.readFileSync(originalPath, "utf8");

// 1. Add Support/Resistance Channel Generator based on 200h Swing Points (Pivot Highs/Lows)
const srGeneratorCode = `
// Simulates TrueNorth S/R Channels historically using 200h swing pivots
function generateSimulatedChannels(candles, currentIndex) {
  const lookback = 200;
  const start = Math.max(0, currentIndex - lookback);
  const windowSize = 5;
  const pivots = [];

  for (let j = start + windowSize; j <= currentIndex - windowSize; j++) {
    const c = candles[j];
    const prev = candles.slice(j - windowSize, j).map(x => parseFloat(x.h));
    const next = candles.slice(j + 1, j + 1 + windowSize).map(x => parseFloat(x.h));
    const currH = parseFloat(c.h);

    if (currH > Math.max(...prev) && currH > Math.max(...next)) {
      pivots.push({ price: currH, type: 'resistance' });
    }

    const prevL = candles.slice(j - windowSize, j).map(x => parseFloat(x.l));
    const nextL = candles.slice(j + 1, j + 1 + windowSize).map(x => parseFloat(x.l));
    const currL = parseFloat(c.l);

    if (currL < Math.min(...prevL) && currL < Math.min(...nextL)) {
      pivots.push({ price: currL, type: 'support' });
    }
  }

  // Group pivots into channels with strength
  const channels = [];
  pivots.forEach(p => {
    const tolerance = p.price * 0.005; // 0.5% tolerance band
    let found = false;
    for (const ch of channels) {
      if (Math.abs(ch.mid - p.price) <= tolerance) {
        ch.count++;
        ch.hi = Math.max(ch.hi, p.price);
        ch.lo = Math.min(ch.lo, p.price);
        ch.mid = (ch.hi + ch.lo) / 2;
        found = true;
        break;
      }
    }
    if (!found) {
      channels.push({
        hi: p.price,
        lo: p.price,
        mid: p.price,
        strength: 20, // base strength
        count: 1
      });
    }
  });

  channels.forEach(ch => {
    ch.strength = Math.min(100, ch.count * 20);
  });

  return channels.sort((a, b) => b.strength - a.strength);
}
`;

// Insert the S/R Channel Generator after the calculateScore function
code = code.replace(
  `function calculateScore(coin, isHyperliquidScale = true) {`,
  srGeneratorCode + `\nfunction calculateScore(coin, isHyperliquidScale = true) {`
);

// 2. Rewrite computeStrategyLevels in backtest.js to use the simulated S/R channels and mirror live bot computeStrategyLevels
const replicaLevelsCode = `
function computeStrategyLevelsReplica(coin, dir, channels, config) {
  const price = coin.price;
  const dec = price < 1 ? 6 : (price < 10 ? 4 : 2);
  let vwap = (coin.high + coin.low + price) / 3;

  let entry = price;
  let reason = 'fallback';
  let strongSupport = null;
  let strongResistance = null;
  const buffer = config.entryBufferPct !== undefined ? config.entryBufferPct : 0.005;

  if (dir === 'LONG' && config.enableSupportRebound !== false && channels.length > 0) {
    const minStrength = config.supportMinStrength !== undefined ? config.supportMinStrength : 50;
    const validSupports = channels.filter(c => c.hi <= price && c.lo < price && c.strength >= minStrength);
    if (validSupports.length > 0) {
      validSupports.sort((a, b) => b.hi - a.hi);
      const candSupport = validSupports[0];
      const candEntry = Math.min(candSupport.hi * (1 + buffer), price);
      const maxDist = config.maxReboundDistancePct !== undefined ? config.maxReboundDistancePct : 0.025;
      const dist = (price - candEntry) / price;
      
      if (dist <= maxDist) {
        strongSupport = candSupport;
        entry = candEntry;
        reason = 'support_rebound_limit';
      }
    }
  } else if (dir === 'SHORT' && config.enableResistanceRebound !== false && channels.length > 0) {
    const minStrength = config.resistanceMinStrength !== undefined ? config.resistanceMinStrength : 50;
    const validResistances = channels.filter(c => c.lo >= price && c.hi > price && c.strength >= minStrength);
    if (validResistances.length > 0) {
      validResistances.sort((a, b) => a.lo - b.lo);
      const candResistance = validResistances[0];
      const candEntry = Math.max(candResistance.lo * (1 - buffer), price);
      const maxDist = config.maxReboundDistancePct !== undefined ? config.maxReboundDistancePct : 0.025;
      const dist = (candEntry - price) / price;

      if (dist <= maxDist) {
        strongResistance = candResistance;
        entry = candEntry;
        reason = 'resistance_rebound_limit';
      }
    }
  }

  if (reason === 'fallback') {
    // Standard Fibonacci Pullback Limit Entry
    entry = dir === 'LONG' ? coin.high - (coin.high - coin.low) * 0.618 : coin.high - (coin.high - coin.low) * 0.382;
    reason = 'fib_fallback';

    if (coin.score >= 90) {
      const shallowEntry = dir === 'LONG' ? price * 0.997 : price * 1.003;
      if (dir === 'LONG' ? shallowEntry > entry : shallowEntry < entry) {
        entry = shallowEntry;
        reason += '+shallow_entry_high_score';
      }
    }
  }

  // Calculate SL/TP relative to entry
  let sl = dir === 'LONG' ? entry * 0.97 : entry * 1.03;
  let tp = dir === 'LONG' ? entry * 1.03 : entry * 0.97;

  if (dir === 'LONG') {
    if (strongSupport) {
      sl = strongSupport.lo * 0.985;
      reason += '+sr_channel';
      const resistances = channels.filter(c => c.lo >= price).sort((a, b) => a.lo - b.lo);
      const minTp = entry + (entry - sl) * 1.5;
      tp = resistances.length > 0 && resistances[0].lo >= minTp ? resistances[0].lo : minTp;
    } else {
      const supports = channels.filter(c => c.hi <= price).sort((a, b) => b.hi - a.hi);
      if (supports.length > 0) {
        sl = supports[0].lo * 0.985;
        reason = 'sr_channel';
        const resistances = channels.filter(c => c.lo >= price).sort((a, b) => a.lo - b.lo);
        const minTp = entry + (entry - sl) * 1.5;
        tp = resistances.length > 0 && resistances[0].lo >= minTp ? resistances[0].lo : minTp;
      } else {
        sl = coin.low * 0.985;
        const minTp = entry + (entry - sl) * 1.5;
        tp = vwap > minTp ? vwap : entry + (entry - sl) * 2;
      }
    }
  } else {
    if (strongResistance) {
      sl = strongResistance.hi * 1.015;
      reason += '+sr_channel';
      const supports = channels.filter(c => c.hi <= price).sort((a, b) => b.hi - a.hi);
      const minTp = entry - (sl - entry) * 1.5;
      tp = supports.length > 0 && supports[0].hi <= minTp ? supports[0].hi : minTp;
    } else {
      const resistances = channels.filter(c => c.lo >= price).sort((a, b) => a.lo - b.lo);
      if (resistances.length > 0) {
        sl = resistances[0].hi * 1.015;
        reason = 'sr_channel';
        const supports = channels.filter(c => c.hi <= price).sort((a, b) => b.hi - a.hi);
        const minTp = entry - (sl - entry) * 1.5;
        tp = supports.length > 0 && supports[0].hi <= minTp ? supports[0].hi : minTp;
      } else {
        sl = coin.high * 1.015;
        const minTp = entry - (sl - entry) * 1.5;
        tp = vwap < minTp ? vwap : entry - (sl - entry) * 2;
      }
    }
  }

  // Apply safety buffers and hard caps
  const activeSlBuffer = config.minSlBuffer;
  const activeTpBuffer = config.minTpBuffer;

  if (dir === 'LONG') {
    const maxSlAllowed = entry * (1 - activeSlBuffer);
    if (sl > maxSlAllowed) sl = maxSlAllowed;
    const minSlAllowed = entry * 0.98; // -2% cap
    if (sl < minSlAllowed) sl = minSlAllowed;

    const minTpAllowed = entry * (1 + activeTpBuffer);
    if (tp < minTpAllowed) tp = minTpAllowed;
    const maxTpAllowed = entry * 1.03; // +3% cap
    if (tp > maxTpAllowed) tp = maxTpAllowed;
  } else {
    const minSlAllowed = entry * (1 + activeSlBuffer);
    if (sl < minSlAllowed) sl = minSlAllowed;
    const maxSlAllowed = entry * 1.02; // +2% cap
    if (sl > maxSlAllowed) sl = maxSlAllowed;

    const maxTpAllowed = entry * (1 - activeTpBuffer);
    if (tp > maxTpAllowed) tp = maxTpAllowed;
    const minTpAllowed = entry * 0.97; // -3% cap
    if (tp < minTpAllowed) tp = minTpAllowed;
  }

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl: parseFloat(sl.toFixed(dec)),
    tp: parseFloat(tp.toFixed(dec)),
    reason
  };
}
`;

// Insert computeStrategyLevelsReplica into the code
code = code.replace(
  `function computeStrategyLevels(coin, dir, slBuffer = null, tpBuffer = null) {`,
  replicaLevelsCode + `\nfunction computeStrategyLevels(coin, dir, slBuffer = null, tpBuffer = null) {`
);

// 3. Update entry logic at line 430 to call the Replica computeStrategyLevels function with channels
code = code.replace(
  `          const levels = computeStrategyLevels(coinData, direction, qSlBuffer, qTpBuffer);`,
  `          const channels = generateSimulatedChannels(candles, i);
          const levels = computeStrategyLevelsReplica(coinData, direction, channels, config);`
);

// 4. Modify position state initialization at entry
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

// 5. Replace Position Handling logic with Trailing & Pyramiding simulation
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

// 6. Modify PnL calculation to apply size multiplier (around line 402)
code = code.replace(
  `const tradePnl = activeMargin * netReturn;`,
  `const sizeMultiplier = position.pyramidedSizeMultiplier || 1.0;
          const tradePnl = activeMargin * netReturn * sizeMultiplier;`
);

// Write to temp file for execution
const tempPath = path.join(process.cwd(), "scratch/backtest-replica-temp.js");
fs.writeFileSync(tempPath, code, "utf8");

// Import the modified handler
const { default: handler } = await import("./backtest-replica-temp.js");

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
  console.log("=== RUNNING FULL REPLICA ANALYSIS FOR XRP & HYPE (ALL FEATURES ACTIVE) ===");
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
          Mode: "Full Replica Mode",
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

  console.log("\n=================== XRP & HYPE FULL REPLICA SUMMARY ===================");
  console.table(results);

  // Clean up temp file
  try {
    fs.unlinkSync(tempPath);
  } catch (e) {}
}

run().catch(console.error);
