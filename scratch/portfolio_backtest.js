import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';
import path from 'path';

const coins = ['BTC', 'XRP', 'SUI', 'HYPE'];
const DAYS = 180; // Run over 180 days (standard period)
const maxConcurrentPositions = 2;
const initialBalance = 10000;
const leverage = 5;
const roundTripFeePct = 0.0008; // 0.08% round trip fee

// Coin-specific configurations (matching api/bot.js and api/backtest.js)
const COIN_PARAMS = {
  BTC:  { tpCap: 0.04,  slCap: 0.015, trendPeriod: 200, cooldownEnabled: false },
  XRP:  { tpCap: 0.02,  slCap: 0.03,  trendPeriod: 50,  cooldownEnabled: false },
  SUI:  { tpCap: 0.02,  slCap: 0.02,  trendPeriod: 200, cooldownEnabled: true  },
  HYPE: { tpCap: 0.05,  slCap: 0.015, trendPeriod: 24,  cooldownEnabled: true  },
};

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

  if (coins.includes(coin.symbol)) score += 15; // watchlist bonus
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
    console.log(`Fetching candles & funding for ${coin}...`);
    // Fetch candles
    const candles = [];
    let cur = startTime - 200 * 3600000; // warmup
    while (cur < endTime) {
      try {
        const chunk = await info.candleSnapshot({
          coin, interval: '1h',
          startTime: cur,
          endTime: Math.min(cur + chunkMs, endTime)
        });
        if (chunk) chunk.forEach(c => {
          if (!candles.length || c.t > candles[candles.length - 1].t) candles.push(c);
        });
      } catch (e) {
        console.warn(`  [Candle Error] ${e.message}`);
      }
      cur += chunkMs;
    }
    coinCandles[coin] = candles;

    // Fetch funding
    const fundingMap = {};
    cur = startTime;
    while (cur < endTime) {
      try {
        const chunk = await info.fundingHistory({
          coin,
          startTime: cur,
          endTime: Math.min(cur + chunkMs, endTime)
        });
        if (chunk) chunk.forEach(f => {
          const hk = Math.floor(f.time / 3600000) * 3600000;
          fundingMap[hk] = parseFloat(f.fundingRate);
        });
      } catch (e) {}
      cur += chunkMs;
    }
    coinFunding[coin] = fundingMap;
    console.log(`  -> Loaded ${candles.length} candles, ${Object.keys(fundingMap).length} funding intervals.`);
  }

  return { coinCandles, coinFunding, startTime, endTime };
}

function runPortfolioSimulation(coinCandles, coinFunding, startTime, endTime, enableBreakevenAll) {
  let balance = initialBalance;
  let peak = balance;
  let maxDd = 0;

  const openPositions = {}; // coin -> position
  const pendingOrders = {}; // coin -> order
  const consecutiveLosses = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const cooldownUntil = { BTC: 0, XRP: 0, SUI: 0, HYPE: 0 };
  const trades = [];

  // Align hours
  // We'll iterate hour by hour starting from startTime to endTime
  const stepMs = 3600000;
  
  // Find index pointers for candles
  const pointers = {};
  for (const coin of coins) {
    pointers[coin] = coinCandles[coin].findIndex(c => c.t >= startTime);
    if (pointers[coin] === -1) pointers[coin] = 200; // fallback
  }

  for (let timestamp = startTime; timestamp <= endTime; timestamp += stepMs) {
    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDd) maxDd = dd;

    // 1. Update pointers and verify data availability
    const hourlyData = {};
    let allCoinsHaveData = true;

    for (const coin of coins) {
      const candles = coinCandles[coin];
      let ptr = pointers[coin];
      // Fast forward pointer to current timestamp
      while (ptr < candles.length && candles[ptr].t < timestamp) {
        ptr++;
      }
      pointers[coin] = ptr;

      const c = candles[ptr];
      if (!c || Math.abs(c.t - timestamp) > 1800000) {
        allCoinsHaveData = false;
        break;
      }

      // Compute indicators
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
      const funding = fundingRaw * 3; // 3 settlements/day daily equivalent

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

    // 2. Manage open positions
    for (const coin of coins) {
      const pos = openPositions[coin];
      if (!pos) continue;

      const data = hourlyData[coin];
      const isLong = pos.dir === 'LONG';
      let hitSl = false, hitTp = false;

      // Breakeven stops check
      const currentProfitPct = isLong
        ? (data.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - data.price) / pos.entryPrice;

      if (enableBreakevenAll) {
        // Option B: Enable 1.5% Breakeven SL for all coins
        const trigger = 0.015;
        if (!pos.slMovedToEntry && currentProfitPct >= trigger) {
          pos.sl = pos.entryPrice;
          pos.slMovedToEntry = true;
        }
      } else {
        // Option A (Current Live Bot): Enable Breakeven SL only for HYPE (at 2.5%), disable for SUI/BTC/XRP
        if (coin === 'HYPE' && !pos.slMovedToEntry && currentProfitPct >= 0.025) {
          pos.sl = pos.entryPrice;
          pos.slMovedToEntry = true;
        }
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

        // Funding fee over the trade duration
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
          reason: hitSl ? 'SL' : 'TP',
          pnl,
          timestamp,
        });

        // Cooldown management
        if (COIN_PARAMS[coin].cooldownEnabled) {
          if (netRet > 0) {
            consecutiveLosses[coin] = 0;
          } else {
            consecutiveLosses[coin]++;
            if (consecutiveLosses[coin] >= 2) {
              cooldownUntil[coin] = timestamp + 24 * 3600000;
              consecutiveLosses[coin] = 0;
              pendingOrders[coin] = null; // cancel resting limit orders
            }
          }
        }

        delete openPositions[coin];
      }
    }

    // 3. Fill pending orders
    for (const coin of coins) {
      const order = pendingOrders[coin];
      if (!order) continue;

      const data = hourlyData[coin];
      const isLong = order.dir === 'LONG';
      const filled = isLong ? data.low <= order.entry : data.high >= order.entry;

      if (timestamp - order.placedAt > 4 * 3600000) {
        delete pendingOrders[coin]; // stale order cancel
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

    // 4. Check for new entries if we have slots available
    const activeCount = Object.keys(openPositions).length;
    if (activeCount < maxConcurrentPositions) {
      // Find candidate coins
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

      // Sort candidates by score descending
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

async function main() {
  const { coinCandles, coinFunding, startTime, endTime } = await loadHistoryData();

  console.log(`\n=== RUNNING SIMULATION A: Breakeven SL Disabled for SUI/BTC/XRP ===`);
  const resA = runPortfolioSimulation(coinCandles, coinFunding, startTime, endTime, false);
  console.log(`  Return: +${resA.totalReturn.toFixed(2)}%`);
  console.log(`  Max Drawdown: -${resA.maxDrawdown.toFixed(2)}%`);
  console.log(`  Win Rate: ${resA.winRate.toFixed(2)}% (${resA.wins}W / ${resA.losses}L)`);
  console.log(`  Total Trades: ${resA.totalTrades}`);

  console.log(`\n=== RUNNING SIMULATION B: Breakeven SL Enabled for ALL at 1.5% ===`);
  const resB = runPortfolioSimulation(coinCandles, coinFunding, startTime, endTime, true);
  console.log(`  Return: +${resB.totalReturn.toFixed(2)}%`);
  console.log(`  Max Drawdown: -${resB.maxDrawdown.toFixed(2)}%`);
  console.log(`  Win Rate: ${resB.winRate.toFixed(2)}% (${resB.wins}W / ${resB.losses}L)`);
  console.log(`  Total Trades: ${resB.totalTrades}`);

  console.log(`\n=== PORTFOLIO-WIDE COMPARISON (4 Coins, Max Concurrent: 2) ===`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`Metric                   | Config A (Breakeven Off) | Config B (Breakeven On)`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`Total Return             | +${resA.totalReturn.toFixed(2)}%              | +${resB.totalReturn.toFixed(2)}%`);
  console.log(`Max Drawdown             | -${resA.maxDrawdown.toFixed(2)}%               | -${resB.maxDrawdown.toFixed(2)}%`);
  console.log(`Win Rate                 | ${resA.winRate.toFixed(1)}% (${resA.wins}W/${resA.losses}L)   | ${resB.winRate.toFixed(1)}% (${resB.wins}W/${resB.losses}L)`);
  console.log(`Total Trades             | ${resA.totalTrades}                      | ${resB.totalTrades}`);
  console.log(`---------------------------------------------------------------------`);

  console.log(`\n=== CONFIG B (Breakeven On) - PER COIN BREAKDOWN ===`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`Coin | Trades | Wins | Losses | Win Rate | Total PnL`);
  console.log(`---------------------------------------------------------------------`);
  for (const coin of coins) {
    const coinTrades = resB.trades.filter(t => t.coin === coin);
    const cTotal = coinTrades.length;
    const cWins = coinTrades.filter(t => t.pnl > 0).length;
    const cLosses = coinTrades.filter(t => t.pnl <= 0).length;
    const cWr = cTotal > 0 ? ((cWins / cTotal) * 100).toFixed(1) : '0.0';
    const cPnl = coinTrades.reduce((sum, t) => sum + t.pnl, 0);
    console.log(`${coin.padEnd(4)} | ${cTotal.toString().padEnd(6)} | ${cWins.toString().padEnd(4)} | ${cLosses.toString().padEnd(6)} | ${cWr.padEnd(8)}% | $${cPnl.toFixed(2)}`);
  }
  console.log(`---------------------------------------------------------------------`);

  console.log(`\nPortfolio backtest successfully complete.`);
}

main().catch(console.error);
