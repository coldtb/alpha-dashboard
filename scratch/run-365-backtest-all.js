/**
 * 365-day comparative backtest for all 4 coins
 * Runs each coin with optimal parameters (same as 90/180 day tests)
 * Saves results to the backtest-history.json and updates experiment_results.md
 */

import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = 'C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636';

let config = {
  minScore: 65,
  minSlBuffer: 0.01,
  minTpBuffer: 0.005,
  maxDistancePct: 0.05,
  maxTpPct: 0.03,
  watchlist: ['HYPE', 'XRP', 'SUI', 'BTC'],
  watchlistBonus: 15,
};

try {
  const configPath = path.join(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  }
} catch (e) {}

// Coin-specific optimal parameters
const COIN_PARAMS = {
  BTC:  { tpCap: 0.04,  slCap: 0.015, trendPeriod: 200 },
  XRP:  { tpCap: 0.02,  slCap: 0.03,  trendPeriod: 50  },
  SUI:  { tpCap: 0.05,  slCap: 0.015, trendPeriod: 24  },
  HYPE: { tpCap: 0.05,  slCap: 0.015, trendPeriod: 24  },
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

  if ((config.watchlist || []).includes(coin.symbol)) score += (config.watchlistBonus || 15);
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
    const maxDist = config.maxDistancePct || 0.05;
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
  const vwap = (high + low + price) / 3;

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

async function runBacktest(coinSymbol, candles, fundingMap, days) {
  const params = COIN_PARAMS[coinSymbol];
  const initialBalance = 10000;
  let balance = initialBalance;
  let position = null;
  let pendingOrder = null;
  const trades = [];
  const leverage = 5;
  let consecutiveLosses = 0;
  let cooldownUntil = 0;
  let peak = balance;
  let maxDd = 0;

  const dailyBalances = [];
  let lastLoggedDay = -1;

  for (let i = 200; i < candles.length; i++) {
    const c = candles[i];
    const timestamp = c.t;
    const currentPrice = parseFloat(c.c);
    const low  = parseFloat(c.l);
    const high = parseFloat(c.h);

    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDd) maxDd = dd;

    const currentDay = Math.floor(timestamp / 86400000);
    if (currentDay > lastLoggedDay) {
      dailyBalances.push({ time: timestamp, balance });
      lastLoggedDay = currentDay;
    }

    // Compute indicators
    let high24h = low, low24h = high, sumClose24 = 0, vol24 = 0;
    for (let j = i - 24; j <= i; j++) {
      const cj = candles[j];
      if (!cj) continue;
      if (parseFloat(cj.h) > high24h) high24h = parseFloat(cj.h);
      if (parseFloat(cj.l) < low24h) low24h = parseFloat(cj.l);
      sumClose24 += parseFloat(cj.c);
      vol24 += parseFloat(cj.v) * parseFloat(cj.c);
    }
    const sma24 = sumClose24 / 25;

    let sumTrend = 0;
    for (let j = i - params.trendPeriod; j <= i; j++) {
      if (candles[j]) sumTrend += parseFloat(candles[j].c);
    }
    const smaTrend = sumTrend / (params.trendPeriod + 1);

    const volatility24h = (high24h - low24h) / low24h;
    const hourKey = Math.floor(timestamp / 3600000) * 3600000;
    const fundingRaw = fundingMap[hourKey] || 0.0000125;
    const funding = fundingRaw * 3; // 3 settlements/day (bug #4 fix)

    const coinData = {
      symbol: coinSymbol,
      price: currentPrice,
      change: ((currentPrice - parseFloat(candles[i - 24].c)) / parseFloat(candles[i - 24].c)) * 100,
      volume: vol24,
      funding,
      high: high24h,
      low: low24h,
    };

    const score = calculateScore(coinData);
    const pivotLevels = calculatePivotLevels(high24h, low24h, currentPrice);

    // Manage open position
    if (position) {
      const isLong = position.dir === 'LONG';
      let hitSl = false, hitTp = false;
      if (isLong) {
        if (low <= position.sl) hitSl = true;
        else if (high >= position.tp) hitTp = true;
      } else {
        if (high >= position.sl) hitSl = true;
        else if (low <= position.tp) hitTp = true;
      }

      if (hitSl || hitTp) {
        const exitPrice = hitSl ? position.sl : position.tp;
        const ret = isLong
          ? (exitPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - exitPrice) / position.entryPrice;
        const netRet = ret * leverage - 0.0005;
        const margin = Math.min(balance * 0.95, 50000);
        balance += margin * netRet;

        const pnl = margin * netRet;
        trades.push({
          dir: position.dir,
          entry: position.entryPrice,
          exit: exitPrice,
          reason: hitSl ? 'SL' : 'TP',
          pnl: parseFloat(pnl.toFixed(2)),
          balanceAfter: parseFloat(balance.toFixed(2)),
          timestamp,
        });

        if (netRet > 0) { consecutiveLosses = 0; }
        else {
          consecutiveLosses++;
          if (consecutiveLosses >= 2) {
            cooldownUntil = timestamp + 24 * 60 * 60 * 1000;
            consecutiveLosses = 0;
          }
        }
        position = null;
      }
      continue;
    }

    // Fill pending limit
    if (pendingOrder) {
      const isLong = pendingOrder.dir === 'LONG';
      const filled = isLong ? low <= pendingOrder.entry : high >= pendingOrder.entry;
      if (timestamp - pendingOrder.placedAt > 4 * 3600000) {
        pendingOrder = null; // stale cancel
      } else if (filled) {
        position = { dir: pendingOrder.dir, entryPrice: pendingOrder.entry, tp: pendingOrder.tp, sl: pendingOrder.sl };
        pendingOrder = null;
      }
      continue;
    }

    if (timestamp < cooldownUntil) continue;
    if (score < (coinSymbol === 'BTC' ? 40 : config.minScore)) continue;

    const direction = detectAutoDirection(coinData, sma24, smaTrend);
    if (direction === 'SKIP') continue;

    const levels = computeStrategyLevels(coinData, direction, pivotLevels, params);
    if (!levels) continue;

    const spreadPct = 0.0004;
    const slippage = Math.max(0.0002, volatility24h * 0.02);
    let entryFinal = levels.entry;
    if (direction === 'LONG') entryFinal *= (1 + spreadPct / 2 + slippage);
    else entryFinal *= (1 - spreadPct / 2 - slippage);

    const isLong = direction === 'LONG';
    const immedFill = isLong ? low <= entryFinal : high >= entryFinal;

    if (immedFill) {
      position = { dir: direction, entryPrice: entryFinal, tp: levels.tp, sl: levels.sl };
    } else {
      pendingOrder = { dir: direction, entry: entryFinal, tp: levels.tp, sl: levels.sl, placedAt: timestamp };
    }
  }

  const wins   = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl <= 0).length;
  const total  = trades.length;
  const wr     = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
  const ret    = (((balance - initialBalance) / initialBalance) * 100).toFixed(2);
  const avgWin = wins > 0 ? (trades.filter(t=>t.pnl>0).reduce((a,b)=>a+b.pnl,0)/wins).toFixed(2) : '0.00';
  const avgLoss= losses > 0 ? (Math.abs(trades.filter(t=>t.pnl<=0).reduce((a,b)=>a+b.pnl,0))/losses).toFixed(2) : '0.00';

  return {
    coin: coinSymbol,
    days,
    initialBalance,
    finalBalance: parseFloat(balance.toFixed(2)),
    totalReturn: parseFloat(ret),
    winRate: parseFloat(wr),
    totalTrades: total,
    wins,
    losses,
    maxDrawdown: parseFloat(maxDd.toFixed(2)),
    avgWin: parseFloat(avgWin),
    avgLoss: parseFloat(avgLoss),
    dailyBalances,
    trades,
  };
}

async function main() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const DAYS = 365;
  const coins = ['XRP', 'SUI', 'HYPE', 'BTC'];

  console.log(`\n=== 365-DAY BACKTEST — All 4 Coins ===\n`);

  // Load existing history
  const histPath = path.join(process.cwd(), 'scratch', 'backtest-history.json');
  let history = [];
  if (fs.existsSync(histPath)) {
    try { history = JSON.parse(fs.readFileSync(histPath, 'utf8')); } catch(e) {}
  }

  const results365 = [];

  for (const coin of coins) {
    console.log(`Running backtest for ${coin} - ${DAYS} Days...`);

    const endTime   = Date.now();
    const startTime = endTime - DAYS * 24 * 60 * 60 * 1000;
    const chunkMs   = 150 * 24 * 60 * 60 * 1000;

    // Fetch candles
    const candles = [];
    let cur = startTime - 200 * 3600000; // extra 200 hours for warmup
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
        console.warn(`  [Candle chunk error] ${e.message}`);
      }
      cur += chunkMs;
    }

    // Fetch funding history
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

    console.log(`  Candles: ${candles.length}, Funding records: ${Object.keys(fundingMap).length}`);

    const result = await runBacktest(coin, candles, fundingMap, DAYS);
    results365.push(result);

    // Save to history
    const entry = {
      timestamp: new Date().toISOString(),
      coin,
      days: DAYS,
      totalReturn: result.totalReturn,
      winRate: result.winRate,
      totalTrades: result.totalTrades,
      maxDrawdown: result.maxDrawdown,
      finalBalance: result.finalBalance,
    };
    history.push(entry);
    fs.writeFileSync(histPath, JSON.stringify(history, null, 2));
    console.log(`  ✅ +${result.totalReturn}% | WR: ${result.winRate}% | DD: -${result.maxDrawdown}% | Trades: ${result.totalTrades}`);
  }

  // Write experiment_results.md
  const prevResults = {
    XRP:  { r90: '+149.32%', dd90: '-30.43%', r180: '+320.92%', dd180: '-19.93%' },
    SUI:  { r90: '+231.87%', dd90: '-42.18%', r180: '+614.43%', dd180: '-58.64%' },
    HYPE: { r90: '+125.91%', dd90: '-32.64%', r180: '+302.37%', dd180: '-57.38%' },
    BTC:  { r90: '+312.44%', dd90: '-14.22%', r180: '+952.51%', dd180: '-16.11%' },
  };

  const summaryRows = results365.map(r => {
    const prev = prevResults[r.coin] || {};
    return `| **${r.coin}** | ${prev.r90||'—'} / ${prev.dd90||'—'} | ${prev.r180||'—'} / ${prev.dd180||'—'} | **+${r.totalReturn}%** / **-${r.maxDrawdown}%** | ${r.winRate}% (${r.wins}W/${r.losses}L) | ${r.totalTrades} |`;
  }).join('\n');

  const md = `# Backtest Туршилтын Үр Дүн (Нэгдсэн Тайлан)

> Сүүлд шинэчлэгдсэн: ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC

## 📊 Бүрэн Харьцуулалт (90 / 180 / 365 хоног)

| Coin | 90 хоног | 180 хоног | **365 хоног** | Win Rate | Нийт арилжаа |
|------|----------|-----------|---------------|----------|--------------|
${summaryRows}

---

## 📈 365 Хоногийн Дэлгэрэнгүй Үр Дүн

${results365.map(r => `### ${r.coin}
- **Нийт өгөөж:** +${r.totalReturn}%
- **Max Drawdown:** -${r.maxDrawdown}%
- **Win Rate:** ${r.winRate}% (${r.wins}W / ${r.losses}L)
- **Нийт арилжаа:** ${r.totalTrades}
- **Дундаж ашиг:** $${r.avgWin}
- **Дундаж алдагдал:** $${r.avgLoss}
- **Эцсийн баланс:** $${r.finalBalance.toLocaleString()}`).join('\n\n')}

---

## ⚙️ Тохиргоо

| Параметр | BTC | XRP | SUI | HYPE |
|----------|-----|-----|-----|------|
| TP Cap | 4% | 2% | 5% | 5% |
| SL Cap | 1.5% | 3% | 1.5% | 1.5% |
| Trend Period | SMA200 | SMA50 | SMA24 | SMA24 |
| Leverage | 5x | 5x | 5x | 5x |
`;

  const mdPath = path.join(BRAIN_DIR, 'experiment_results.md');
  fs.writeFileSync(mdPath, md);
  console.log(`\n✅ Report written to experiment_results.md`);

  // Also write a JSON file for the dashboard to consume
  const dashboardDataPath = path.join(process.cwd(), 'scratch', 'backtest-365-results.json');
  fs.writeFileSync(dashboardDataPath, JSON.stringify(results365, null, 2));
  console.log(`✅ Dashboard data written to scratch/backtest-365-results.json`);

  console.log('\n=== FINAL SUMMARY ===');
  results365.forEach(r => {
    console.log(`${r.coin}: +${r.totalReturn}% | WR:${r.winRate}% | DD:-${r.maxDrawdown}% | Trades:${r.totalTrades}`);
  });
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
