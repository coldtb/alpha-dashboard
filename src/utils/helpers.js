import { store } from '../store/index.js';

// Symbol to CoinGecko ID map for TrueNorth MCP Server queries
export const geckoIdMap = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "SOL": "solana",
  "HYPE": "hyperliquid",
  "LINK": "chainlink",
  "XRP": "ripple",
  "INJ": "injective-protocol",
  "WLD": "worldcoin-wld"
};

// Hand-crafted professional trade plans from Wiki
export const wikiTradePlans = {
  "BTC": {
    planType: "Plan 1: Reclaim Squeeze",
    badgeClass: "change-up",
    entryZone: "$62,450 – $62,700 (Reclaim Trigger)",
    sl: "$61,750 (1H close invalidation)",
    tp1: "$63,070",
    tp2: "$65,000",
    rr: "2.6:1",
    invalidation: "BTC $61.7k-аас доош орж 1H лаа хаагдвал арилжаа хүчингүй болно. Мөн эргэж сэргэх үед volume сул байвал арилжаанаас зайлсхий.",
    desc: "Үнэ GEX Flip ($61,214) болон SMA/VWAP түвшнийг дахин эзэлж (reclaim), нээлттэй short позицуудыг squeeze хийж өсөх боломжтой."
  },
  "HYPE": {
    planType: "Leverage Flush / Mean Reversion",
    badgeClass: "change-up",
    entryZone: "$54.50 – $56.50 (DCA хувааж авах)",
    sl: "$51.80 (June 6 unlock уналтын доод цэгийн доор)",
    tp1: "$65.00 (4H VWAP Mean target)",
    tp2: "$75.50 (ATH retest)",
    rr: "3.1:1",
    invalidation: "June 6-ны томоохон unlock-ны дараа хөшүүрэг бүрэн цэвэрлэгдсэн (flush) тул спот шингээлт дээр тулгуурласан. Хэрэв BTC $60,650-ийг эвдвэл хүлээх хэрэгтэй.",
    desc: "Токен түгжээ тайлалтын борлуулалтын даралтыг спот халимнууд амжилттай шингээж байна. Хөшүүрэг цэвэрлэгдсэн тул аюулгүй шал үнэ (floor) бүрдсэн."
  },
  "LINK": {
    planType: "Volatility Compression / Breakout",
    badgeClass: "change-up",
    entryZone: "$12.80 – $13.20 (Whale accumulation zone)",
    sl: "$11.90 (Whale support-оос доогуур)",
    tp1: "$16.00 (Түүхэн S/R)",
    tp2: "$19.50 (Near ATH level)",
    rr: "3.5:1",
    invalidation: "Хэрэв өдрийн хаалт $11.90-оос доош гарвал халимнууд байрлалаа хамгаалж чадаагүйн дохио тул шууд гарна.",
    desc: "RWA narrative болон сүлжээн дээрх институцийн хуримтлал (Smart Money) хүчтэй байна. Volatility хумигдсан тул дээш тэсрэх магадлал өндөр."
  }
};

// Prompts templates
export const wikiPrompts = [
  {
    title: "PROMPT 1: Derivatives Divergence (Squeeze Setup)",
    desc: "Нээлттэй гэрээ (OI) өсч, funding rate сөрөг болж short squeeze бэлтгэгдэж буй токен олох.",
    code: `Please scan all mid-to-large cap crypto assets to find tokens showing a divergence between price and derivatives metrics.
Identify tokens where:
1. 24h Open Interest (OI) has increased by more than 10%, but spot price is flat/consolidating.
2. Funding Rate is in the bottom 15th percentile (negative / heavily discounted).
3. Dense short liquidation clusters are stacked within 3-5% above spot price.
Return a 1h/4h technical timing and SL anchor based on liquidation heatmap in Mongolian.`
  },
  {
    title: "PROMPT 2: Volatility Compression (Breakout Setup)",
    desc: "Bollinger Bands Width болон ADX ашиглан тэсрэлт хийхэд бэлэн буй токен олох.",
    code: `Please scan for tokens undergoing extreme volatility compression on 4h and 1D timeframes.
Look for:
1. Bollinger Bands Width < 0.04.
2. ADX (14) < 20 (no trend, heavy consolidation).
3. Neutral RSI (between 45 and 55).
Analyze derivatives (OI build-up and liquidation clusters) to determine breakout direction and map entry trigger in Mongolian.`
  },
  {
    title: "PROMPT 3: On-Chain Accumulation & Smart Money",
    desc: "VC-ууд болон ухаалаг арилжаачдын үнэд нөлөөлөхөөс өмнө цуглуулж буй токенуудыг дагах.",
    code: `Please scan on-chain metrics and smart money flows to find accumulated tokens.
Evaluate:
1. Whale/smart money holdings increasing over last 3-7 days while price consolidates.
2. Large token unlocks absorbed with zero sell pressure.
3. Top profit addresses (Smart Traders) silently accumulating.
Select top 2, evaluate technical support for safe entry and SL, output in Mongolian.`
  },
  {
    title: "PROMPT 4: Social Sentiment & Narrative Shift",
    desc: "KOL mention болон хайп дөнгөж эхэлж буй боловч үнэ хараахан тэсрээгүй токен олох.",
    code: `Please scan social intelligence and sentiment indicators to find early narrative shifts.
Look for:
1. Sudden spike in Twitter/X mindshare or KOL mentions over last 24h, but price up < 5%.
2. Upcoming catalysts (mainnet, upgrades, token events) in next 7-14 days.
3. Sector laggards starting to get social buzz.
Select top 2, define entry trigger and TP levels based on key resistances in Mongolian.`
  },
  {
    title: "PROMPT 5: TradingRiot Leverage Flush Scanner",
    desc: "Статистик аномали бүхий хөшүүрэг устгалтын (Leverage Flush) дараах эргэлтийг спот захиалгаар барих.",
    code: `Please scan all mid-to-large cap cryptocurrency markets to identify TradingRiot-style "Leverage Flush" or "Mean Reversion" setups.
Search for:
1. Leverage Flush: Tokens with 24h Liquidation Z-Score >= +2.0, where futures Open Interest (OI) has sharply decreased while spot price hit a major support zone.
2. Funding Rate Z-Score <= -2.0, confirming crowded shorts or whale spot absorption.
3. Spot Order Book Skew: Positive bids-to-asks skew (bids > asks by 1.5x within 2-3% of mark price).
Select top 2, define SL below the flush wick and reversion targets in Mongolian.`
  }
];

export const defaultSocialAlphaTokens = [
  { symbol: "SAIRI", chain: "Base", mcap: "$1.24M", vol: "$320.13K", change: "88.17%", signal: "small-cap momentum watch", address: "0xde61878b0b21ce395266c44D4d548D1C72A3eB07", standout: true },
  { symbol: "HUNCH", chain: "Base", mcap: "$133.51K", vol: "$38.42K", change: "44.40%", signal: "small-cap momentum watch", address: "0xae1F38Aee37F5bbeeded6A69b6454f4954b30Ba3", standout: true },
  { symbol: "SURPLUS", chain: "Base", mcap: "$2.59M", vol: "$614.09K", change: "16.07%", signal: "mid-cap positive continuation", address: "0xC52aeDec3374422d7510E294cfAa90799595CBa3", standout: true },
  { symbol: "BUTTCOIN", chain: "Solana", mcap: "$24.69M", vol: "$1.82M", change: "9.13%", signal: "notable watch", address: "Cm6fNnMk7NfzStP9CZpsQA2v3jjzbcYGAxdJySmHpump", standout: false },
  { symbol: "VELVET", chain: "Ethereum", mcap: "$75.94M", vol: "$0.01", change: "N/A", signal: "notable watch", address: "0x500353D40e8cEbA7f4710E972809D03f270a0dAa", standout: true },
  { symbol: "GSPEED", chain: "Base", mcap: "$631.60K", vol: "$154.13K", change: "-8.82%", signal: "notable watch", address: "0xA0dD634A9D3C91829081Fc66B90103A3E5c6aeeC", standout: true },
  { symbol: "CAP", chain: "Base", mcap: "$435.51K", vol: "$6.71K", change: "-9.98%", signal: "notable watch", address: "0xbfa733702305280F066D470afDFA784fA70e2649", standout: true }
];

export function floatParse(val) {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
}

export function formatVolume(val) {
  if (val >= 1e9) return (val / 1e9).toFixed(2) + "B";
  if (val >= 1e6) return (val / 1e6).toFixed(2) + "M";
  if (val >= 1e3) return (val / 1e3).toFixed(2) + "K";
  return val.toFixed(2);
}

export function getAssetName(sym) {
  const names = {
    "BTC": "Bitcoin",
    "ETH": "Ethereum",
    "SOL": "Solana",
    "HYPE": "Hyperliquid",
    "LINK": "Chainlink",
    "XRP": "Ripple",
    "INJ": "Injective",
    "WLD": "Worldcoin"
  };
  return names[sym] || "Altcoin Perp";
}

export function formatPriceText(price) {
  if (price === 0) return "-";
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 10) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getScannedCoin(symbol) {
  return store.top100Coins.find(c => c.symbol === symbol) || 
         (store.watchlistPrices[symbol] && store.watchlistPrices[symbol].price > 0 ? {
           symbol: symbol,
           price: store.watchlistPrices[symbol].price,
           change: store.watchlistPrices[symbol].change,
           volume: 50000000,
           funding: -0.0001,
           high: store.watchlistPrices[symbol].price * 1.03,
           low: store.watchlistPrices[symbol].price * 0.97
         } : null);
}

// Auto-detect trade direction based on funding rate, VWAP, S/R, momentum
export function detectAutoDirection(coin, taData = null) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  let score = 0;

  if (funding < -0.0001) {
    score += 2;
  } else if (funding < 0) {
    score += 1;
  } else if (funding > 0.0001) {
    score -= 2;
  } else if (funding > 0) {
    score -= 1;
  }

  if (taData?.support_resistance?.vwap?.cumulative) {
    const vwapData = taData.support_resistance.vwap.cumulative;
    if (vwapData.state === 'price_above' && vwapData.slope === 'up') {
      score += 2;
    } else if (vwapData.state === 'price_below' && vwapData.slope === 'down') {
      score -= 2;
    } else if (vwapData.state === 'price_below' && vwapData.slope === 'up' && funding < 0) {
      score += 1;
    } else if (vwapData.state === 'price_above' && vwapData.slope === 'down' && funding > 0) {
      score -= 1;
    }
  }

  if (taData?.support_resistance?.['support and resistance channel']?.channels) {
    const channels = [...taData.support_resistance['support and resistance channel'].channels]
      .sort((a, b) => b.strength - a.strength);
    const strongSupport = channels.find(c => c.hi <= coin.price && c.strength >= 80);
    const strongResistance = channels.find(c => c.lo >= coin.price && c.strength >= 80);
    if (strongSupport && !strongResistance) score += 1;
    else if (strongResistance && !strongSupport) score -= 1;
  }

  if (change24h > 3) score += 1;
  else if (change24h < -3) score -= 1;

  if (score > 0) return 'LONG';
  if (score < 0) return 'SHORT';
  return change24h >= 0 ? 'LONG' : 'SHORT';
}

export function calculateScore(coin, isHyperliquidScale = false) {
  let score = 0;
  const change = Math.abs(coin.change);
  if (change <= 3.0) {
    score += 30;
    if (change <= 1.5) score += 10;
  }
  
  const absFunding = Math.abs(coin.funding || 0);
  if (absFunding > 0) {
    score += 20;
    if (absFunding >= 0.0005) {
      score += 15;
    } else if (absFunding >= 0.0002) {
      score += 10;
    }
  }

  const vol = coin.volume;
  if (isHyperliquidScale) {
    if (vol > 30000000) score += 20;
    else if (vol > 15000000) score += 15;
    else if (vol > 5000000) score += 10;
  } else {
    if (vol > 100000000) score += 20;
    else if (vol > 50000000) score += 15;
    else if (vol > 10000000) score += 10;
  }

  const watchlist = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];
  if (watchlist.includes(coin.symbol)) {
    score += 15;
  }
  return Math.min(score, 100);
}

export function calculateCustomSetupScore(plan) {
  const { symbol, direction, entry, sl, tp } = plan;
  
  const matchedCoin = getScannedCoin(symbol);
  const baseScore = matchedCoin ? calculateScore(matchedCoin) : 50;

  const risk   = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr     = risk > 0 ? reward / risk : 0;
  const slPct  = entry > 0 ? (risk / entry * 100) : 0;

  return {
    total: baseScore,
    rr: rr.toFixed(2),
    slPct: slPct.toFixed(2)
  };
}

export function getTrueNorthKeyLevels(coin) {
  if (!coin || coin.price === 0) return null;
  const high = coin.high || coin.price * 1.03;
  const low = coin.low || coin.price * 0.97;
  const price = coin.price;
  
  const fib0618 = high - (high - low) * 0.618;
  const vwap = (high + low + price) / 3;
  const shortLiqCluster = price * 1.025;
  const longLiqCluster = price * 0.975;
  
  return { fib0618, vwap, shortLiqCluster, longLiqCluster };
}

export function computeStrategyLevels(coin, dir, taData, derivData = null, optionsData = null, useSmartSlTp = true) {
  const price   = coin.price;
  const dec     = price < 1 ? 6 : (price < 10 ? 4 : 2);

  let high = coin.high || price * 1.03;
  let low  = coin.low  || price * 0.97;
  let vwap = (high + low + price) / 3;
  let channels = [];

  let entry = price;
  let sl    = dir === 'LONG' ? price * 0.97 : price * 1.03;
  let tp    = dir === 'LONG' ? price * 1.06 : price * 0.94;
  let reason = 'fallback';

  if (taData?.support_resistance) {
    const sr = taData.support_resistance;
    if (sr.vwap?.cumulative) vwap = sr.vwap.cumulative.value;
    if (sr.recent_high_low?.calendar) {
      const hl = sr.recent_high_low.calendar;
      if (hl.high_24h) high = hl.high_24h;
      if (hl.low_24h)  low  = hl.low_24h;
    }
    if (sr['support and resistance channel']?.channels) {
      channels = [...sr['support and resistance channel'].channels]
        .sort((a, b) => b.strength - a.strength);
    }
  }

  // 1. Calculate standard levels first
  if (dir === 'LONG') {
    const supports = channels.filter(c => c.hi <= price).sort((a, b) => b.hi - a.hi);
    const resistances = channels.filter(c => c.lo >= price).sort((a, b) => a.lo - b.lo);

    if (supports.length > 0) {
      const nearSupport = supports[0];
      sl = nearSupport.lo * 0.985;
      reason = 'sr_channel';

      if (resistances.length > 0) {
        const rr1target = entry + (entry - sl) * 1.5;
        tp = resistances[0].lo >= rr1target ? resistances[0].lo : rr1target;
        if (resistances.length > 1) {
          const rr2target = entry + (entry - sl) * 2.5;
          tp = resistances[1].lo >= rr2target ? resistances[1].lo : rr2target;
        }
      } else {
        const minTp = entry + (entry - sl) * 1.5;
        tp = vwap > minTp ? vwap : entry + (entry - sl) * 2;
      }
    } else {
      sl    = low * 0.985;
      reason = 'fib_fallback';

      const minTp = entry + (entry - sl) * 1.5;
      tp    = vwap > minTp ? vwap : entry + (entry - sl) * 2;
    }
  } else {
    const resistances = channels.filter(c => c.lo >= price).sort((a, b) => a.lo - b.lo);
    const supports    = channels.filter(c => c.hi <= price).sort((a, b) => b.hi - a.hi);

    if (resistances.length > 0) {
      const nearRes = resistances[0];
      sl = nearRes.hi * 1.015;
      reason = 'sr_channel';

      if (supports.length > 0) {
        const rr1target = entry - (sl - entry) * 1.5;
        tp = supports[0].hi <= rr1target ? supports[0].hi : rr1target;
        if (supports.length > 1) {
          const rr2target = entry - (sl - entry) * 2.5;
          tp = supports[1].hi <= rr2target ? supports[1].hi : rr2target;
        }
      } else {
        const minTp = entry - (sl - entry) * 1.5;
        tp = vwap < minTp ? vwap : entry - (sl - entry) * 2;
      }
    } else {
      sl    = high * 1.015;
      reason = 'fib_fallback';

      const minTp = entry - (sl - entry) * 1.5;
      tp    = vwap < minTp ? vwap : entry - (sl - entry) * 2;
    }
  }

  // 2. Parse Options and Derivatives data
  let putWall = null;
  let callWall = null;
  let shortLiqMagnet = null;
  let longLiqMagnet = null;

  if (optionsData?.result?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(optionsData.result.content[0].text);
      if (parsed?.summary?.key_levels) {
        putWall = parsed.summary.key_levels.nearest_put_wall;
        callWall = parsed.summary.key_levels.nearest_call_wall;
      }
    } catch (e) {
      console.warn("Could not parse options report for smart levels:", e.message);
    }
  }

  // Squeeze-aware SL Adjustment
  if (useSmartSlTp && derivData?.derivative_data?.[coin.symbol]) {
    try {
      const deriv = derivData.derivative_data[coin.symbol];
      const liqKey = Object.keys(deriv).find(k => k.toLowerCase().includes('liquidation'));
      if (liqKey) {
        const liqMap = deriv[liqKey];
        if (dir === 'LONG') {
          const longLiqs = liqMap.max_liquidation_points?.max_long_liquidation_point || [];
          const sortedLiqs = longLiqs
            .filter(l => l.liq_usd >= 2000000)
            .sort((a, b) => b.price - a.price);
          
          if (sortedLiqs.length > 0) {
            const nearestLiq = sortedLiqs[0].price;
            if (nearestLiq > sl && nearestLiq < entry) {
              const oldSl = sl;
              sl = nearestLiq * 1.002;
              reason += `+squeeze_sl_long(old:${oldSl.toFixed(dec)}->new:${sl.toFixed(dec)}@liq:${nearestLiq})`;
            }
          }
        } else {
          const shortLiqs = liqMap.max_liquidation_points?.max_short_liquidation_point || [];
          const sortedLiqs = shortLiqs
            .filter(l => l.liq_usd >= 2000000)
            .sort((a, b) => a.price - b.price);
          
          if (sortedLiqs.length > 0) {
            const nearestLiq = sortedLiqs[0].price;
            if (nearestLiq < sl && nearestLiq > entry) {
              const oldSl = sl;
              sl = nearestLiq * 0.998;
              reason += `+squeeze_sl_short(old:${oldSl.toFixed(dec)}->new:${sl.toFixed(dec)}@liq:${nearestLiq})`;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not calculate liquidation squeeze levels:", e.message);
    }
  }

  if (derivData?.derivative_data) {
    try {
      const sym = Object.keys(derivData.derivative_data).find(k => k !== '_metadata' && k !== 'url' && k !== 'title');
      if (sym) {
        const d = derivData.derivative_data[sym];
        const liqKey = Object.keys(d).find(k => k.toLowerCase().includes('liquidation'));
        if (liqKey) {
          const liq = d[liqKey];
          const shortLiqs = liq.max_liquidation_points?.max_short_liquidation_point || [];
          const longLiqs = liq.max_liquidation_points?.max_long_liquidation_point || [];
          if (shortLiqs.length > 0) {
            const sortedShort = [...shortLiqs].sort((a, b) => b.liq_usd - a.liq_usd);
            shortLiqMagnet = sortedShort[0].price;
          }
          if (longLiqs.length > 0) {
            const sortedLong = [...longLiqs].sort((a, b) => b.liq_usd - a.liq_usd);
            longLiqMagnet = sortedLong[0].price;
          }
        }
      }
    } catch (e) {
      console.warn("Could not parse derivatives data for smart levels:", e.message);
    }
  }

  // 3. Apply Smart TP/SL Adjustments
  if (useSmartSlTp) {
    if (dir === 'LONG') {
      let slAdjusted = false;
      let tpAdjusted = false;

      if (putWall && putWall < entry && putWall > entry * 0.95) {
        sl = putWall * 0.992;
        slAdjusted = true;
      }

      let smartTp = null;
      if (shortLiqMagnet && shortLiqMagnet > entry) {
        smartTp = shortLiqMagnet;
      } else if (callWall && callWall > entry) {
        smartTp = callWall * 0.998;
      }

      if (smartTp) {
        const minTp = entry + (entry - sl) * 1.5;
        const maxTpLimit = Math.min(entry * 1.04, entry + (entry - sl) * 3.0);
        
        if (smartTp >= minTp) {
          if (smartTp > maxTpLimit) {
            tp = Math.min(entry * 1.03, entry + (entry - sl) * 2.0);
            reason += `_tp_capped(old:${smartTp.toFixed(dec)})`;
          } else {
            tp = smartTp;
          }
          tpAdjusted = true;
        }
      }

      if (slAdjusted || tpAdjusted) {
        reason += `+smart_levels(SL:${slAdjusted ? 'put_wall' : 'default'},TP:${tpAdjusted ? 'options_liq' : 'default'})`;
      }
    } else {
      let slAdjusted = false;
      let tpAdjusted = false;

      if (callWall && callWall > entry && callWall < entry * 1.05) {
        sl = callWall * 1.008;
        slAdjusted = true;
      }

      let smartTp = null;
      if (longLiqMagnet && longLiqMagnet < entry) {
        smartTp = longLiqMagnet;
      } else if (putWall && putWall < entry) {
        smartTp = putWall * 1.002;
      }

      if (smartTp) {
        const minTp = entry - (sl - entry) * 1.5;
        const maxTpLimit = Math.max(entry * 0.96, entry - (sl - entry) * 3.0);
        
        if (smartTp <= minTp) {
          if (smartTp < maxTpLimit) {
            tp = Math.max(entry * 0.97, entry - (sl - entry) * 2.0);
            reason += `_tp_capped(old:${smartTp.toFixed(dec)})`;
          } else {
            tp = smartTp;
          }
          tpAdjusted = true;
        }
      }

      if (slAdjusted || tpAdjusted) {
        reason += `+smart_levels(SL:${slAdjusted ? 'call_wall' : 'default'},TP:${tpAdjusted ? 'options_liq' : 'default'})`;
      }
    }
  }

  // 4. Final Safety Enforcements
  if (dir === 'LONG') {
    const maxSlAllowed = entry * (1 - store.activeBotConfig.minSlBuffer);
    if (sl > maxSlAllowed) {
      sl = maxSlAllowed;
    }
    const minTpAllowed = entry * (1 + store.activeBotConfig.minTpBuffer);
    if (tp < minTpAllowed) {
      tp = minTpAllowed;
    }
  } else {
    const minSlAllowed = entry * (1 + store.activeBotConfig.minSlBuffer);
    if (sl < minSlAllowed) {
      sl = minSlAllowed;
    }
    const maxTpAllowed = entry * (1 - store.activeBotConfig.minTpBuffer);
    if (tp > maxTpAllowed) {
      tp = maxTpAllowed;
    }
  }

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl:    parseFloat(sl.toFixed(dec)),
    tp:    parseFloat(tp.toFixed(dec)),
    reason
  };
}
