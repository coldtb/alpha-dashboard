import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

const coins = ['BTC', 'XRP', 'SUI', 'HYPE'];
const DAYS = 30;
const maxConcurrentPositions = 2;
const initialBalance = 20;
const leverage = 5;
const roundTripFeePct = 0.0008;

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
  const { symbol, price } = coin;
  if (symbol === 'HYPE') {
    if (sma24 === null) return 'SKIP';
    return price >= sma24 ? 'LONG' : 'SHORT';
  }
  return 'SKIP'; // only test HYPE
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
    tp = pivotLevels && pivotLevels.r1 > minTp ? pivotLevels.r1 : minTp;
  } else {
    entry = high - (high - low) * 0.382;
    sl    = pivotLevels ? pivotLevels.r2 * 1.005 : high * 1.015;
    const minTp = entry - (sl - entry) * 1.5;
    tp = pivotLevels && pivotLevels.s1 < minTp ? pivotLevels.s1 : minTp;
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
      await sleep(100);
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
        await sleep(500);
        cur -= chunkMs;
      }
      cur += chunkMs;
    }
    coinCandles[coin] = candles;

    const fundingMap = {};
    cur = startTime;
    while (cur < endTime) {
      await sleep(100);
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
        await sleep(500);
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
  let activeMargin = 0;
  const openPositions = {};
  const pendingOrders = {};
  const trades = [];

  const stepMs = 3600000;
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

      if (!pos.trailed) {
        const beTrigger = 0.015;
        if (!pos.slMovedToEntry && currentProfitPct >= beTrigger) {
          pos.sl = pos.entryPrice;
          pos.slMovedToEntry = true;
        }
      }

      if (isLong) {
        if (data.low <= pos.sl) { hitSl = true; exitReason = pos.trailed ? 'TRAILING_SL' : (pos.slMovedToEntry ? 'BE' : 'SL'); }
        else if (data.high >= pos.tp) { hitTp = true; exitReason = pos.trailed ? 'TRAILING_TP' : 'TP'; }
      } else {
        if (data.high >= pos.sl) { hitSl = true; exitReason = pos.trailed ? 'TRAILING_SL' : (pos.slMovedToEntry ? 'BE' : 'SL'); }
        else if (data.low <= pos.tp) { hitTp = true; exitReason = pos.trailed ? 'TRAILING_TP' : 'TP'; }
      }

      const durationHours = Math.round((timestamp - pos.placedAt) / 3600000);
      if (!hitSl && !hitTp && durationHours >= 24) { hitSl = true; exitReason = 'TIMEOUT'; }

      if (hitSl || hitTp) {
        let exitPrice = pos.sl;
        if (hitTp) exitPrice = pos.tp;
        else if (exitReason === 'TIMEOUT') exitPrice = data.price;
        else {
          if (isLong && exitPrice > data.price) exitPrice = data.price;
          else if (!isLong && exitPrice < data.price) exitPrice = data.price;
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
          timestamp,
        });

        delete openPositions[coin];
        activeMargin = 0;
      }
    }

    // Check Pending Orders
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
          initialTp: order.tp,
          tp: order.tp,
          sl: order.sl,
          placedAt: timestamp,
          slMovedToEntry: false,
          trailed: false,
          allocatedMargin: order.allocatedMargin,
          marginScale: 1.0
        };
        activeMargin = order.allocatedMargin;
        delete pendingOrders[coin];
      }
    }

    // Place Entry Orders
    const activeCount = Object.keys(openPositions).length;
    if (activeCount < maxConcurrentPositions) {
      for (const coin of coins) {
        if (openPositions[coin] || pendingOrders[coin]) continue;

        const data = hourlyData[coin];
        const score = calculateScore(data);
        if (score < (coin === 'BTC' ? 40 : 85)) continue;

        const dir = detectAutoDirection(data, data.sma24, null);
        if (dir === 'SKIP') continue;

        const requiredMargin = balance * 0.95;
        if (balance - activeMargin < requiredMargin) {
          continue;
        }

        const params = coinParams[coin];
        const pivotLevels = calculatePivotLevels(data.high24h, data.low24h, data.price);
        const levels = computeStrategyLevels(data, dir, pivotLevels, params, params.slCap);

        const spreadPct = 0.0004;
        const slippage = Math.max(0.0002, data.volatility24h * 0.02);
        
        let entryFinal = levels.entry;
        let volShift = 0;
        if (data.volatility24h > 0.035) volShift = 0.005;

        if (dir === 'LONG') entryFinal *= (1 + spreadPct / 2 + slippage - volShift);
        else entryFinal *= (1 - spreadPct / 2 - slippage + volShift);

        const isLong = dir === 'LONG';
        const immedFill = isLong ? data.low <= entryFinal : data.high >= entryFinal;

        if (immedFill) {
          openPositions[coin] = {
            dir,
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
          activeMargin = requiredMargin;
        } else {
          pendingOrders[coin] = {
            dir,
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

  return trades;
}

async function run() {
  const { coinCandles, coinFunding, startTime, endTime } = await loadHistoryData();
  const thirtyDaysAgo = endTime - 30 * 24 * 60 * 60 * 1000;
  const trades = runSimulation(coinCandles, coinFunding, thirtyDaysAgo, endTime);
  const hypeTrades = trades.filter(t => t.coin === 'HYPE');
  
  console.log(`Total HYPE trades: ${hypeTrades.length}`);
  console.log(`First 5 HYPE trades:`);
  console.log(hypeTrades.slice(0, 5).map(t => ({
    time: new Date(t.timestamp).toISOString(),
    dir: t.dir,
    entry: t.entry,
    exit: t.exit,
    reason: t.reason,
    pnl: t.pnl
  })));
}

run().catch(console.error);
