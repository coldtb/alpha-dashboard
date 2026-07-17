/**
 * PERSISTENT BACKTEST RUNNER + ANALYZER
 * ──────────────────────────────────────
 * - 4 coins × 3 periods (90 / 180 / 365 days) = 12 runs
 * - Saves every run to backtest-history.json with timestamp
 * - Auto-analyzes: trend, regression, best/worst, recommendations
 * - Writes full report to experiment_results.md
 *
 * Usage:
 *   node scratch/run-full-backtest-and-analyze.js
 */

import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, 'backtest-history.json');
const BRAIN_DIR    = 'C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636';
const REPORT_PATH  = path.join(BRAIN_DIR, 'experiment_results.md');

// ─── Coin configs (matched to bot.js COIN_SL_CAP / COIN_TP_CAP) ───────────
const COIN_PARAMS = {
  BTC:  { tpCap: 0.04,  slCap: 0.015, trendPeriod: 200, minScore: 40 },
  XRP:  { tpCap: 0.025, slCap: 0.025, trendPeriod: 50,  minScore: 65 },
  SUI:  { tpCap: 0.05,  slCap: 0.02,  trendPeriod: 24,  minScore: 65 },
  HYPE: { tpCap: 0.05,  slCap: 0.02,  trendPeriod: 24,  minScore: 65 },
};

// ─── Coin-specific trailing and risk management configurations based on best backtest performance
const COIN_RISK_CONFIG = {
  BTC: {
    partialTpEnabled: false,
    partialTpPct: 0.5,
    breakevenTriggerPct: 999.0, // disabled
  },
  XRP: {
    partialTpEnabled: false,
    partialTpPct: 0.5,
    breakevenTriggerPct: 999.0, // disabled
  },
  SUI: {
    partialTpEnabled: false,
    partialTpPct: 0.5,
    breakevenTriggerPct: 999.0, // disabled
  },
  HYPE: {
    partialTpEnabled: true,
    partialTpPct: 0.4,          // Close 40% at midpoint
    breakevenTriggerPct: 0.025,  // Move SL to entry at +2.5% profit
  }
};

const GLOBAL_RISK_PARAMS = {
  dailyLossLimitPct: 5,        // Stop trading at -5% daily loss
};
const COINS  = ['BTC', 'XRP', 'SUI', 'HYPE'];
const PERIODS = [90, 180, 365];
const LEVERAGE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────
const sma = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

function calcPivots(h, l, c) {
  const p = (h + l + c) / 3;
  return { p, r1: p + (h-l)*0.382, s1: p - (h-l)*0.382, r2: p + (h-l)*0.618, s2: p - (h-l)*0.618 };
}

function calcScore(coin, params) {
  let score = 0;
  const chg = Math.abs(coin.change || 0);
  if (chg <= 3.0) { score += 30; if (chg <= 1.5) score += 10; }
  const af = Math.abs(coin.funding || 0);
  if (af > 0) { score += 20; if (af >= 0.0005) score += 15; else if (af >= 0.0002) score += 10; }
  const vol = coin.volume || 0;
  if (vol > 30000000) score += 20; else if (vol > 15000000) score += 15; else if (vol > 5000000) score += 10;
  score += 15; // watchlist bonus
  return Math.min(score, 100);
}

function detectDir(coin, sma24, smaTrend, params) {
  if (!coin || typeof coin.price !== 'number') return 'SKIP';
  const { symbol, price, funding = 0, change = 0 } = coin;

  if (symbol === 'HYPE') {
    return sma24 !== null ? (price >= sma24 ? 'LONG' : 'SHORT') : 'SKIP';
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
    const mx = 0.05;
    if (dir === 'LONG' && (price < sma24 || price > sma24*(1+mx))) return 'SKIP';
    if (dir === 'SHORT' && (price > sma24 || price < sma24*(1-mx))) return 'SKIP';
  }
  return dir;
}

function computeLevels(coin, dir, pivots, params) {
  if (!coin || dir === 'SKIP') return null;
  const { price, high: h, low: l } = coin;
  const { tpCap, slCap } = params;
  const dec = price < 1 ? 6 : (price < 10 ? 4 : 2);
  const vwap = (h + l + price) / 3;

  let entry, sl, tp;
  if (dir === 'LONG') {
    entry = h - (h - l) * 0.618;
    sl    = pivots ? pivots.s2 * 0.995 : l * 0.985;
    const minTp = entry + (entry - sl) * 1.5;
    tp    = pivots && pivots.r1 > minTp ? pivots.r1 : minTp;
  } else {
    entry = h - (h - l) * 0.382;
    sl    = pivots ? pivots.r2 * 1.005 : h * 1.015;
    const minTp = entry - (sl - entry) * 1.5;
    tp    = pivots && pivots.s1 < minTp ? pivots.s1 : minTp;
  }

  if (dir === 'LONG') {
    if (sl > entry*(1-0.01))  sl = entry*(1-0.01);
    if (sl < entry*(1-slCap)) sl = entry*(1-slCap);
    if (tp < entry*(1+0.005)) tp = entry*(1+0.005);
    if (tp > entry*(1+tpCap)) tp = entry*(1+tpCap);
  } else {
    if (sl < entry*(1+0.01))  sl = entry*(1+0.01);
    if (sl > entry*(1+slCap)) sl = entry*(1+slCap);
    if (tp > entry*(1-0.005)) tp = entry*(1-0.005);
    if (tp < entry*(1-tpCap)) tp = entry*(1-tpCap);
  }
  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl:    parseFloat(sl.toFixed(dec)),
    tp:    parseFloat(tp.toFixed(dec)),
  };
}

// ─── Core backtest ────────────────────────────────────────────────────────
function runBacktest(symbol, candles, fundingMap) {
  const params = COIN_PARAMS[symbol];
  const INIT   = 10000;
  let balance  = INIT, peak = INIT, maxDd = 0;
  let position = null, pending = null;
  let consecutiveLosses = 0, cooldownUntil = 0;
  const dailyPnl = {};   // day -> cumulative PnL
  const trades = [];
  const equity = [];
  let lastDay  = -1;

  for (let i = 200; i < candles.length; i++) {
    const c = candles[i];
    const ts    = c.t;
    const close = parseFloat(c.c);
    const high  = parseFloat(c.h);
    const low   = parseFloat(c.l);
    const vol   = parseFloat(c.v) * close;

    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDd) maxDd = dd;

    const day = Math.floor(ts / 86400000);
    if (day > lastDay) { equity.push({ time: ts, balance }); lastDay = day; }

    // Indicators
    const closes24 = [], closesT = [];
    let h24 = low, l24 = high, vol24 = 0;
    for (let j = i - 24; j <= i; j++) {
      if (!candles[j]) continue;
      closes24.push(parseFloat(candles[j].c));
      if (parseFloat(candles[j].h) > h24) h24 = parseFloat(candles[j].h);
      if (parseFloat(candles[j].l) < l24) l24 = parseFloat(candles[j].l);
      vol24 += parseFloat(candles[j].v) * parseFloat(candles[j].c);
    }
    for (let j = i - params.trendPeriod; j <= i; j++) {
      if (candles[j]) closesT.push(parseFloat(candles[j].c));
    }
    const sma24   = sma(closes24);
    const smaTrnd = sma(closesT);
    const hk      = Math.floor(ts / 3600000) * 3600000;
    const funding = (fundingMap[hk] || 0.0000125) * 3;
    const chg24   = closes24.length > 1 ? ((close - closes24[0]) / closes24[0]) * 100 : 0;
    const pivots  = calcPivots(h24, l24, close);

    const coinData = { symbol, price: close, change: chg24, volume: vol24, funding, high: h24, low: l24 };
    const score    = calcScore(coinData, params);

    // ── Manage open position (with breakeven SL + partial TP)
    if (position) {
      const isLong = position.dir === 'LONG';
      const currentReturn = isLong
        ? (close - position.entry) / position.entry
        : (position.entry - close) / position.entry;

      const coinRisk = COIN_RISK_CONFIG[symbol] || {
        partialTpEnabled: false,
        partialTpPct: 0.5,
        breakevenTriggerPct: 999.0
      };

      // Breakeven SL: if profit >= trigger, move SL to entry price
      if (!position.breakevenSet && currentReturn >= coinRisk.breakevenTriggerPct) {
        position.sl = position.entry;
        position.breakevenSet = true;
      }

      // Partial TP: close configured % at midpoint (halfway to TP)
      if (coinRisk.partialTpEnabled && !position.partialDone) {
        const midpointReturn = isLong
          ? (position.tp - position.entry) / position.entry / 2
          : (position.entry - position.tp) / position.entry / 2;
        if (currentReturn >= midpointReturn) {
          // Close partial % at current price
          const partialRet = currentReturn;
          const partialNet = partialRet * LEVERAGE - 0.0005;
          const partialMargin = Math.min(balance * 0.95, 50000) * coinRisk.partialTpPct;
          const partialPnl = partialMargin * partialNet;
          balance += partialPnl;
          position.partialDone = true;
          position.remainingPct = 1 - coinRisk.partialTpPct;
          // Move SL to breakeven after partial TP
          position.sl = position.entry;
          position.breakevenSet = true;
        }
      }

      const hitSl  = isLong ? low <= position.sl : high >= position.sl;
      const hitTp  = isLong ? high >= position.tp : low <= position.tp;

      if (hitSl || hitTp) {
        const exitPx = hitSl ? position.sl : position.tp;
        const ret    = isLong
          ? (exitPx - position.entry) / position.entry
          : (position.entry - exitPx) / position.entry;
        const net    = ret * LEVERAGE - 0.0005;
        const sizeMult = position.partialDone ? position.remainingPct : 1;
        const margin = Math.min(balance * 0.95, 50000) * sizeMult;
        const pnl    = margin * net;
        balance     += pnl;

        trades.push({
          symbol, dir: position.dir,
          entry: position.entry, exit: exitPx,
          exitType: hitSl ? 'SL' : 'TP',
          pnl: parseFloat(pnl.toFixed(2)),
          returnPct: parseFloat((ret * LEVERAGE * 100).toFixed(2)),
          entryTime: position.entryTime, exitTime: ts,
          hadPartialTp: position.partialDone || false,
          hadBreakeven: position.breakevenSet || false,
        });

        // Daily PnL tracking
        const tradeDay = Math.floor(ts / 86400000);
        if (!dailyPnl[tradeDay]) dailyPnl[tradeDay] = 0;
        dailyPnl[tradeDay] += pnl + (position.partialDone ? margin * (coinRisk.partialTpPct / (1 - coinRisk.partialTpPct)) * net : 0);

        if (net > 0) { consecutiveLosses = 0; }
        else {
          consecutiveLosses++;
          if (consecutiveLosses >= 2) { cooldownUntil = ts + 24*3600000; consecutiveLosses = 0; }
        }
        position = null;
      }
      continue;
    }

    // ── Fill pending
    if (pending) {
      const filled = pending.dir === 'LONG' ? low <= pending.entry : high >= pending.entry;
      if (ts - pending.placedAt > 4*3600000) {
        pending = null;
      } else if (filled) {
        position = { dir: pending.dir, entry: pending.entry, tp: pending.tp, sl: pending.sl, entryTime: ts };
        pending  = null;
      }
      continue;
    }

    if (ts < cooldownUntil) continue;

    // Daily loss limit check
    const todayKey = Math.floor(ts / 86400000);
    const todayLoss = dailyPnl[todayKey] || 0;
    const dailyLossThreshold = -(balance * GLOBAL_RISK_PARAMS.dailyLossLimitPct / 100);
    if (todayLoss < dailyLossThreshold) continue;  // Skip trading for rest of day

    if (score < params.minScore) continue;

    const dir = detectDir(coinData, sma24, smaTrnd, params);
    if (dir === 'SKIP') continue;

    const levels = computeLevels(coinData, dir, pivots, params);
    if (!levels) continue;

    const volatility = (h24 - l24) / (l24 || 1);
    const slip       = Math.max(0.0002, volatility * 0.02);
    const spread     = 0.0004;
    let entryFinal   = levels.entry;
    if (dir === 'LONG') entryFinal *= (1 + spread/2 + slip);
    else                entryFinal *= (1 - spread/2 - slip);

    const imm = dir === 'LONG' ? low <= entryFinal : high >= entryFinal;
    if (imm) {
      position = { dir, entry: entryFinal, tp: levels.tp, sl: levels.sl, entryTime: ts };
    } else {
      pending = { dir, entry: entryFinal, tp: levels.tp, sl: levels.sl, placedAt: ts };
    }
  }

  const wins   = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl <= 0).length;
  const total  = trades.length;
  const wr     = total > 0 ? ((wins/total)*100) : 0;
  const ret    = ((balance - INIT) / INIT) * 100;
  const grossW = trades.filter(t=>t.pnl>0).reduce((a,b)=>a+b.pnl,0);
  const grossL = Math.abs(trades.filter(t=>t.pnl<=0).reduce((a,b)=>a+b.pnl,0));
  const pf     = grossL > 0 ? (grossW/grossL) : (grossW > 0 ? 999 : 0);
  const avgW   = wins > 0 ? grossW/wins : 0;
  const avgL   = losses > 0 ? grossL/losses : 0;

  return {
    symbol, totalReturn: parseFloat(ret.toFixed(2)),
    finalBalance: parseFloat(balance.toFixed(2)),
    winRate: parseFloat(wr.toFixed(1)),
    wins, losses, totalTrades: total,
    maxDrawdown: parseFloat(maxDd.toFixed(2)),
    profitFactor: parseFloat(pf.toFixed(2)),
    avgWin: parseFloat(avgW.toFixed(2)),
    avgLoss: parseFloat(avgL.toFixed(2)),
    equity, trades,
  };
}

// ─── Fetch with retry ─────────────────────────────────────────────────────
async function withRetry(fn, retries = 3, label = '') {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries) throw e;
      const ms = Math.pow(2, i) * 600;
      console.warn(`  [retry] ${label} (${i+1}/${retries}) → wait ${ms}ms`);
      await new Promise(r => setTimeout(r, ms));
    }
  }
}

async function fetchCandles(info, symbol, days) {
  const endTime   = Date.now();
  const startTime = endTime - (days + 10) * 24 * 3600000; // +10 days warmup
  const chunkMs   = 150 * 24 * 3600000;
  const candles   = [];
  let cur = startTime;
  while (cur < endTime) {
    const chunk = await withRetry(
      () => info.candleSnapshot({ coin: symbol, interval: '1h', startTime: cur, endTime: Math.min(cur + chunkMs, endTime) }),
      3, `${symbol} candles`
    );
    if (chunk) chunk.forEach(c => {
      if (!candles.length || c.t > candles[candles.length-1].t) candles.push(c);
    });
    cur += chunkMs;
    await new Promise(r => setTimeout(r, 200));
  }
  return candles;
}

async function fetchFunding(info, symbol, days) {
  const endTime   = Date.now();
  const startTime = endTime - days * 24 * 3600000;
  const chunkMs   = 150 * 24 * 3600000;
  const map       = {};
  let cur = startTime;
  while (cur < endTime) {
    try {
      const chunk = await withRetry(
        () => info.fundingHistory({ coin: symbol, startTime: cur, endTime: Math.min(cur + chunkMs, endTime) }),
        3, `${symbol} funding`
      );
      if (chunk) chunk.forEach(f => {
        const hk = Math.floor(f.time / 3600000) * 3600000;
        map[hk] = parseFloat(f.fundingRate);
      });
    } catch(e) {}
    cur += chunkMs;
    await new Promise(r => setTimeout(r, 200));
  }
  return map;
}

// ─── Analysis engine ─────────────────────────────────────────────────────
function analyze(history) {
  const insights = [];

  // Group by symbol + days
  const grouped = {};
  history.forEach(h => {
    const key = `${h.coin}-${h.days}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(h);
  });

  const latest = {};
  COINS.forEach(c => PERIODS.forEach(d => {
    const key = `${c}-${d}`;
    const runs = grouped[key] || [];
    if (runs.length > 0) latest[key] = runs[runs.length - 1];
  }));

  // Per-coin summary
  const coinSummary = {};
  COINS.forEach(c => {
    const runs365 = grouped[`${c}-365`] || [];
    const runs180 = grouped[`${c}-180`] || [];
    const runs90  = grouped[`${c}-90`]  || [];

    coinSummary[c] = {
      best365:  runs365.length ? Math.max(...runs365.map(r => r.totalReturn)) : null,
      worst365: runs365.length ? Math.min(...runs365.map(r => r.totalReturn)) : null,
      avgWr365: runs365.length ? runs365.reduce((a,b) => a + b.winRate, 0) / runs365.length : null,
      avgDd365: runs365.length ? runs365.reduce((a,b) => a + b.maxDrawdown, 0) / runs365.length : null,
      runs:     runs365.length,
      l365:     runs365[runs365.length-1] || null,
      l180:     runs180[runs180.length-1] || null,
      l90:      runs90[runs90.length-1]   || null,
    };
  });

  // Generate insights
  COINS.forEach(c => {
    const s = coinSummary[c];
    if (!s.l365) return;

    // DD insight
    if (s.l365.maxDrawdown > 60) {
      insights.push({ coin: c, type: 'WARNING', msg: `Max DD -${s.l365.maxDrawdown}% → Partial TP + breakeven SL хэрэгтэй` });
    } else if (s.l365.maxDrawdown < 25) {
      insights.push({ coin: c, type: 'GOOD', msg: `Max DD -${s.l365.maxDrawdown}% → Маш сайн эрсдэлийн удирдлага` });
    }

    // WR insight
    if (s.l365.winRate < 40) {
      insights.push({ coin: c, type: 'WARNING', msg: `Win Rate ${s.l365.winRate}% → RR ratio нэмэх эсвэл entry нарийвчлах` });
    } else if (s.l365.winRate > 60) {
      insights.push({ coin: c, type: 'GOOD', msg: `Win Rate ${s.l365.winRate}% → Хэт conservative → TP ахиулах боломжтой` });
    }

    // PF insight
    if (s.l365.profitFactor < 1.5) {
      insights.push({ coin: c, type: 'WARN', msg: `Profit Factor ${s.l365.profitFactor} → 1.5-аас доор → SL/TP ratio тохируулах` });
    }

    // Trade frequency
    const tradesPerMonth = (s.l365.totalTrades / 12).toFixed(1);
    if (s.l365.totalTrades < 50) {
      insights.push({ coin: c, type: 'INFO', msg: `${s.l365.totalTrades} trades/yr (${tradesPerMonth}/mo) → Маш цөөн → Entry шалгуур суларгах` });
    } else if (s.l365.totalTrades > 150) {
      insights.push({ coin: c, type: 'INFO', msg: `${s.l365.totalTrades} trades/yr (${tradesPerMonth}/mo) → Маш олон → Score threshold нэмэх` });
    }
  });

  // Rankings
  const rank365 = COINS
    .filter(c => coinSummary[c].l365)
    .sort((a, b) => coinSummary[b].l365.totalReturn - coinSummary[a].l365.totalReturn);

  return { coinSummary, insights, rank365, latest };
}

// ─── Report writer ───────────────────────────────────────────────────────
function writeReport(history, analysis) {
  const { coinSummary, insights, rank365 } = analysis;
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const totalRuns = history.length;

  let md = `# 📊 Backtest Судалгааны Нэгдсэн Тайлан

> **Сүүлд шинэчлэгдсэн:** ${now} UTC  
> **Нийт backtest ажиллуулсан тоо:** ${totalRuns}  
> **Стратеги:** Optimal SMA Trend Lock + Fib Entry + Pivot TP/SL  
> **Leverage:** 5x | **Slippage:** ~0.04% | **Fee:** 0.05%

---

## 🏆 Зэрэглэл (365 хоногийн өгөөжөөр)

| # | Coin | 1 Жилийн өгөөж | Win Rate | Max DD | Profit Factor | Арилжаа |
|---|------|----------------|---------|--------|---------------|---------|
`;

  rank365.forEach((c, i) => {
    const s = coinSummary[c].l365;
    const medal = ['🥇','🥈','🥉','  '][i] || '  ';
    md += `| ${medal} | **${c}** | **+${s.totalReturn}%** | ${s.winRate}% | -${s.maxDrawdown}% | ${s.profitFactor}x | ${s.totalTrades} |\n`;
  });

  md += `
---

## 📈 Бүрэн Харьцуулалт — 90 / 180 / 365 хоног

| Coin | 90d Өгөөж | 90d DD | 180d Өгөөж | 180d DD | **365d Өгөөж** | **365d DD** | WR 1Y | PF 1Y |
|------|-----------|--------|------------|---------|----------------|-------------|-------|-------|
`;

  COINS.forEach(c => {
    const s   = coinSummary[c];
    const l90  = s.l90;
    const l180 = s.l180;
    const l365 = s.l365;
    const r90  = l90  ? `+${l90.totalReturn}%`  : '—';
    const d90  = l90  ? `-${l90.maxDrawdown}%`  : '—';
    const r180 = l180 ? `+${l180.totalReturn}%` : '—';
    const d180 = l180 ? `-${l180.maxDrawdown}%` : '—';
    const r365 = l365 ? `**+${l365.totalReturn}%**` : '—';
    const d365 = l365 ? `**-${l365.maxDrawdown}%**` : '—';
    const wr   = l365 ? `${l365.winRate}%` : '—';
    const pf   = l365 ? `${l365.profitFactor}x` : '—';
    md += `| **${c}** | ${r90} | ${d90} | ${r180} | ${d180} | ${r365} | ${d365} | ${wr} | ${pf} |\n`;
  });

  md += `
---

## 🔍 Автомат Дүн Шинжилгээ (Insights)

`;

  const byType = { GOOD: [], WARNING: [], INFO: [] };
  insights.forEach(ins => {
    const t = ins.type === 'WARN' ? 'WARNING' : ins.type;
    if (byType[t]) byType[t].push(ins);
  });

  if (byType.GOOD.length) {
    md += `### ✅ Сайн тал\n`;
    byType.GOOD.forEach(i => md += `- **${i.coin}**: ${i.msg}\n`);
    md += '\n';
  }
  if (byType.WARNING.length) {
    md += `### ⚠️ Анхаарах зүйл\n`;
    byType.WARNING.forEach(i => md += `- **${i.coin}**: ${i.msg}\n`);
    md += '\n';
  }
  if (byType.INFO.length) {
    md += `### 💡 Мэдээлэл\n`;
    byType.INFO.forEach(i => md += `- **${i.coin}**: ${i.msg}\n`);
    md += '\n';
  }

  md += `---

## 🎯 Дараагийн Сайжруулалтын Зөвлөмж

| Эрэмбэ | Монет | Асуудал | Зөвлөмж |
|--------|-------|---------|---------|
`;

  // Auto-generate recommendations
  const recs = [];
  COINS.forEach(c => {
    const s = coinSummary[c];
    if (!s.l365) return;
    const l = s.l365;
    if (l.maxDrawdown > 60) recs.push({ pri: 1, coin: c, issue: `DD -${l.maxDrawdown}%`, rec: 'Partial TP (50% at midpoint), breakeven SL нэмэх' });
    if (l.winRate < 35)     recs.push({ pri: 2, coin: c, issue: `WR ${l.winRate}%`, rec: 'Entry score threshold нэмэх, Volume filter чангатгах' });
    if (l.profitFactor < 1.5) recs.push({ pri: 1, coin: c, issue: `PF ${l.profitFactor}x`, rec: 'SL тодорхой болгох, TP/SL ratio ≥ 2.0 болгох' });
    if (l.totalTrades > 130)  recs.push({ pri: 3, coin: c, issue: `${l.totalTrades} trades/yr`, rec: 'Min score 70+ болгох, Volume threshold нэмэх' });
    if (l.totalTrades < 55)   recs.push({ pri: 3, coin: c, issue: `${l.totalTrades} trades/yr`, rec: 'Distance filter сулруулах, maxDistancePct 0.06 болгох' });
  });
  recs.sort((a, b) => a.pri - b.pri);
  recs.forEach((r, i) => {
    const star = r.pri === 1 ? '🔴' : (r.pri === 2 ? '🟡' : '🟢');
    md += `| ${star} ${i+1} | **${r.coin}** | ${r.issue} | ${r.rec} |\n`;
  });

  md += `
---

## 📜 Бүх Ажиллуулсан Backtest-ийн Түүх

| Огноо | Монет | Хоног | Өгөөж | WR | DD | PF | Арилжаа |
|-------|-------|-------|-------|----|----|----|---------|
`;

  // Last 30 history entries
  const recent = history.slice(-30);
  recent.reverse().forEach(h => {
    const d = new Date(h.timestamp).toISOString().slice(0, 16).replace('T', ' ');
    md += `| ${d} | ${h.coin} | ${h.days}d | +${h.totalReturn}% | ${h.winRate}% | -${h.maxDrawdown}% | ${h.profitFactor || '—'}x | ${h.totalTrades} |\n`;
  });

  if (history.length > 30) md += `\n> *Сүүлийн 30 ажиллуулсан харуулав. Нийт ${history.length} бүртгэл байна.*\n`;

  md += `\n---\n*Энэ тайлан автоматаар үүсдэг. Backtest ажиллах бүрт шинэчлэгдэнэ.*\n`;

  fs.writeFileSync(REPORT_PATH, md);
  console.log(`\n✅ Report updated: experiment_results.md (${history.length} total runs)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const transport = new HttpTransport();
  const info      = new InfoClient({ transport });

  // Load history
  let history = [];
  if (fs.existsSync(HISTORY_PATH)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
    catch(e) { console.warn('History parse error, starting fresh'); }
  }

  console.log(`\n${'═'.repeat(55)}`);
  console.log('  FULL BACKTEST RUNNER — All Coins × All Periods');
  console.log(`${'═'.repeat(55)}`);
  console.log(`  Coins: ${COINS.join(', ')}`);
  console.log(`  Periods: ${PERIODS.join(', ')} days`);
  console.log(`  Total runs: ${COINS.length * PERIODS.length}`);
  console.log(`  Previous history: ${history.length} records`);
  console.log(`${'═'.repeat(55)}\n`);

  // Cache candles per coin (reuse across periods)
  const candleCache  = {};
  const fundingCache = {};

  // Fetch max period data (365d) once per coin, slice for shorter periods
  for (const coin of COINS) {
    console.log(`📥 Fetching ${coin} data (365 days)...`);
    candleCache[coin]  = await fetchCandles(info, coin, 365);
    fundingCache[coin] = await fetchFunding(info, coin, 365);
    console.log(`   → ${candleCache[coin].length} candles, ${Object.keys(fundingCache[coin]).length} funding records`);
  }

  // Run backtests
  for (const coin of COINS) {
    const allCandles  = candleCache[coin];
    const fundingMap  = fundingCache[coin];
    const maxTs       = allCandles.length ? allCandles[allCandles.length-1].t : Date.now();

    for (const days of PERIODS) {
      const cutoffTs   = maxTs - days * 24 * 3600000;
      const slicedCand = allCandles.filter(c => c.t >= cutoffTs - 200*3600000); // keep warmup

      process.stdout.write(`  Running ${coin} ${days}d...`);
      const result = runBacktest(coin, slicedCand, fundingMap);
      process.stdout.write(` +${result.totalReturn}% | WR:${result.winRate}% | DD:-${result.maxDrawdown}% | PF:${result.profitFactor}x | T:${result.totalTrades}\n`);

      const entry = {
        timestamp:    new Date().toISOString(),
        coin,
        days,
        totalReturn:  result.totalReturn,
        finalBalance: result.finalBalance,
        winRate:      result.winRate,
        wins:         result.wins,
        losses:       result.losses,
        totalTrades:  result.totalTrades,
        maxDrawdown:  result.maxDrawdown,
        profitFactor: result.profitFactor,
        avgWin:       result.avgWin,
        avgLoss:      result.avgLoss,
      };
      history.push(entry);
    }
  }

  // Save history
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log(`\n💾 History saved: ${HISTORY_PATH} (${history.length} records)`);

  // Analyze + write report
  const analysis = analyze(history);
  writeReport(history, analysis);

  // Console summary
  console.log(`\n${'─'.repeat(55)}`);
  console.log('  ANALYSIS SUMMARY');
  console.log(`${'─'.repeat(55)}`);
  console.log(`  🏆 Ranking (365d): ${analysis.rank365.join(' > ')}`);
  console.log(`\n  Insights:`);
  analysis.insights.forEach(i => {
    const icon = i.type === 'GOOD' ? '✅' : (i.type === 'WARNING' ? '⚠️' : '💡');
    console.log(`    ${icon} [${i.coin}] ${i.msg}`);
  });
  console.log(`\n${'═'.repeat(55)}\n`);
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
