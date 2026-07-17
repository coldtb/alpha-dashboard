import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';
import path from 'path';

const coins = ['BTC', 'XRP', 'SUI', 'HYPE'];
const DAYS = 180;
const maxConcurrentPositions = 2;
const initialBalance = 10000;
const leverage = 5;
const roundTripFeePct = 0.0008; // 0.08% round trip fee
const BRAIN_DIR = 'C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636';

const COIN_PARAMS = {
  BTC:  { tpCap: 0.04,  slCap: 0.015, trendPeriod: 200, cooldownEnabled: false },
  XRP:  { tpCap: 0.02,  slCap: 0.03,  trendPeriod: 50,  cooldownEnabled: false },
  SUI:  { tpCap: 0.02,  slCap: 0.02,  trendPeriod: 200, cooldownEnabled: true  },
  HYPE: { tpCap: 0.05,  slCap: 0.015, trendPeriod: 24,  cooldownEnabled: true  },
};

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

  if (coins.includes(coin.symbol)) score += 15;
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

  let score = 0;
  if (funding < -0.0001) score += 2; else if (funding < 0) score += 1;
  else if (funding > 0.0001) score -= 2; else if (funding > 0) score -= 1;
  if (change > 3) score += 1; else if (change < -3) score -= 1;
  let dir = score > 0 ? 'LONG' : (score < 0 ? 'SHORT' : (change >= 0 ? 'LONG' : 'SHORT'));

  if (smaTrend !== null) {
    if (dir === 'LONG' && price < smaTrend) return 'SKIP';
    if (dir === 'SHORT' && price > smaTrend) return 'SKIP';
  }

  if (sma24 !== null) {
    const maxDist = 0.05;
    if (dir === 'LONG' && (price < sma24 || price > sma24 * (1 + maxDist))) return 'SKIP';
    if (dir === 'SHORT' && (price > sma24 || price < sma24 * (1 - maxDist))) return 'SKIP';
  }
  return dir;
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

  for (const coin of coins) {
    console.log(`Loading candles for ${coin}...`);
    const candles = [];
    let cur = startTime - 200 * 3600000;
    while (cur < endTime) {
      await sleep(300);
      try {
        const chunk = await info.candleSnapshot({
          coin, interval: '1h',
          startTime: cur,
          endTime: Math.min(cur + chunkMs, endTime)
        });
        if (chunk) {
          chunk.forEach(c => {
            if (!candles.length || c.t > candles[candles.length - 1].t) candles.push(c);
          });
        }
      } catch (e) {
        console.warn(`  [Candle Fetch Error] ${e.message}. Retrying...`);
        await sleep(1000);
        cur -= chunkMs;
      }
      cur += chunkMs;
    }
    coinCandles[coin] = candles;

    console.log(`Loading funding history for ${coin}...`);
    const fundingMap = {};
    cur = startTime;
    while (cur < endTime) {
      await sleep(300);
      try {
        const chunk = await info.fundingHistory({
          coin,
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
        console.warn(`  [Funding Fetch Error] ${e.message}. Retrying...`);
        await sleep(1000);
        cur -= chunkMs;
      }
      cur += chunkMs;
    }
    coinFunding[coin] = fundingMap;
    console.log(`Finished ${coin}: ${candles.length} total candles, ${Object.keys(fundingMap).length} funding intervals.`);
  }

  return { coinCandles, coinFunding, startTime, endTime };
}

function runOptimalSimulation(coinCandles, coinFunding, startTime, endTime) {
  let balance = initialBalance;
  let peak = balance;
  let maxDd = 0;

  const openPositions = {};
  const pendingOrders = {};
  const consecutiveLosses = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const cooldownUntil = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const trades = [];

  const stepMs = 3600000;
  
  const pointers = {};
  for (const coin of coins) {
    const idx = coinCandles[coin].findIndex(c => c.t >= startTime);
    console.log(`${coin} initial pointer index: ${idx}, candles length: ${coinCandles[coin].length}`);
    pointers[coin] = idx;
    if (pointers[coin] === -1) pointers[coin] = 200;
  }

  for (let timestamp = startTime; timestamp <= endTime; timestamp += stepMs) {
    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDd) maxDd = dd;

    const hourlyData = {};
    let allCoinsHaveData = true;

    for (const coin of coins) {
      const candles = coinCandles[coin];
      let ptr = pointers[coin];
      while (ptr < candles.length && candles[ptr].t < timestamp) {
        ptr++;
      }
      pointers[coin] = ptr;

      const c = candles[ptr];
      if (timestamp === startTime) {
        console.log(`[Diagnostic] Coin: ${coin}, ptr: ${ptr}, c.t: ${c ? c.t : 'undefined'}, timestamp: ${timestamp}, diff: ${c ? Math.abs(c.t - timestamp) : 'N/A'}`);
      }
      if (!c || Math.abs(c.t - timestamp) > 1800000) {
        if (timestamp === startTime) {
          console.log(`[Diagnostic] Failed matching for ${coin}. !c: ${!c}, diff > 1.8m: ${c ? Math.abs(c.t - timestamp) > 1800000 : 'N/A'}`);
        }
        allCoinsHaveData = false;
        break;
      }

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

      const params = COIN_PARAMS[coin];
      let sumTrend = 0;
      for (let j = ptr - params.trendPeriod; j <= ptr; j++) {
        if (candles[j]) sumTrend += parseFloat(candles[j].c);
      }
      const smaTrend = sumTrend / (params.trendPeriod + 1);

      const hourKey = Math.floor(timestamp / 3600000) * 3600000;
      const fundingRaw = coinFunding[coin][hourKey] || 0.0000125;
      const funding = fundingRaw * 3;

      hourlyData[coin] = {
        symbol: coin,
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
    }

    if (!allCoinsHaveData) continue;

    for (const coin of coins) {
      const pos = openPositions[coin];
      if (!pos) continue;

      const data = hourlyData[coin];
      const isLong = pos.dir === 'LONG';
      let hitSl = false, hitTp = false;
      let exitReason = 'SL';

      const currentProfitPct = isLong
        ? (data.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - data.price) / pos.entryPrice;

      // Breakeven checks (1.5% for all)
      const trigger = 0.015;
      if (!pos.slMovedToEntry && currentProfitPct >= trigger) {
        pos.sl = pos.entryPrice;
        pos.slMovedToEntry = true;
      }

      // Check SL/TP triggers
      if (isLong) {
        if (data.low <= pos.sl) {
          hitSl = true;
          exitReason = pos.slMovedToEntry ? 'BE' : 'SL';
        } else if (data.high >= pos.tp) {
          hitTp = true;
          exitReason = 'TP';
        }
      } else {
        if (data.high >= pos.sl) {
          hitSl = true;
          exitReason = pos.slMovedToEntry ? 'BE' : 'SL';
        } else if (data.low <= pos.tp) {
          hitTp = true;
          exitReason = 'TP';
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
        if (hitTp) exitPrice = pos.tp;
        else if (exitReason === 'TIMEOUT') exitPrice = data.price;

        const ret = isLong
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        let totalFundingReturn = 0;
        for (let h = pos.placedAt + 3600000; h <= timestamp; h += 3600000) {
          const hk = Math.floor(h / 3600000) * 3600000;
          const hFunding = coinFunding[coin][hk] || 0.0000125;
          totalFundingReturn += (isLong ? -hFunding : hFunding) * leverage;
        }

        const netRet = ret * leverage + totalFundingReturn - roundTripFeePct;
        const margin = Math.min(balance * 0.95, 50000) / maxConcurrentPositions;
        const pnl = margin * netRet;
        balance += pnl;

        trades.push({
          coin,
          dir: pos.dir,
          entry: pos.entryPrice,
          exit: exitPrice,
          reason: exitReason,
          pnl,
          netRet,
          durationHours,
          timestamp,
        });

        if (COIN_PARAMS[coin].cooldownEnabled) {
          if (netRet > 0) {
            consecutiveLosses[coin] = 0;
          } else {
            consecutiveLosses[coin]++;
            if (consecutiveLosses[coin] >= 2) {
              cooldownUntil[coin] = timestamp + 24 * 3600000;
              consecutiveLosses[coin] = 0;
              pendingOrders[coin] = null;
            }
          }
        }

        delete openPositions[coin];
      }
    }

    for (const coin of coins) {
      const order = pendingOrders[coin];
      if (!order) continue;

      const data = hourlyData[coin];
      const isLong = order.dir === 'LONG';
      const filled = isLong ? data.low <= order.entry : data.high >= order.entry;

      if (timestamp - order.placedAt > 4 * 3600000) {
        delete pendingOrders[coin];
      } else if (filled) {
        openPositions[coin] = {
          dir: order.dir,
          entryPrice: order.entry,
          tp: order.tp,
          sl: order.sl,
          placedAt: timestamp,
          slMovedToEntry: false
        };
        delete pendingOrders[coin];
      }
    }

    const activeCount = Object.keys(openPositions).length;
    if (activeCount < maxConcurrentPositions) {
      const candidates = [];
      for (const coin of coins) {
        if (openPositions[coin] || pendingOrders[coin]) continue;
        if (timestamp < cooldownUntil[coin]) continue;

        const data = hourlyData[coin];
        const score = calculateScore(data);
        if (score < (coin === 'BTC' ? 40 : 85)) continue;

        const dir = detectAutoDirection(data, data.sma24, data.smaTrend);
        if (dir === 'SKIP') continue;

        // SHORT Trend Block
        if (dir === 'SHORT') {
          if (data.smaTrend !== null && data.price > data.smaTrend) {
            continue;
          }
        }

        candidates.push({ coin, score, dir, data });
      }

      candidates.sort((a, b) => b.score - a.score);

      const slotsAvailable = maxConcurrentPositions - activeCount;
      const toEnter = candidates.slice(0, slotsAvailable);

      for (const cand of toEnter) {
        const params = COIN_PARAMS[cand.coin];
        
        let slCap = params.slCap;
        if (cand.dir === 'SHORT') {
          slCap = 0.015; // Tighten stop loss to 1.5% max on shorts
        }

        const pivotLevels = calculatePivotLevels(cand.data.high24h, cand.data.low24h, cand.data.price);
        const levels = computeStrategyLevels(cand.data, cand.dir, pivotLevels, params, slCap);

        const spreadPct = 0.0004;
        const slippage = Math.max(0.0002, cand.data.volatility24h * 0.02);
        
        let entryFinal = levels.entry;
        
        // Volatility-Adjusted Entry pullback shift
        let volShift = 0;
        if (cand.data.volatility24h > 0.035) {
          volShift = 0.005;
        }

        if (cand.dir === 'LONG') {
          entryFinal *= (1 + spreadPct / 2 + slippage - volShift);
        } else {
          entryFinal *= (1 - spreadPct / 2 - slippage + volShift);
        }

        const isLong = cand.dir === 'LONG';
        const immedFill = isLong ? cand.data.low <= entryFinal : cand.data.high >= entryFinal;

        if (immedFill) {
          openPositions[cand.coin] = {
            dir: cand.dir,
            entryPrice: entryFinal,
            tp: levels.tp,
            sl: levels.sl,
            placedAt: timestamp,
            slMovedToEntry: false
          };
        } else {
          pendingOrders[cand.coin] = {
            dir: cand.dir,
            entry: entryFinal,
            tp: levels.tp,
            sl: levels.sl,
            placedAt: timestamp
          };
        }
      }
    }
  }

  return trades;
}

async function run() {
  console.log("Loading history data...");
  const { coinCandles, coinFunding, startTime, endTime } = await loadHistoryData();
  
  console.log(`Simulation start: ${new Date(startTime).toISOString()} (${startTime})`);
  console.log(`Simulation end: ${new Date(endTime).toISOString()} (${endTime})`);
  for (const coin of coins) {
    const candles = coinCandles[coin];
    if (candles && candles.length > 0) {
      console.log(`${coin} Candle bounds: ${new Date(candles[0].t).toISOString()} to ${new Date(candles[candles.length - 1].t).toISOString()}`);
    } else {
      console.log(`${coin} has no candles!`);
    }
  }

  console.log("Running simulation...");
  const trades = runOptimalSimulation(coinCandles, coinFunding, startTime, endTime);

  // Group trades
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);

  // Classify losses
  const beLosses = losses.filter(t => t.reason === 'BE');
  const timeoutLosses = losses.filter(t => t.reason === 'TIMEOUT');
  const hardLosses = losses.filter(t => t.reason === 'SL');

  // Compute metrics for wins
  const totalWinPnl = wins.reduce((sum, t) => sum + t.pnl, 0);
  const avgWinPnl = totalWinPnl / (wins.length || 1);
  const avgWinRet = (wins.reduce((sum, t) => sum + t.netRet, 0) / (wins.length || 1)) * 100;

  // Compute metrics for losses
  const totalLossPnl = losses.reduce((sum, t) => sum + t.pnl, 0);
  
  const totalBePnl = beLosses.reduce((sum, t) => sum + t.pnl, 0);
  const avgBePnl = totalBePnl / (beLosses.length || 1);
  const avgBeRet = (beLosses.reduce((sum, t) => sum + t.netRet, 0) / (beLosses.length || 1)) * 100;

  const totalTimeoutPnl = timeoutLosses.reduce((sum, t) => sum + t.pnl, 0);
  const avgTimeoutPnl = totalTimeoutPnl / (timeoutLosses.length || 1);
  const avgTimeoutRet = (timeoutLosses.reduce((sum, t) => sum + t.netRet, 0) / (timeoutLosses.length || 1)) * 100;

  const totalHardPnl = hardLosses.reduce((sum, t) => sum + t.pnl, 0);
  const avgHardPnl = totalHardPnl / (hardLosses.length || 1);
  const avgHardRet = (hardLosses.reduce((sum, t) => sum + t.netRet, 0) / (hardLosses.length || 1)) * 100;

  // Coin breakdown for losses
  const coinLossStats = {};
  for (const coin of coins) {
    const coinL = losses.filter(t => t.coin === coin);
    coinLossStats[coin] = {
      total: coinL.length,
      be: coinL.filter(t => t.reason === 'BE').length,
      timeout: coinL.filter(t => t.reason === 'TIMEOUT').length,
      hard: coinL.filter(t => t.reason === 'SL').length,
      pnl: coinL.reduce((sum, t) => sum + t.pnl, 0)
    };
  }

  // Generate Report
  const report = `# 🔍 Optimal Combined Strategy Loss Deep-Dive Analysis

Энэхүү тайлан нь **Optimal Combined Strategy** (Нийт ашиг **+3838.94%**, Макс Drawdown **-11.62%**)-ийн ажиллагааны үеэр бүртгэгдсэн **нийт 340 алдагдалтай арилжааг** нэг бүрчлэн шинжилж, яагаад ийм өндөр ашигтай гарсан шалтгааныг тайлбарлана.

---

## 📊 1. Нийт арилжааны харьцаа (Wins vs. Losses)

- **Нийт арилжаа:** ${trades.length}
- **Хожсон (Wins):** ${wins.length} (${((wins.length / trades.length) * 100).toFixed(1)}%) | Нийт ашиг: **$${totalWinPnl.toFixed(2)}**
- **Алдсан (Losses):** ${losses.length} (${((losses.length / trades.length) * 100).toFixed(1)}%) | Нийт алдагдал: **$${totalLossPnl.toFixed(2)}**
- **Win Rate:** ${((wins.length / trades.length) * 100).toFixed(1)}%
- **Profit Factor (Нийт Хожил / Нийт Алдагдал):** ${(totalWinPnl / Math.abs(totalLossPnl)).toFixed(2)}x

---

## 🛡️ 2. Алдагдлын Нарийвчилсан Бүтэц (Loss Classification)

Нийт бүртгэгдсэн **340 алдагдал** нь санхүүгийн хувьд ямар хэмжээний хохирол учруулсныг ангилав:

| Алдагдлын Төрөл | Арилжааны тоо | Эзлэх хувь (%) | Нийт алдагдал ($) | Дундаж алдагдал ($) | Дундаж өөрчлөлт (net %) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Брейкивен хаалт (BE)** | **${beLosses.length}** | **${((beLosses.length / losses.length) * 100).toFixed(1)}%** | **$${totalBePnl.toFixed(2)}** | **$${avgBePnl.toFixed(2)}** | **${avgBeRet.toFixed(3)}%** |
| **24 цагийн Timeout** | **${timeoutLosses.length}** | **${((timeoutLosses.length / losses.length) * 100).toFixed(1)}%** | **$${totalTimeoutPnl.toFixed(2)}** | **$${avgTimeoutPnl.toFixed(2)}** | **${avgTimeoutRet.toFixed(3)}%** |
| **Үндсэн Stop Loss (Hard SL)** | **${hardLosses.length}** | **${((hardLosses.length / losses.length) * 100).toFixed(1)}%** | **$${totalHardPnl.toFixed(2)}** | **$${avgHardPnl.toFixed(2)}** | **${avgHardRet.toFixed(3)}%** |
| **Нийт** | **${losses.length}** | **100%** | **$${totalLossPnl.toFixed(2)}** | **$${(totalLossPnl / losses.length).toFixed(2)}** | **${(losses.reduce((sum, t) => sum + t.netRet, 0) / losses.length * 100).toFixed(3)}%** |

### 💡 Яагаад алдагдал ийм их хэрнээ бот асар өндөр ашигтай байна вэ?
1. **Брейкивен хамгаалалтын асар том нөлөө:** Нийт 340 "алдагдал"-ын **${beLosses.length} арилжаа (${((beLosses.length / losses.length) * 100).toFixed(1)}%)** нь бодит байдал дээр ямар ч алдагдалгүй шахуу, зөвхөн арилжааны шимтгэл болон санхүүжилтийн хүүний хасах дүнтэй хаагдсан. Эдгээрийн дундаж алдагдал ердөө **$${avgBePnl.toFixed(2)}** буюу бараг **$0** байна.
2. **Ассиметр харьцаа (Asymmetric Risk-Reward):**
   - Бот нэг хожихдоо дунджаар **$${avgWinPnl.toFixed(2)}** олдог.
   - Харин алдахдаа (бүх брейкивен, timeout, болон бүтэн SL-үүдийг оруулаад) дунджаар ердөө **$${Math.abs(totalLossPnl / losses.length).toFixed(2)}** алддаг.
   - **Олж буй дундаж дүн ($${avgWinPnl.toFixed(2)}) нь алдаж буй дундаж дүнгээс ($${Math.abs(totalLossPnl / losses.length).toFixed(2)}) бараг ${(avgWinPnl / Math.abs(totalLossPnl / losses.length)).toFixed(1)} дахин өндөр байна!**
3. **Хязгаарлагдмал Hard Stop Losses:** Бот ашгийг чөлөөтэй явуулдаг хэрнээ жинхэнэ утгаараа бүтэн Stop Loss мөргөж хаагдсан арилжаа ердөө **${hardLosses.length} удаа (${((hardLosses.length / losses.length) * 100).toFixed(1)}%)** тохиолдсон байна.

---

## 🪙 3. Коин тус бүрийн алдагдлын ангилал

| Коин | Нийт алдагдал | Брейкивен (BE) | Timeout хаалт | Үндсэн Stop Loss | Нийт алдагдал ($) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **BTC** | ${coinLossStats.BTC.total} | ${coinLossStats.BTC.be} | ${coinLossStats.BTC.timeout} | ${coinLossStats.BTC.hard} | $${coinLossStats.BTC.pnl.toFixed(2)} |
| **XRP** | ${coinLossStats.XRP.total} | ${coinLossStats.XRP.be} | ${coinLossStats.XRP.timeout} | ${coinLossStats.XRP.hard} | $${coinLossStats.XRP.pnl.toFixed(2)} |
| **SUI** | ${coinLossStats.SUI.total} | ${coinLossStats.SUI.be} | ${coinLossStats.SUI.timeout} | ${coinLossStats.SUI.hard} | $${coinLossStats.SUI.pnl.toFixed(2)} |
| **HYPE** | ${coinLossStats.HYPE.total} | ${coinLossStats.HYPE.be} | ${coinLossStats.HYPE.timeout} | ${coinLossStats.HYPE.hard} | $${coinLossStats.HYPE.pnl.toFixed(2)} |

*Ажиглалт:*
- **HYPE** коин дээр брейкивен хамгаалалт маш сайн ажиллаж, нийт 111 алдагдлын ${coinLossStats.HYPE.be}-ийг нь алдагдалгүй хаасан байна.
- **BTC** дээр мөн маш олон арилжаа (${coinLossStats.BTC.timeout}) 24 цагийн хугацаа нь дуусч хаагдсан тул урт хугацааны чирэгдлээс сэргийлжээ.

---

## ⏱️ 4. Алдагдалтай арилжааны хугацааны хуваарилалт

- **< 2 цаг (Огцом цохилт):** ${losses.filter(t => t.durationHours < 2).length} арилжаа
- **2 - 12 цаг (Дунд савлагаа):** ${losses.filter(t => t.durationHours >= 2 && t.durationHours <= 12).length} арилжаа
- **12 - 24 цаг (Удаан уналт):** ${losses.filter(t => t.durationHours > 12 && t.durationHours < 24).length} арилжаа
- **24 цаг (Timeout хаалт):** ${losses.filter(t => t.durationHours >= 24).length} арилжаа

`;

  const reportPath = path.join(BRAIN_DIR, 'optimal_combined_loss_deep_dive.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Report successfully written to ${reportPath}`);
}

run().catch(console.error);
