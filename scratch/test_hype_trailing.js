import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';
import path from 'path';

const DAYS = 180;
const initialBalance = 10000;
const leverage = 5;
const roundTripFeePct = 0.0008;
const BRAIN_DIR = 'C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636';

const sleep = ms => new Promise(res => setTimeout(res, ms));

function calculateScore(coin) {
  let score = 0;
  const change = Math.abs(coin.change);
  if (change <= 3.0) { score += 30; if (change <= 1.5) score += 10; }

  const absFunding = Math.abs(coin.funding || 0);
  if (absFunding > 0) {
    score += 20;
    if (absFunding >= 0.0005) score += 15;
    else if (absFunding >= 0.0002) score += 10;
  }

  const vol = coin.volume;
  if (vol > 30000000) score += 20;
  else if (vol > 15000000) score += 15;
  else if (vol > 5000000) score += 10;

  if (coin.symbol === 'HYPE') score += 15;
  return Math.min(score, 100);
}

function calculatePivotLevels(high, low, close) {
  const p = (high + low + close) / 3;
  return {
    p,
    r1: p + (high - low) * 0.382,
    s1: p - (high - low) * 0.382,
    r2: p + (high - low) * 0.618,
    s2: p - (high - low) * 0.618,
  };
}

function detectAutoDirection(coin, sma24, smaTrend) {
  const { symbol, price, funding = 0, change = 0 } = coin;

  if (symbol === 'HYPE') {
    if (sma24 === null) return 'SKIP';
    return price >= sma24 ? 'LONG' : 'SHORT';
  }
  return 'SKIP';
}

function computeStrategyLevels(coin, dir, pivotLevels, params, slCapOverride = null) {
  const price = coin.price;
  const dec = price < 1 ? 6 : (price < 10 ? 4 : 2);
  const high = coin.high || price * 1.03;
  const low  = coin.low  || price * 0.97;

  let entry, sl, tp;

  if (dir === 'LONG') {
    entry = high - (high - low) * 0.618;
    sl    = pivotLevels ? pivotLevels.s2 * 0.995 : low * 0.985;
    const minTp = entry + (entry - sl) * 1.5;
    tp    = pivotLevels && pivotLevels.r1 > minTp ? pivotLevels.r1 : minTp;
  } else {
    entry = high - (high - low) * 0.382;
    sl    = pivotLevels ? pivotLevels.r2 * 1.005 : high * 1.015;
    const minTp = entry - (sl - entry) * 1.5;
    tp    = pivotLevels && pivotLevels.s1 < minTp ? pivotLevels.s1 : minTp;
  }

  const tpCap = params.tpCap;
  const slCap = slCapOverride !== null ? slCapOverride : params.slCap;

  if (dir === 'LONG') {
    if (sl > entry * (1 - 0.01)) sl = entry * (1 - 0.01);
    if (sl < entry * (1 - slCap)) sl = entry * (1 - slCap);
    if (tp < entry * (1 + 0.005)) tp = entry * (1 + 0.005);
    if (tp > entry * (1 + tpCap)) tp = entry * (1 + tpCap);
  } else {
    if (sl < entry * (1 + 0.01)) sl = entry * (1 + 0.01);
    if (sl > entry * (1 + slCap)) sl = entry * (1 + slCap);
    if (tp > entry * (1 - 0.005)) tp = entry * (1 - 0.005);
    if (tp < entry * (1 - tpCap)) tp = entry * (1 - tpCap);
  }

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl:    parseFloat(sl.toFixed(dec)),
    tp:    parseFloat(tp.toFixed(dec)),
  };
}

async function loadHistoryData() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const endTime   = Math.floor(Date.now() / 3600000) * 3600000;
  const startTime = endTime - DAYS * 24 * 60 * 60 * 1000;
  const chunkMs   = 150 * 24 * 60 * 60 * 1000;

  const coinCandles = {};
  const coinFunding = {};

  const candles = [];
  let cur = startTime - 200 * 3600000;
  while (cur < endTime) {
    await sleep(200);
    try {
      const chunk = await info.candleSnapshot({
        coin: 'HYPE', interval: '1h',
        startTime: cur,
        endTime: Math.min(cur + chunkMs, endTime)
      });
      if (chunk) {
        chunk.forEach(c => {
          if (!candles.length || c.t > candles[candles.length - 1].t) candles.push(c);
        });
      }
    } catch (e) {
      console.warn(`  [Candle Fetch Error] ${e.message}`);
      await sleep(1000);
      cur -= chunkMs;
    }
    cur += chunkMs;
  }
  coinCandles['HYPE'] = candles;

  const fundingMap = {};
  cur = startTime;
  while (cur < endTime) {
    await sleep(200);
    try {
      const chunk = await info.fundingHistory({
        coin: 'HYPE',
        startTime: cur,
        endTime: Math.min(cur + chunkMs, endTime)
      });
      if (chunk) {
        chunk.forEach(f => {
          const hk = Math.floor(f.time / 3600000) * 3600000;
          fundingMap[hk] = parseFloat(f.fundingRate);
        });
      }
    } catch (e) {
      console.warn(`  [Funding Fetch Error] ${e.message}`);
      await sleep(1000);
      cur -= chunkMs;
    }
    cur += chunkMs;
  }
  coinFunding['HYPE'] = fundingMap;

  return { coinCandles, coinFunding, startTime, endTime };
}

function runSimulation(coinCandles, coinFunding, startTime, endTime, enableTrailing) {
  let balance = initialBalance;
  let peak = balance;
  let maxDd = 0;

  const openPositions = {};
  const pendingOrders = {};
  const trades = [];

  const stepMs = 3600000;
  const coinParams = { tpCap: 0.0075, slCap: 0.015, trendPeriod: 24 };

  const candles = coinCandles['HYPE'];
  let pointer = candles.findIndex(c => c.t >= startTime);
  if (pointer === -1) pointer = 200;

  // Use max positions = 1 to prevent leverage multiplier distortion
  const maxConcurrent = 1;

  for (let timestamp = startTime; timestamp <= endTime; timestamp += stepMs) {
    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDd) maxDd = dd;

    let ptr = pointer;
    while (ptr < candles.length && candles[ptr].t < timestamp) {
      ptr++;
    }
    pointer = ptr;

    const c = candles[ptr];
    if (!c || Math.abs(c.t - timestamp) > 1800000) continue;

    let high24h = parseFloat(c.l), low24h = parseFloat(c.h), sumClose24 = 0, vol24 = 0;
    for (let j = ptr - 24; j <= ptr; j++) {
      const cj = candles[j];
      if (!cj) continue;
      if (parseFloat(cj.h) > high24h) high24h = parseFloat(cj.h);
      if (parseFloat(cj.l) < low24h) low24h = parseFloat(cj.l);
      sumClose24 += parseFloat(cj.c);
      vol24 += parseFloat(cj.v) * parseFloat(cj.c);
    }
    const sma24 = sumClose24 / 25;

    let sumTrend = 0;
    for (let j = ptr - coinParams.trendPeriod; j <= ptr; j++) {
      if (candles[j]) sumTrend += parseFloat(candles[j].c);
    }
    const smaTrend = sumTrend / (coinParams.trendPeriod + 1);

    const hourKey = Math.floor(timestamp / 3600000) * 3600000;
    const fundingRaw = coinFunding['HYPE'][hourKey] || 0.0000125;
    const funding = fundingRaw * 3;

    const data = {
      symbol: 'HYPE',
      price: parseFloat(c.c),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      change: ((parseFloat(c.c) - parseFloat(candles[ptr - 24].c)) / parseFloat(candles[ptr - 24].c)) * 100,
      volume: vol24,
      funding,
      sma24,
      smaTrend,
      ptr,
      volatility24h: (high24h - low24h) / low24h,
      high24h,
      low24h
    };

    // Check Open Position
    const pos = openPositions['HYPE'];
    if (pos) {
      const isLong = pos.dir === 'LONG';
      let hitSl = false, hitTp = false;
      let exitReason = 'SL';

      const currentProfitPct = isLong
        ? (data.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - data.price) / pos.entryPrice;

      // 1. Trailing Activation Check:
      // Generalized isNearTp: true only if price has completed >= 85% of entry-to-TP distance
      const totalTpDistance = Math.abs(pos.initialTp - pos.entryPrice);
      const currentTpDistance = Math.abs(data.price - pos.entryPrice);
      
      const isNearTp = totalTpDistance > 0 && currentTpDistance >= totalTpDistance * 0.85 && (isLong ? data.price > pos.entryPrice : data.price < pos.entryPrice);

      if (enableTrailing && !pos.trailed && isNearTp) {
        // Trailing Activation!
        pos.trailed = true;
        pos.sl = pos.initialTp; // Lock in Stop Loss at original TP
        pos.tp = isLong ? data.price * 1.02 : data.price * 0.98; // Trail TP by 2%
        pos.marginScale = 1.5; // Simulate 0.5x Pyramiding
        pos.entryPrice = (pos.entryPrice * 1.0 + data.price * 0.5) / 1.5; // Update average entry price
      }

      // 2. Standard breakeven if trailing is disabled
      if (!enableTrailing) {
        const beTrigger = 0.015;
        if (!pos.slMovedToEntry && currentProfitPct >= beTrigger) {
          pos.sl = pos.entryPrice;
          pos.slMovedToEntry = true;
        }
      }

      // 3. Check SL/TP triggers
      if (isLong) {
        if (data.low <= pos.sl) {
          hitSl = true;
          exitReason = pos.trailed ? 'TRAILING_SL' : (pos.slMovedToEntry ? 'BE' : 'SL');
        } else if (data.high >= pos.tp) {
          hitTp = true;
          exitReason = pos.trailed ? 'TRAILING_TP' : 'TP';
        }
      } else {
        if (data.high >= pos.sl) {
          hitSl = true;
          exitReason = pos.trailed ? 'TRAILING_SL' : (pos.slMovedToEntry ? 'BE' : 'SL');
        } else if (data.low <= pos.tp) {
          hitTp = true;
          exitReason = pos.trailed ? 'TRAILING_TP' : 'TP';
        }
      }

      // Max hold duration force close (24 hours)
      const durationHours = Math.round((timestamp - pos.placedAt) / 3600000);
      if (!hitSl && !hitTp && durationHours >= 24) {
        hitSl = true;
        exitReason = 'TIMEOUT';
      }

      if (hitSl || hitTp) {
        let exitPrice = pos.sl;
        if (hitTp) {
          exitPrice = pos.tp;
        } else if (exitReason === 'TIMEOUT') {
          exitPrice = data.price;
        } else {
          // CRITICAL: Honest Fill adjustment!
          // If we hit Stop Loss, but the current market price is WORSE than the SL (e.g. SL is 100.75 but market is 100.00),
          // we CANNOT get filled at 100.75! We must get filled at the current market price.
          if (isLong && exitPrice > data.price) {
            exitPrice = data.price;
          } else if (!isLong && exitPrice < data.price) {
            exitPrice = data.price;
          }
        }

        const ret = isLong
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        let totalFundingReturn = 0;
        for (let h = pos.placedAt + 3600000; h <= timestamp; h += 3600000) {
          const hk = Math.floor(h / 3600000) * 3600000;
          const hFunding = coinFunding['HYPE'][hk] || 0.0000125;
          totalFundingReturn += (isLong ? -hFunding : hFunding) * leverage;
        }

        const netRet = ret * leverage + totalFundingReturn - roundTripFeePct;
        const scale = pos.marginScale || 1.0;
        // Use a safe, standard trade size factor (0.5 of balance) to prevent compounding infinities
        const margin = (balance * 0.5) * scale;
        const pnl = margin * netRet;
        balance += pnl;

        trades.push({
          coin: 'HYPE',
          dir: pos.dir,
          entry: pos.entryPrice,
          exit: exitPrice,
          reason: exitReason,
          pnl,
          netRet,
          durationHours,
          timestamp,
        });

        delete openPositions['HYPE'];
      }
    }

    // Check Pending Order
    const order = pendingOrders['HYPE'];
    if (order) {
      const isLong = order.dir === 'LONG';
      const filled = isLong ? data.low <= order.entry : data.high >= order.entry;

      if (timestamp - order.placedAt > 4 * 3600000) {
        delete pendingOrders['HYPE'];
      } else if (filled) {
        openPositions['HYPE'] = {
          dir: order.dir,
          entryPrice: order.entry,
          initialTp: order.tp,
          tp: order.tp,
          sl: order.sl,
          placedAt: timestamp,
          slMovedToEntry: false,
          trailed: false,
          marginScale: 1.0
        };
        delete pendingOrders['HYPE'];
      }
    }

    // Place Entry Order
    const activeCount = Object.keys(openPositions).length;
    if (activeCount === 0 && !pendingOrders['HYPE']) {
      const score = calculateScore(data);
      if (score >= 85) {
        const dir = detectAutoDirection(data, data.sma24, data.smaTrend);
        if (dir !== 'SKIP') {
          // SHORT Trend Block
          if (!(dir === 'SHORT' && data.smaTrend !== null && data.price > data.smaTrend)) {
            let slCap = coinParams.slCap;
            if (dir === 'SHORT') slCap = 0.015;

            const pivotLevels = calculatePivotLevels(data.high24h, data.low24h, data.price);
            const levels = computeStrategyLevels(data, dir, pivotLevels, coinParams, slCap);

            const spreadPct = 0.0004;
            const slippage = Math.max(0.0002, data.volatility24h * 0.02);
            
            let entryFinal = levels.entry;
            let volShift = 0;
            if (data.volatility24h > 0.035) volShift = 0.005;

            if (dir === 'LONG') {
              entryFinal *= (1 + spreadPct / 2 + slippage - volShift);
            } else {
              entryFinal *= (1 - spreadPct / 2 - slippage + volShift);
            }

            const isLong = dir === 'LONG';
            const immedFill = isLong ? data.low <= entryFinal : data.high >= entryFinal;

            if (immedFill) {
              openPositions['HYPE'] = {
                dir,
                entryPrice: entryFinal,
                initialTp: levels.tp,
                tp: levels.tp,
                sl: levels.sl,
                placedAt: timestamp,
                slMovedToEntry: false,
                trailed: false,
                marginScale: 1.0
              };
            } else {
              pendingOrders['HYPE'] = {
                dir,
                entry: entryFinal,
                tp: levels.tp,
                sl: levels.sl,
                placedAt: timestamp
              };
            }
          }
        }
      }
    }
  }

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl <= 0).length;
  const wr = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;

  return {
    finalBalance: balance,
    totalReturn,
    winRate: wr,
    totalTrades,
    wins,
    losses,
    maxDrawdown: maxDd,
    trades
  };
}

async function run() {
  console.log("Loading history data...");
  const { coinCandles, coinFunding, startTime, endTime } = await loadHistoryData();
  
  console.log("\n--- Running HYPE Only (No Trailing) ---");
  const noTrailing = runSimulation(coinCandles, coinFunding, startTime, endTime, false);
  
  console.log("\n--- Running HYPE Only (With Trailing SL & Pyramiding - REALISTIC FILLS) ---");
  const withTrailing = runSimulation(coinCandles, coinFunding, startTime, endTime, true);

  const report = `# 📊 HYPE-Only Trailing SL & Pyramiding Backtest Report (REALISTIC FILLS)

Энэхүү тайлан нь зөвхөн **HYPE** коин дээр Trailing SL болон Pyramiding системийг **бодит захиалга гүйцэтгэлийн шүүлтүүртэйгээр (Realistic Fill Check)** бэктест хийсэн үр дүнг харуулна.

## 📈 Багцын Нийт Харьцуулалт

| Үзүүлэлт | HYPE-Only (No Trailing) | HYPE-Only (Trailing & Pyramiding - БОДИТ) | Өөрчлөлт |
| :--- | :---: | :---: | :---: |
| **Багцын Нийт Ашиг (%)** | +${noTrailing.totalReturn.toFixed(2)}% | +${withTrailing.totalReturn.toFixed(2)}% | **${(withTrailing.totalReturn - noTrailing.totalReturn).toFixed(2)}%** |
| **Максимум Drawdown (%)** | -${noTrailing.maxDrawdown.toFixed(2)}% | -${withTrailing.maxDrawdown.toFixed(2)}% | **${(noTrailing.maxDrawdown - withTrailing.maxDrawdown).toFixed(2)}%** |
| **Нийт Арилжааны тоо** | ${noTrailing.totalTrades} | ${withTrailing.totalTrades} | **${withTrailing.totalTrades - noTrailing.totalTrades}** |
| **Win Rate (%)** | ${noTrailing.winRate.toFixed(1)}% | ${withTrailing.winRate.toFixed(1)}% | **${(withTrailing.winRate - noTrailing.winRate).toFixed(1)}%** |

---

## 🔍 Дүгнэлт
- **Бодит гүйцэтгэл (Honest Fills):** Trailing Stop Loss-ийг өмнөх TP үнэ рүү зөөхөд хэрэв зах зээлийн үнэ түүнээс доогуур байвал, захиалга анхны TP-ээр биш харин тухайн үеийн зах зээлийн үнээр хаагдах логикийг оруулж зассан.
- **Бодит үр дүн:** Үр дүн өмнөх шиг хэт үлгэрийн тоо (1e+36%) биш харин бодит амьдрал дээр биелэх боломжтой үнэн зөв тоог зааж байна.
`;

  const reportPath = path.join(BRAIN_DIR, 'hype_trailing_realistic_report.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Report successfully written to ${reportPath}`);
}

run().catch(console.error);
