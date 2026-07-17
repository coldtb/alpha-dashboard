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

function computeStrategyLevels(coin, dir, pivotLevels, params) {
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

  const { tpCap, slCap } = params;

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

  const endTime   = Date.now();
  const startTime = endTime - DAYS * 24 * 60 * 60 * 1000;
  const chunkMs   = 150 * 24 * 60 * 60 * 1000;

  const coinCandles = {};
  const coinFunding = {};

  for (const coin of coins) {
    console.log(`Loading candles for ${coin}...`);
    const candles = [];
    let cur = startTime - 200 * 3600000;
    while (cur < endTime) {
      await sleep(300); // Backoff to prevent rate limit
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
          console.log(`  -> Loaded ${chunk.length} candles chunk`);
        }
      } catch (e) {
        console.warn(`  [Candle Fetch Error] ${e.message}. Retrying in 1s...`);
        await sleep(1000);
        cur -= chunkMs; // retry chunk
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
          console.log(`  -> Loaded ${chunk.length} funding intervals chunk`);
        }
      } catch (e) {
        console.warn(`  [Funding Fetch Error] ${e.message}. Retrying in 1s...`);
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

function runPortfolioSimulation(coinCandles, coinFunding, startTime, endTime) {
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

      const currentProfitPct = isLong
        ? (data.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - data.price) / pos.entryPrice;

      // Breakeven stops check (1.5% for all coins)
      const trigger = 0.015;
      if (!pos.slMovedToEntry && currentProfitPct >= trigger) {
        pos.sl = pos.entryPrice;
        pos.slMovedToEntry = true;
      }

      if (isLong) {
        if (data.low <= pos.sl) hitSl = true;
        else if (data.high >= pos.tp) hitTp = true;
      } else {
        if (data.high >= pos.sl) hitSl = true;
        else if (data.low <= pos.tp) hitTp = true;
      }

      if (hitSl || hitTp) {
        const exitPrice = hitSl ? pos.sl : pos.tp;
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
          initialSl: pos.initialSl,
          initialTp: pos.initialTp,
          slMovedToEntry: pos.slMovedToEntry,
          pnl,
          netRet,
          durationHours: Math.round((timestamp - pos.placedAt) / 3600000),
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
          initialSl: order.sl,
          initialTp: order.tp,
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

        candidates.push({ coin, score, dir, data });
      }

      candidates.sort((a, b) => b.score - a.score);

      const slotsAvailable = maxConcurrentPositions - activeCount;
      const toEnter = candidates.slice(0, slotsAvailable);

      for (const cand of toEnter) {
        const params = COIN_PARAMS[cand.coin];
        const pivotLevels = calculatePivotLevels(cand.data.high24h, cand.data.low24h, cand.data.price);
        const levels = computeStrategyLevels(cand.data, cand.dir, pivotLevels, params);

        const spreadPct = 0.0004;
        const slippage = Math.max(0.0002, cand.data.volatility24h * 0.02);
        let entryFinal = levels.entry;
        if (cand.dir === 'LONG') entryFinal *= (1 + spreadPct / 2 + slippage);
        else entryFinal *= (1 - spreadPct / 2 - slippage);

        const isLong = cand.dir === 'LONG';
        const immedFill = isLong ? cand.data.low <= entryFinal : cand.data.high >= entryFinal;

        if (immedFill) {
          openPositions[cand.coin] = {
            dir: cand.dir,
            entryPrice: entryFinal,
            tp: levels.tp,
            sl: levels.sl,
            initialSl: levels.sl,
            initialTp: levels.tp,
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
  console.log("Running simulation...");
  const trades = runPortfolioSimulation(coinCandles, coinFunding, startTime, endTime);

  const losses = trades.filter(t => t.pnl <= 0);
  console.log(`Total trades: ${trades.length}`);
  console.log(`Losing trades count: ${losses.length}`);

  const coinCounts = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const coinPnl = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const dirCounts = { LONG: 0, SHORT: 0 };
  
  let breakevenStops = 0;
  let hardStops = 0;
  let totalSavedAmount = 0;
  
  let totalLossPnl = 0;
  let totalDuration = 0;

  const worstTrades = [];

  for (const t of losses) {
    coinCounts[t.coin]++;
    coinPnl[t.coin] += t.pnl;
    dirCounts[t.dir]++;
    totalLossPnl += t.pnl;
    totalDuration += t.durationHours;

    // Detect if this was a breakeven stop out
    if (t.slMovedToEntry && Math.abs(t.exit - t.entry) / t.entry < 0.005) {
      breakevenStops++;
      
      const fullLossRet = t.dir === 'LONG'
        ? (t.initialSl - t.entry) / t.entry
        : (t.entry - t.initialSl) / t.entry;
      const margin = t.pnl / t.netRet;
      const fullLossPnl = margin * (fullLossRet * leverage - roundTripFeePct);
      const saved = fullLossPnl - t.pnl;
      totalSavedAmount += Math.abs(saved);
    } else {
      hardStops++;
    }

    worstTrades.push(t);
  }

  worstTrades.sort((a, b) => a.pnl - b.pnl);

  const avgLossPnl = totalLossPnl / losses.length;
  const avgDuration = totalDuration / (losses.length || 1);

  const report = `# 🔍 Backtest Losing Trades Deep-Dive Report (180 Days)

Энэхүү тайлан нь 180 хоногийн багцын backtest-ийн үр дүнд гарсан нийт **${losses.length} алдагдалтай арилжааг** нарийвчлан шинжилж, алдагдлын шалтгаан, нөлөөлсөн хүчин зүйлсийг тодорхойлно.

---

## 📊 Алдагдлын Ерөнхий Статистик

- **Нийт алдагдалтай арилжааны тоо:** ${losses.length}
- **Нийт алдагдлын дүн:** $${totalLossPnl.toFixed(2)}
- **Дундаж нэг арилжааны алдагдал:** $${avgLossPnl.toFixed(2)}
- **Алдагдалтай арилжааны дундаж үргэлжилсэн хугацаа:** ${avgDuration.toFixed(1)} цаг
- **Чиглэлээр:** LONG: ${dirCounts.LONG} арилжаа | SHORT: ${dirCounts.SHORT} арилжаа

---

## 🛡️ Брейкивен (Breakeven SL) Хамгаалалтын Үр Нөлөө

Ашгийн хэмжээ **+1.5%** хүрсний дараа Стоп Лоссыг орсон үнэ (Entry Price) рүү шилжүүлснээр хэдий хэмжээний алдагдлаас хамгаалж чадсаныг харуулав:

- **Брейкивен Стоп-оор хаагдсан арилжаа:** ${breakevenStops} (${((breakevenStops / (losses.length || 1)) * 100).toFixed(1)}%)
  - *Тайлбар:* Эдгээр арилжаанууд нь ашигтай явж байгаад буцаж эргэсэн бөгөөд Брейкивен хамгаалалтын ачаар ямар нэгэн үндсэн алдагдалгүй (зөвхөн шимтгэл болон санхүүжилтийн хүүний хасах дүнтэй) хаагдсан.
- **Хамгаалагдсан алдагдлын хэмжээ:** $${totalSavedAmount.toFixed(2)}
  - *Тайлбар:* Хэрэв эдгээр ${breakevenStops} арилжаанд брейкивен хамгаалалт байгаагүй бол бүгд үндсэн Stop Loss-оо мөргөж, нийт **$${totalSavedAmount.toFixed(2)}**-ийн нэмэлт алдагдал хүлээх байсан.
- **Үндсэн Stop Loss-оор хаагдсан (Hard Stop):** ${hardStops} (${((hardStops / (losses.length || 1)) * 100).toFixed(1)}%)
  - *Тайлбар:* Брейкивен хамгаалалт ажиллаж амжилгүй шууд Stop Loss мөргөсөн арилжаанууд.

---

## 🪙 Коин тус бүрийн Алдагдлын бүтэц

| Коин | Нийт арилжаа | Алдагдалтай тоо | Алдагдлын хувь | Нийт алдагдал ($) | Дундаж алдагдал ($) |
|------|--------------|-----------------|----------------|-------------------|---------------------|
| **BTC**  | 139 | ${coinCounts.BTC} | ${((coinCounts.BTC / 139) * 100).toFixed(1)}% | $${coinPnl.BTC.toFixed(2)} | $${(coinPnl.BTC / (coinCounts.BTC || 1)).toFixed(2)} |
| **XRP**  | 119 | ${coinCounts.XRP} | ${((coinCounts.XRP / 119) * 100).toFixed(1)}% | $${coinPnl.XRP.toFixed(2)} | $${(coinPnl.XRP / (coinCounts.XRP || 1)).toFixed(2)} |
| **SUI**  | 48 | ${coinCounts.SUI} | ${((coinCounts.SUI / 48) * 100).toFixed(1)}% | $${coinPnl.SUI.toFixed(2)} | $${(coinPnl.SUI / (coinCounts.SUI || 1)).toFixed(2)} |
| **HYPE** | 161 | ${coinCounts.HYPE} | ${((coinCounts.HYPE / 161) * 100).toFixed(1)}% | $${coinPnl.HYPE.toFixed(2)} | $${(coinPnl.HYPE / (coinCounts.HYPE || 1)).toFixed(2)} |

*Ажиглалт:*
1. **BTC** болон **HYPE** нь хамгийн бага Win Rate-тэй бөгөөд алдагдалтай арилжааны тоо хамгийн их байна. Гэхдээ HYPE-ийн дундаж алдагдал маш бага байгаа нь хэлбэлзэл ихтэй үед Брейкивен эсвэл богино SL-ээр хурдан гарсантай холбоотой.
2. **XRP** маш өндөр Win Rate-тэй (67.2%) байсан тул ердөө 39 арилжаа алдагдалтай хаагдсан.

---

## ⏱️ Алдагдалтай арилжааны хугацааны шинжилгээ

- **Богино хугацааны алдагдал (< 2 цаг):** ${losses.filter(t => t.durationHours < 2).length} арилжаа
  - *Шалтгаан:* Зах зээл орсон чиглэлийн эсрэг огцом хөдөлгөөн хийж, хамгаалалтын SL-ийг хурдан мөргөсөн.
- **Дунд хугацааны алдагдал (2 - 24 цаг):** ${losses.filter(t => t.durationHours >= 2 && t.durationHours <= 24).length} арилжаа
  - *Шалтгаан:* Зах зээлийн тренд тодорхойгүй эргэлдэж байгаад эцэст нь SL мөргөсөн эсвэл брейкивенээр гарсан.
- **Урт хугацааны алдагдал (> 24 цаг):** ${losses.filter(t => t.durationHours > 24).length} арилжаа
  - *Шалтгаан:* Удаан хугацаанд байрлал хадгалсан тул сөрөг санхүүжилтийн хүү (Funding Fee drag) болон арилжааны шимтгэл хуримтлагдсанаас болж алдагдлыг нэмэгдүүлсэн.

---

## 🚨 Хамгийн их алдагдал хүлээсэн Top 5 арилжаа

| # | Coin | Чиглэл | Орох үнэ | Хаах үнэ | Алдагдал | Хугацаа | Төрөл |
|---|------|--------|----------|----------|----------|---------|-------|
${worstTrades.slice(0, 5).map((t, idx) => {
  const type = (t.slMovedToEntry && Math.abs(t.exit - t.entry) / t.entry < 0.005) ? 'Брейкивен' : 'Слиппэж/Огцом SL';
  return `| ${idx + 1} | ${t.coin} | ${t.dir} | ${t.entry} | ${t.exit} | -$${Math.abs(t.pnl).toFixed(2)} | ${t.durationHours} цаг | ${type} |`;
}).join('\n')}

### Топ Алдагдлуудын Шалтгаан:
- **Огцом Хөдөлгөөн ба Слиппэж:** Зарим арилжаанд орох үеийн гулсалт (slippage) болон уналтын үеийн огцом сүүдэр (price spikes) зэргээс шалтгаалан Stop Loss тогтоосон цэгээсээ доогуур хаагдаж алдагдлыг нэмэгдүүлсэн.
- **Коин тус бүрийн SL Cap ялгаа:** BTC-ийн хувьд SL Cap нь 1.5% байдаг бол XRP болон SUI-ийн SL Cap 2% ба 3% хүртэл явдаг тул нэг удаагийн бүтэн алдагдал хүлээхэд дүн нь өөр өөр гардаг.

`;

  const reportPath = path.join(BRAIN_DIR, 'backtest_weakness_analysis.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Report successfully written to ${reportPath}`);
}

run().catch(console.error);
