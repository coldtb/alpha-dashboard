/**
 * 15-min Candle Backtest — Bot Logic Replica (Fixed Trailing TP)
 * - Trailing TP зөвхөн 1 удаа өргөсгөж, дараа нь Trailing SL-ийг зөөлрүүлсэн
 * - HYPE cooldown 3 цаг болголоо
 * - Undsen code (api/bot.js) хөндөхгүй, зөвхөн turshilt
 */

import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

const transport = new HttpTransport();
const info = new InfoClient({ transport });

// ── Config ────────────────────────────────────────────────────────────────────
const LEVERAGE = 5;
const POSITION_SIZE_FACTOR = 0.95;
const ROUND_TRIP_FEE = 0.0005;
const TP_PCT = 0.03;
const SL_PCT = 0.012;
const MIN_SCORE = 65;
const WATCHLIST_BONUS = 15;

// Trailing config (ЗАСВАРЛАСАН)
const TRAILING_NEAR_PCT = 0.012;     // TP-д 1.2% ойртоход trailing идэвхжинэ
const TRAILING_TP_EXTENSION = 0.025; // TP-г 2.5% нэмж өргөсгөнө (1 удаа л)
const TRAILING_SL_LOCK = 0.008;     // Trailing SL: close-оос 0.8% зай (илүү зөөлөн)

// Pyramiding config
const PYRAMID_PROFIT_1 = 0.03;
const PYRAMID_PROFIT_2 = 0.055;
const MAX_PYRAMIDS = 2;
const PYRAMID_SIZE = 0.5;

const SPREAD_MAP = { XRP: 0.0004, HYPE: 0.0008 };
const VOLUME_THRESHOLDS = [100_000_000, 50_000_000, 10_000_000];

// Per-coin config (ЗАСВАРЛАСАН: HYPE cooldown 3h)
const COIN_CONFIG = {
  XRP: { cooldownMs: 1 * 60 * 60 * 1000, days: 90 },
  HYPE: { cooldownMs: 3 * 60 * 60 * 1000, days: 90 },
};

const COINS = ["XRP", "HYPE"];
const INITIAL_BALANCE = 18;

// ── Score calculation ─────────────────────────────────────────────────────────
function calcScore(change, fundingRate, volume24h) {
  let score = 0;
  const absChange = Math.abs(change);
  if (absChange <= 3.0) { score += 30; if (absChange <= 1.5) score += 10; }
  const absFunding = Math.abs(fundingRate || 0);
  if (absFunding > 0) {
    score += 20;
    if (absFunding >= 0.0005) score += 15;
    else if (absFunding >= 0.0002) score += 10;
  }
  if (volume24h > VOLUME_THRESHOLDS[0]) score += 20;
  else if (volume24h > VOLUME_THRESHOLDS[1]) score += 15;
  else if (volume24h > VOLUME_THRESHOLDS[2]) score += 10;
  score += WATCHLIST_BONUS; // XRP, HYPE both in watchlist
  return Math.min(score, 100);
}

// ── Direction: SMA24 + funding crowded check ──────────────────────────────────
function detectDirection(candles, i, fundingRate) {
  if (i < 24) return "SKIP";
  let sum = 0;
  for (let j = i - 24; j <= i; j++) sum += parseFloat(candles[j].c);
  const sma24 = sum / 25;
  const price = parseFloat(candles[i].c);
  const priceDiff = (price - sma24) / sma24;

  if (priceDiff > 0.002) {
    if (fundingRate > 0.0005) return "SKIP"; // crowded long
    return "LONG";
  } else if (priceDiff < -0.002) {
    if (fundingRate < -0.0005) return "SKIP"; // crowded short
    return "SHORT";
  }
  return "SKIP";
}

// ── Candle fetch ──────────────────────────────────────────────────────────────
async function fetchCandles(coin, startTime, endTime) {
  const candles = [];
  const chunkMs = 25 * 24 * 60 * 60 * 1000;
  let s = startTime;
  while (s < endTime) {
    const e = Math.min(s + chunkMs, endTime);
    const chunk = await info.candleSnapshot({ coin, interval: "15m", startTime: s, endTime: e });
    if (chunk?.length > 0) {
      chunk.forEach(c => {
        if (candles.length === 0 || c.t > candles[candles.length - 1].t) candles.push(c);
      });
    }
    s += chunkMs;
    await new Promise(r => setTimeout(r, 300));
  }
  return candles;
}

// ── Main backtest ─────────────────────────────────────────────────────────────
async function runBacktest(coin) {
  const cfg = COIN_CONFIG[coin];
  const DAYS = cfg.days;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔍 ${coin} — 15-мин backtest (Засварласан Trailing)`);
  console.log(`${"=".repeat(60)}`);

  const endTime = Date.now();
  const startTime = endTime - DAYS * 24 * 60 * 60 * 1000;

  const candles = await fetchCandles(coin, startTime, endTime);
  console.log(`📊 Fetched ${candles.length} x 15-мин свеч`);

  // Funding history
  const fundingMap = {};
  try {
    const chunkMs = 25 * 24 * 60 * 60 * 1000;
    let s = startTime;
    while (s < endTime) {
      const e = Math.min(s + chunkMs, endTime);
      const fChunk = await info.fundingHistory({ coin, startTime: s, endTime: e });
      if (fChunk) fChunk.forEach(f => {
        const hKey = Math.floor(f.time / 3600000) * 3600000;
        fundingMap[hKey] = parseFloat(f.fundingRate);
      });
      s += chunkMs;
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) {
    console.warn(`Funding fetch failed: ${e.message}`);
  }

  // ── Simulation ───────────────────────────────────────────────────────────
  let balance = INITIAL_BALANCE;
  let position = null;
  let lastTradeEndTime = 0;
  const trades = [];
  const equityCurve = [{ time: startTime, balance }];
  let lastDay = Math.floor(startTime / 86400000);
  const CANDLES_PER_HOUR = 4;
  const CANDLES_PER_DAY = 96;

  function get24hVolume(i) {
    let vol = 0;
    const start = Math.max(0, i - CANDLES_PER_DAY);
    for (let j = start; j <= i; j++) {
      vol += parseFloat(candles[j].v) * parseFloat(candles[j].c);
    }
    return vol;
  }

  for (let i = CANDLES_PER_DAY; i < candles.length; i++) {
    const c = candles[i];
    const timestamp = parseInt(c.t);
    const close = parseFloat(c.c);
    const high = parseFloat(c.h);
    const low = parseFloat(c.l);
    const spreadPct = SPREAD_MAP[coin] || 0.0005;

    const day = Math.floor(timestamp / 86400000);
    if (day > lastDay) {
      equityCurve.push({ time: timestamp, balance });
      lastDay = day;
    }

    const hKey = Math.floor(timestamp / 3600000) * 3600000;
    const fundingRate = fundingMap[hKey] || 0.0000125;

    // ── MANAGE POSITION ──────────────────────────────────────────────────
    if (position) {
      const isLong = position.dir === "LONG";

      // 1. Move SL to breakeven at 1.5% profit
      if (!position.slMovedToEntry) {
        const maxProfit = isLong
          ? (high - position.entryPrice) / position.entryPrice
          : (position.entryPrice - low) / position.entryPrice;
        if (maxProfit >= 0.015) {
          position.sl = position.entryPrice;
          position.slMovedToEntry = true;
        }
      }

      // 2. Trailing TP — ЗАСВАРЛАСАН: зөвхөн 1 удаа өргөсгөнө, дараа нь Trailing SL л ажиллана
      if (!position.trailed) {
        const isNearTp = isLong
          ? high >= position.tp * (1 - TRAILING_NEAR_PCT)
          : low <= position.tp * (1 + TRAILING_NEAR_PCT);

        if (isNearTp) {
          // TP-г 1 удаа хол шилжүүлнэ
          const newTp = isLong
            ? position.tp * (1 + TRAILING_TP_EXTENSION)
            : position.tp * (1 - TRAILING_TP_EXTENSION);
          position.tp = parseFloat(newTp.toFixed(5));
          position.trailed = true; // цаашид TP-г хөдөлгөхгүй
        }
      } else {
        // TP нэгэнт trailing хийсний дараа: SL-ийг зөвхөн ашигтай чиглэлд шилжүүлж байна
        const trailedSl = isLong ? close * (1 - TRAILING_SL_LOCK) : close * (1 + TRAILING_SL_LOCK);
        const isSLImproved = isLong ? trailedSl > position.sl : trailedSl < position.sl;
        if (isSLImproved) {
          position.sl = parseFloat(trailedSl.toFixed(5));
        }
      }

      // 3. Pyramiding: SL breakeven хийсний дараа л нэмэлт оролт
      if (position.slMovedToEntry && position.pyramids.length < MAX_PYRAMIDS) {
        const currentProfit = isLong
          ? (close - position.entryPrice) / position.entryPrice
          : (position.entryPrice - close) / position.entryPrice;
        const nextThreshold = position.pyramids.length === 0 ? PYRAMID_PROFIT_1 : PYRAMID_PROFIT_2;
        const alreadyAdded = position.pyramids.some(p => 
          Math.abs(p.time - timestamp) < 4 * 15 * 60 * 1000 // 4 candles дотор дахин нэмэхгүй
        );
        if (currentProfit >= nextThreshold && !alreadyAdded) {
          const pyrEntry = close * (isLong ? 1 + spreadPct : 1 - spreadPct);
          position.pyramids.push({
            entryPrice: parseFloat(pyrEntry.toFixed(5)),
            sizeFactor: PYRAMID_SIZE,
            time: timestamp,
          });
        }
      }

      // 4. SL / TP hit check
      let hitSl = false;
      let hitTp = false;
      if (isLong) {
        if (low <= position.sl) hitSl = true;
        else if (high >= position.tp) hitTp = true;
      } else {
        if (high >= position.sl) hitSl = true;
        else if (low <= position.tp) hitTp = true;
      }

      if (hitSl || hitTp) {
        const rawExit = hitSl ? position.sl : position.tp;
        const slippage = 0.0003;
        const exitPrice = isLong
          ? rawExit * (1 - spreadPct / 2) * (1 - slippage)
          : rawExit * (1 + spreadPct / 2) * (1 + slippage);

        const mainReturn = isLong
          ? (exitPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - exitPrice) / position.entryPrice;

        let totalFunding = 0;
        for (let h = position.fillTime + 3600000; h <= timestamp; h += 3600000) {
          const hk = Math.floor(h / 3600000) * 3600000;
          const fr = fundingMap[hk] || 0.0000125;
          totalFunding += (isLong ? -fr : fr) * LEVERAGE;
        }

        const mainMargin = Math.min(balance * POSITION_SIZE_FACTOR, 50000);
        const mainPnl = mainMargin * (mainReturn * LEVERAGE + totalFunding - ROUND_TRIP_FEE);

        let pyramidPnl = 0;
        for (const pyr of position.pyramids) {
          const pyrRet = isLong
            ? (exitPrice - pyr.entryPrice) / pyr.entryPrice
            : (pyr.entryPrice - exitPrice) / pyr.entryPrice;
          pyramidPnl += mainMargin * pyr.sizeFactor * (pyrRet * LEVERAGE - ROUND_TRIP_FEE);
        }

        const totalPnl = mainPnl + pyramidPnl;
        balance += totalPnl;
        if (balance < 0) balance = 0;
        lastTradeEndTime = timestamp;

        trades.push({
          dir: position.dir,
          entryPrice: parseFloat(position.entryPrice.toFixed(5)),
          exitPrice: parseFloat(exitPrice.toFixed(5)),
          exitType: hitSl ? "SL" : "TP",
          wasTrailed: position.trailed || false,
          entryTime: new Date(position.fillTime).toISOString().slice(0, 16),
          exitTime: new Date(timestamp).toISOString().slice(0, 16),
          pyramidCount: position.pyramids.length,
          mainPnl: parseFloat(mainPnl.toFixed(2)),
          pyramidPnl: parseFloat(pyramidPnl.toFixed(2)),
          totalPnl: parseFloat(totalPnl.toFixed(2)),
          balanceAfter: parseFloat(balance.toFixed(2)),
        });

        position = null;
      }
      continue;
    }

    // ── ENTRY SIGNAL ─────────────────────────────────────────────────────
    if (i % CANDLES_PER_HOUR !== 0) continue;
    if (timestamp - lastTradeEndTime < cfg.cooldownMs) continue;

    const vol24h = get24hVolume(i);
    let change24h = 0;
    if (i >= CANDLES_PER_DAY) {
      const prev = parseFloat(candles[i - CANDLES_PER_DAY].c);
      change24h = ((close - prev) / prev) * 100;
    }
    const score = calcScore(change24h, fundingRate, vol24h);
    if (score < MIN_SCORE) continue;

    const dir = detectDirection(candles, i, fundingRate);
    if (dir === "SKIP") continue;

    const slippage = 0.0003;
    const entryPrice = dir === "LONG"
      ? close * (1 + spreadPct / 2) * (1 + slippage)
      : close * (1 - spreadPct / 2) * (1 - slippage);

    const tp = dir === "LONG" ? entryPrice * (1 + TP_PCT) : entryPrice * (1 - TP_PCT);
    const sl = dir === "LONG" ? entryPrice * (1 - SL_PCT) : entryPrice * (1 + SL_PCT);

    position = {
      dir,
      entryPrice: parseFloat(entryPrice.toFixed(5)),
      tp: parseFloat(tp.toFixed(5)),
      sl: parseFloat(sl.toFixed(5)),
      fillTime: timestamp,
      slMovedToEntry: false,
      trailed: false,
      pyramids: [],
    };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const wins = trades.filter(t => t.totalPnl > 0);
  const losses = trades.filter(t => t.totalPnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length * 100).toFixed(1) : 0;
  const totalReturn = ((balance - INITIAL_BALANCE) / INITIAL_BALANCE * 100).toFixed(2);
  const tpTrades = trades.filter(t => t.exitType === "TP");
  const slTrades = trades.filter(t => t.exitType === "SL");
  const trailedTrades = trades.filter(t => t.wasTrailed);
  const pyrTrades = trades.filter(t => t.pyramidCount > 0);
  const pyrPnl = trades.reduce((s, t) => s + t.pyramidPnl, 0);

  let peak = INITIAL_BALANCE;
  let maxDD = 0;
  trades.forEach(t => {
    if (t.balanceAfter > peak) peak = t.balanceAfter;
    const dd = (peak - t.balanceAfter) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  });

  const grossProfit = wins.reduce((s, t) => s + t.totalPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.totalPnl, 0));
  const pf = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : "∞";

  console.log(`\n📈 ${coin} — 90 хоног | 15-мин | Trailing (1 удаа) + Pyramiding`);
  console.log(`${"─".repeat(55)}`);
  console.log(`💰 Эхний баланс:           $${INITIAL_BALANCE.toFixed(2)}`);
  console.log(`💰 Эцсийн баланс:          $${balance.toFixed(2)}`);
  console.log(`📈 Нийт өгөөж:             ${totalReturn > 0 ? "+" : ""}${totalReturn}%`);
  console.log(`🏆 Win Rate:               ${winRate}%  (${wins.length}W / ${losses.length}L)`);
  console.log(`📉 Max Drawdown:           ${maxDD.toFixed(2)}%`);
  console.log(`🎯 Profit Factor:          ${pf}`);
  console.log(`📊 Нийт арилжаа:           ${trades.length}`);
  console.log(`✅ TP хаагдсан:            ${tpTrades.length}`);
  console.log(`🔀 Trailing дараа хаагдсан: ${trailedTrades.length}`);
  console.log(`❌ SL хаагдсан:            ${slTrades.length}`);
  console.log(`🔺 Pyramiding:             ${pyrTrades.length} арилжаа (+$${pyrPnl.toFixed(2)})`);
  console.log(`${"─".repeat(55)}`);

  console.log(`\n📋 Хамгийн сайн 5 арилжаа:`);
  [...trades].sort((a, b) => b.totalPnl - a.totalPnl).slice(0, 5).forEach(t => {
    const trail = t.wasTrailed ? " 🔀Trail" : "";
    const pyr = t.pyramidCount > 0 ? ` 🔺${t.pyramidCount}x(+$${t.pyramidPnl})` : "";
    console.log(`  ${t.exitType === "TP" ? "✅" : "🔀"} ${t.dir} $${t.entryPrice}→$${t.exitPrice} | $${t.totalPnl}${trail}${pyr} | Bal: $${t.balanceAfter}`);
  });

  return {
    coin, finalBalance: parseFloat(balance.toFixed(2)),
    totalReturn: parseFloat(totalReturn), winRate: parseFloat(winRate),
    totalTrades: trades.length, maxDD: parseFloat(maxDD.toFixed(2)),
    profitFactor: pf, tpCount: tpTrades.length, trailedCount: trailedTrades.length,
    pyrTrades: pyrTrades.length, pyrPnl: parseFloat(pyrPnl.toFixed(2))
  };
}

// ── Entry ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Alpha Bot — 15-мин Backtest (Trailing засварласан хувилбар)`);
  console.log(`   XRP: 1h cooldown | HYPE: 3h cooldown`);
  console.log(`   Trailing: 1 удаа TP өргөсгөж, дараа нь Trailing SL (0.8%)`);
  console.log(`   Period: 90 days | Balance: $${INITIAL_BALANCE} | Leverage: 5x`);
  console.log(`${"=".repeat(60)}`);

  const results = [];
  for (const coin of COINS) {
    const r = await runBacktest(coin);
    if (r) results.push(r);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🏆 НИЙТ ДҮГНЭЛТ`);
  console.log(`${"=".repeat(60)}`);
  results.forEach(r => {
    const arrow = r.totalReturn > 0 ? "📈" : "📉";
    console.log(`${arrow} ${r.coin}: $${INITIAL_BALANCE}→$${r.finalBalance} (${r.totalReturn > 0 ? "+" : ""}${r.totalReturn}%) | WR:${r.winRate}% | TP:${r.tpCount} Trail:${r.trailedCount} SL:${r.totalTrades - r.tpCount - r.trailedCount} | Pyr:+$${r.pyrPnl}`);
  });
}

main().catch(console.error);
