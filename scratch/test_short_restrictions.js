import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';
import path from 'path';

const coins = ['BTC', 'XRP', 'SUI', 'HYPE'];
const DAYS = 180;
const maxConcurrentPositions = 2;
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
    const candles = [];
    let cur = startTime - 200 * 3600000;
    while (cur < endTime) {
      await sleep(250);
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
        console.warn(`  [Candle Fetch Error] ${e.message}`);
        await sleep(1000);
        cur -= chunkMs;
      }
      cur += chunkMs;
    }
    coinCandles[coin] = candles;

    const fundingMap = {};
    cur = startTime;
    while (cur < endTime) {
      await sleep(250);
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
        console.warn(`  [Funding Fetch Error] ${e.message}`);
        await sleep(1000);
        cur -= chunkMs;
      }
      cur += chunkMs;
    }
    coinFunding[coin] = fundingMap;
  }

  return { coinCandles, coinFunding, startTime, endTime };
}

function runSimulation(coinCandles, coinFunding, startTime, endTime, mode, shortMinScore = 85) {
  let balance = initialBalance;
  let peak = balance;
  let maxDd = 0;

  const openPositions = {};
  const pendingOrders = {};
  const consecutiveLosses = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const cooldownUntil = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const trades = [];

  const stepMs = 3600000;

  const coinParams = {
    BTC:  { tpCap: 0.02,  slCap: 0.015, trendPeriod: 200, cooldownEnabled: false },
    XRP:  { tpCap: 0.02,  slCap: 0.03,  trendPeriod: 50,  cooldownEnabled: false },
    SUI:  { tpCap: 0.02,  slCap: 0.02,  trendPeriod: 200, cooldownEnabled: true  },
    HYPE: { tpCap: 0.05,  slCap: 0.015, trendPeriod: 24,  cooldownEnabled: true  },
  };
  
  const pointers = {};
  for (const coin of coins) {
    pointers[coin] = coinCandles[coin].findIndex(c => c.t >= startTime);
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
      if (!c || Math.abs(c.t - timestamp) > 1800000) {
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

      const params = coinParams[coin];
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

        if (coinParams[coin].cooldownEnabled) {
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

        // Apply Mode Restrictions
        if (mode === 'LONG_ONLY' && dir === 'SHORT') continue;
        if (mode === 'RESTRICTED_SHORT' && dir === 'SHORT' && score < shortMinScore) continue;

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
        const params = coinParams[cand.coin];
        
        let slCap = params.slCap;
        if (cand.dir === 'SHORT') {
          slCap = 0.015;
        }

        const pivotLevels = calculatePivotLevels(cand.data.high24h, cand.data.low24h, cand.data.price);
        const levels = computeStrategyLevels(cand.data, cand.dir, pivotLevels, params, slCap);

        const spreadPct = 0.0004;
        const slippage = Math.max(0.0002, cand.data.volatility24h * 0.02);
        
        let entryFinal = levels.entry;
        
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
  
  console.log("\n--- Running Baseline (Standard: BTC TP 2% + Normal Shorts) ---");
  const baseline = runSimulation(coinCandles, coinFunding, startTime, endTime, 'NORMAL');
  
  console.log("\n--- Running Experiment 1 (LONG Only) ---");
  const longOnly = runSimulation(coinCandles, coinFunding, startTime, endTime, 'LONG_ONLY');
  
  console.log("\n--- Running Experiment 2 (SHORT Score Threshold >= 90) ---");
  const short90 = runSimulation(coinCandles, coinFunding, startTime, endTime, 'RESTRICTED_SHORT', 90);
  
  console.log("\n--- Running Experiment 3 (SHORT Score Threshold >= 95) ---");
  const short95 = runSimulation(coinCandles, coinFunding, startTime, endTime, 'RESTRICTED_SHORT', 95);

  const report = `# 🛡️ SHORT Restrictions Backtest Report

Энэхүү тайлан нь багцын алдагдлыг бууруулахын тулд SHORT арилжааг бүрэн хаах эсвэл илүү өндөр босготой (Stricter Score Threshold) оруулах дүрмүүдийг бэктест хийж харьцуулна.

## 📈 Багцын Нийт Харьцуулалт

| Туршилтын хувилбар | Багцын Нийт Ашиг (%) | Максимум Drawdown (%) | Нийт Арилжаа | Хожсон (Wins) | Алдсан (Losses) | Win Rate (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Baseline (Одоогийн хамгийн шилдэг)** | +${baseline.totalReturn.toFixed(2)}% | -${baseline.maxDrawdown.toFixed(2)}% | ${baseline.totalTrades} | ${baseline.wins} | ${baseline.losses} | ${baseline.winRate.toFixed(1)}% |
| **LONG-Only (SHORT-ийг бүрэн хаасан)** | +${longOnly.totalReturn.toFixed(2)}% | -${longOnly.maxDrawdown.toFixed(2)}% | ${longOnly.totalTrades} | ${longOnly.wins} | ${longOnly.losses} | ${longOnly.winRate.toFixed(1)}% |
| **SHORT Score >= 90 (Босгыг чангалах)** | +${short90.totalReturn.toFixed(2)}% | -${short90.maxDrawdown.toFixed(2)}% | ${short90.totalTrades} | ${short90.wins} | ${short90.losses} | ${short90.winRate.toFixed(1)}% |
| **SHORT Score >= 95 (Маш өндөр чангалалт)** | +${short95.totalReturn.toFixed(2)}% | -${short95.maxDrawdown.toFixed(2)}% | ${short95.totalTrades} | ${short95.wins} | ${short95.losses} | ${short95.winRate.toFixed(1)}% |

---

## 🔍 Дүгнэлт
- **LONG-Only хувилбар:** SHORT арилжааг бүрэн хааснаар ашиг болон drawdown хэрхэн өөрчлөгдсөнийг хүснэгтээс харна уу. Арилжааны тоо ихээр буурч, зарим нэг уналтын үеийн ашигтай SHORT боломжуудыг алдсан байж болно.
- **SHORT Score-ийн босго чангалах (>= 90 эсвэл >= 95):** Бүрэн хаахын оронд зөвхөн маш хүчтэй, өндөр оноотой (>= 90) SHORT дохионуудыг зөвшөөрснөөр олон сул SHORT алдагдлуудыг шүүж, ашиг болон эрсдэлийг илүү тэнцвэржүүлэх боломжтой.
`;

  const reportPath = path.join(BRAIN_DIR, 'short_restrictions_report.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Report successfully written to ${reportPath}`);
}

run().catch(console.error);
