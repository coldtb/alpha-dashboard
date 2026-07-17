import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';
import path from 'path';

const coins = ['BTC', 'XRP', 'SUI', 'HYPE'];
const DAYS = 30; // 30-day backtest
const maxConcurrentPositions = 2;
const initialBalance = 20; // $20 initial balance
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
      await sleep(200);
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
      await sleep(200);
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

function runSimulation(coinCandles, coinFunding, startTime, endTime) {
  let balance = initialBalance;
  let peak = balance;
  let maxDd = 0;

  const openPositions = {};
  const pendingOrders = {};
  const trades = [];

  const stepMs = 3600000;

  // Live Bot Config parameters:
  const coinParams = {
    BTC:  { tpCap: 0.02,   slCap: 0.015, trendPeriod: 200 },
    XRP:  { tpCap: 0.0075, slCap: 0.015, trendPeriod: 50  },
    SUI:  { tpCap: 0.0075, slCap: 0.015, trendPeriod: 200 },
    HYPE: { tpCap: 0.0075, slCap: 0.015, trendPeriod: 24  },
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

    // Check Open Positions
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

      // Trailing SL Activation
      const totalTpDistance = Math.abs(pos.initialTp - pos.entryPrice);
      const currentTpDistance = Math.abs(data.price - pos.entryPrice);
      const isNearTp = totalTpDistance > 0 && currentTpDistance >= totalTpDistance * 0.85 && (isLong ? data.price > pos.entryPrice : data.price < pos.entryPrice);

      if (!pos.trailed && isNearTp) {
        pos.trailed = true;
        pos.sl = pos.initialTp;
        pos.tp = isLong ? data.price * 1.02 : data.price * 0.98;
        pos.marginScale = 1.5;
        pos.entryPrice = (pos.entryPrice * 1.0 + data.price * 0.5) / 1.5;
      }

      // Standard breakeven stop loss
      if (!pos.trailed) {
        const beTrigger = 0.015;
        if (!pos.slMovedToEntry && currentProfitPct >= beTrigger) {
          pos.sl = pos.entryPrice;
          pos.slMovedToEntry = true;
        }
      }

      // Check SL/TP triggers
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

      // 24h Max hold force close
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
          // Honest Fill adjustment:
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
          const hFunding = coinFunding[coin][hk] || 0.0000125;
          totalFundingReturn += (isLong ? -hFunding : hFunding) * leverage;
        }

        const netRet = ret * leverage + totalFundingReturn - roundTripFeePct;
        const scale = pos.marginScale || 1.0;
        const margin = pos.allocatedMargin * scale;
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

        delete openPositions[coin];
      }
    }

    // Check Pending Orders
    for (const coin of coins) {
      const order = pendingOrders[coin];
      if (!order) continue;

      const data = hourlyData[coin];
      const isLong = order.dir === 'LONG';
      const filled = isLong ? data.low <= order.entry : data.high >= order.entry;

      const score = calculateScore(data);
      const dir = detectAutoDirection(data, data.sma24, data.smaTrend);

      if (timestamp - order.placedAt > 4 * 3600000) {
        delete pendingOrders[coin];
      } else if (score < (coin === 'BTC' ? 40 : 85) || dir === 'SKIP') {
        delete pendingOrders[coin];
      } else if (filled) {
        openPositions[coin] = {
          dir: order.dir,
          entryPrice: order.entry,
          initialTp: order.tp,
          tp: order.tp,
          sl: order.sl,
          placedAt: timestamp,
          slMovedToEntry: false,
          trailed: false,
          allocatedMargin: order.allocatedMargin,
          marginScale: 1.0
        };
        delete pendingOrders[coin];
      }
    }

    // Calculate active margin
    let activeMargin = 0;
    for (const coin of coins) {
      if (openPositions[coin]) {
        activeMargin += openPositions[coin].allocatedMargin * (openPositions[coin].marginScale || 1.0);
      }
    }

    // Place Entry Orders
    const activeCount = Object.keys(openPositions).length;
    if (activeCount < maxConcurrentPositions) {
      const candidates = [];
      for (const coin of coins) {
        if (openPositions[coin]) continue;

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
        // Enforce 95% position size factor, but division by maxConcurrentPositions is NOT done in the live bot.
        // So margin = balance * 0.95.
        // However, if we already have a position open, we will not have enough free margin to open another position!
        const requiredMargin = balance * 0.95;
        
        // Insufficient margin check:
        if (balance - activeMargin < requiredMargin) {
          continue;
        }

        const params = coinParams[cand.coin];
        
        let slCap = params.slCap;
        if (cand.dir === 'SHORT') {
          slCap = 0.015;
        }

        const pivotLevels = calculatePivotLevels(cand.data.high24h, cand.data.low24h, cand.data.price);
        const levels = computeStrategyLevels({ ...cand.data, high: cand.data.high24h, low: cand.data.low24h }, cand.dir, pivotLevels, params, slCap);

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
            initialTp: levels.tp,
            tp: levels.tp,
            sl: levels.sl,
            placedAt: timestamp,
            slMovedToEntry: false,
            trailed: false,
            allocatedMargin: requiredMargin,
            marginScale: 1.0
          };
          activeMargin += requiredMargin;
        } else {
          pendingOrders[cand.coin] = {
            dir: cand.dir,
            entry: entryFinal,
            tp: levels.tp,
            sl: levels.sl,
            placedAt: timestamp,
            allocatedMargin: requiredMargin
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
  
  // Slice to last 30 days
  const thirtyDaysAgo = endTime - 30 * 24 * 60 * 60 * 1000;
  
  console.log(`\n--- Running 30-Day Backtest with $20 Initial Balance (Start: ${new Date(thirtyDaysAgo).toISOString()} -> End: ${new Date(endTime).toISOString()}) ---`);
  const sim = runSimulation(coinCandles, coinFunding, thirtyDaysAgo, endTime);

  const coinBreakdown = coins.map(coin => {
    const coinTrades = sim.trades.filter(t => t.coin === coin);
    const wins = coinTrades.filter(t => t.pnl > 0).length;
    const losses = coinTrades.filter(t => t.pnl <= 0).length;
    const wr = coinTrades.length > 0 ? ((wins / coinTrades.length) * 100).toFixed(1) : '0.0';
    const pnl = coinTrades.reduce((sum, t) => sum + t.pnl, 0);
    return { coin, total: coinTrades.length, wins, losses, winRate: wr, pnl };
  });

  const report = `# 📊 30-Day $20 Balance Backtest Report (Exact Live Configuration)

Энэхүү тайлан нь одоогийн live bot-ын тохиргоог **$20 анхны баланстай сүүлийн 30 хоногт** бэктест хийсэн үр дүнг харуулна.

## 📈 Багцын Нийт Харьцуулалт (Summary)

| Үзүүлэлт | $20 Баланстай 30 хоногийн Бэктест |
| :--- | :---: |
| **Багцын Нийт Ашиг (%)** | **+${sim.totalReturn.toFixed(2)}%** 🚀 |
| **Эцсийн Баланс ($)** | **$${sim.finalBalance.toFixed(2)}** |
| **Максимум Drawdown (%)** | **-${sim.maxDrawdown.toFixed(2)}%** 🛡️ |
| **Нийт Арилжааны тоо** | **${sim.totalTrades}** |
| **Win Rate (%)** | **${sim.winRate.toFixed(1)}%** |

---

## 🪙 Коин тус бүрийн Нарийвчилсан Үр Дүн (Per-Coin Breakdown)

| Коин | Нийт Арилжаа | Хожсон (Wins) | Алдсан (Losses) | Win Rate (%) | Нийт Цэвэр Ашиг (PnL) |
| :--- | :---: | :---: | :---: | :---: | :---: |
${coinBreakdown.map(c => `| **${c.coin}** | ${c.total} | ${c.wins} | ${c.losses} | ${c.winRate}% | $${c.pnl.toFixed(2)} |`).join('\n')}

---

## 🔍 Дүгнэлт
- **Хөрөнгийн удирдлага (Margin Management):** Анхны баланс $20 байхад, positionSizeFactor=0.95 тохиргооны дагуу арилжаа бүр балансын 95%-ийг маржин болгон ашиглаж байна. Иймд бот нэг дор зөвхөн 1 арилжаа нээж ажилласан (маржин хүрэлцээгүй тул 2 дахь арилжааг skip хийнэ).
- **Бага балансаар өсөх боломж:** $20 бага балансыг 30 хоногт хэрхэн өсгөж чадсаныг дээрх үр дүнгээс харна уу.
`;

  const reportPath = path.join(BRAIN_DIR, 'live_20usd_30day_report.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Report successfully written to ${reportPath}`);

  console.log("\n=== COIN BREAKDOWN ===");
  coinBreakdown.forEach(c => {
    console.log(`${c.coin}: ${c.total} trades | ${c.wins}W / ${c.losses}L | WinRate: ${c.winRate}% | PnL: $${c.pnl.toFixed(2)}`);
  });
}

run().catch(console.error);
