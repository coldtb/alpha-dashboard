import { ExchangeClient, InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

// Symbol to CoinGecko ID map for TrueNorth MCP Server queries
const geckoIdMap = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "SOL": "solana",
  "HYPE": "hyperliquid",
  "LINK": "chainlink",
  "XRP": "ripple",
  "INJ": "injective-protocol",
  "WLD": "worldcoin-org",
  "ZEC": "zcash",
  "XLM": "stellar",
  "TRX": "tron"
};

// Generic JSON-RPC tool caller helper for TrueNorth
async function callTrueNorthMcp(toolName, args) {
  const token = 'ak_6bab536248be4a1896a4ea54de7b8377';
  const url = `https://mcp.true-north.xyz/mcp?token=${token}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  if (!response.ok) {
    throw new Error(`TrueNorth MCP Server error: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.substring(6).trim();
      return JSON.parse(dataStr);
    }
  }
  throw new Error("Invalid TrueNorth SSE response format");
}

// Direction detection
function detectAutoDirection(coin, taData = null) {
  const funding = coin.funding || 0;
  const change24h = coin.change || 0;
  let score = 0;

  if (funding < -0.0001) {
    score += 2;
  } else if (funding < 0) {
    score += 1;
  } else if (funding > 0.001) {
    score -= 2;
  } else if (funding > 0.0003) {
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

  return score >= 0 ? 'LONG' : 'SHORT';
}

// Level computation
function computeStrategyLevels(coin, dir, taData, derivData, optionsData, useSmartSlTp = true) {
  const price   = coin.price;
  const funding = coin.funding || 0;
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
      entry = nearSupport.hi;
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
      entry = high - (high - low) * 0.618;
      sl    = low * 0.985;
      const minTp = entry + (entry - sl) * 1.5;
      tp    = vwap > minTp ? vwap : entry + (entry - sl) * 2;
      reason = 'fib_fallback';
    }

    if (funding < -0.0005) {
      entry = price;
      reason += '+squeeze_entry';
    }
  } else {
    const resistances = channels.filter(c => c.lo >= price).sort((a, b) => a.lo - b.lo);
    const supports    = channels.filter(c => c.hi <= price).sort((a, b) => b.hi - a.hi);

    if (resistances.length > 0) {
      const nearRes = resistances[0];
      entry = nearRes.lo;
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
      entry = high - (high - low) * 0.382;
      sl    = high * 1.015;
      const minTp = entry - (sl - entry) * 1.5;
      tp    = vwap < minTp ? vwap : entry - (sl - entry) * 2;
      reason = 'fib_fallback';
    }

    if (funding > 0.001) {
      entry = price;
      reason += '+overextended_long';
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

    // Smart SL: Place below Put Wall if Put Wall is close enough (within 5% of entry)
    if (putWall && putWall < entry && putWall > entry * 0.95) {
      sl = putWall * 0.992; // 0.8% safety cushion below the put wall
      slAdjusted = true;
    }

    // Smart TP: Target Short Liquidation Magnet or Call Wall
    let smartTp = null;
    if (shortLiqMagnet && shortLiqMagnet > entry) {
      smartTp = shortLiqMagnet;
    } else if (callWall && callWall > entry) {
      smartTp = callWall * 0.998; // target just below call wall
    }

    // Enforce 1.5x R:R on the adjusted TP
    if (smartTp) {
      const minTp = entry + (entry - sl) * 1.5;
      if (smartTp >= minTp) {
        tp = smartTp;
        tpAdjusted = true;
      }
    }

    if (slAdjusted || tpAdjusted) {
      reason += `+smart_levels(SL:${slAdjusted ? 'put_wall' : 'default'},TP:${tpAdjusted ? 'options_liq' : 'default'})`;
    }
  } else {
    let slAdjusted = false;
    let tpAdjusted = false;

    // Smart SL: Place above Call Wall if within 5% of entry
    if (callWall && callWall > entry && callWall < entry * 1.05) {
      sl = callWall * 1.008; // 0.8% safety cushion above the call wall
      slAdjusted = true;
    }

    // Smart TP: Target Long Liquidation Magnet or Put Wall
    let smartTp = null;
    if (longLiqMagnet && longLiqMagnet < entry) {
      smartTp = longLiqMagnet;
    } else if (putWall && putWall < entry) {
      smartTp = putWall * 1.002; // target just above put wall
    }

    // Enforce 1.5x R:R
    if (smartTp) {
      const minTp = entry - (sl - entry) * 1.5;
      if (smartTp <= minTp) {
        tp = smartTp;
        tpAdjusted = true;
      }
    }

    if (slAdjusted || tpAdjusted) {
      reason += `+smart_levels(SL:${slAdjusted ? 'call_wall' : 'default'},TP:${tpAdjusted ? 'options_liq' : 'default'})`;
    }
  }
}

  return {
    entry: parseFloat(entry.toFixed(dec)),
    sl:    parseFloat(sl.toFixed(dec)),
    tp:    parseFloat(tp.toFixed(dec)),
    reason
  };
}

// Calculate Market Score
function calculateScore(coin, isHyperliquidScale = false) {
  let score = 0;
  const change = Math.abs(coin.change);
  if (change <= 3.0) {
    score += 30;
    if (change <= 1.5) score += 10;
  }
  if (coin.funding < 0) {
    score += 20;
    if (coin.funding <= -0.0005) {
      score += 15;
    } else if (coin.funding <= -0.0002) {
      score += 10;
    }
  } else {
    if (coin.funding > 0.0003 && change <= 3.0) {
      score += 15;
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

// Helper to format floats to EIP-712 strings
function formatPrice(price) {
  return Number(price.toPrecision(5)).toString();
}

function formatSize(sz, decimals) {
  const factor = Math.pow(10, decimals);
  const rounded = Math.ceil(parseFloat(sz) * factor) / factor;
  return rounded.toFixed(decimals);
}

function getTriggerLimitPrice(isBuyTrigger, triggerPx) {
  return isBuyTrigger ? triggerPx * 1.10 : triggerPx * 0.90;
}

export default async function handler(req, res) {
  // 1. Cron Auth Check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && process.env.NODE_ENV !== 'development') {
    const authHeader = req.headers['authorization'] || req.query.secret;
    const expected = `Bearer ${cronSecret}`;
    if (authHeader !== expected && req.query.secret !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // 2. Private Key Check
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;
  if (!privateKey || !walletAddress) {
    return res.status(400).json({ error: "Missing HYPERLIQUID_PRIVATE_KEY or HYPERLIQUID_WALLET_ADDRESS in environment variables." });
  }

  try {
    // 3. Initialize Clients
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
    const exchange = new ExchangeClient({ transport, wallet: account });

    // 4. Fetch Scanner Data directly from Hyperliquid and try fetching from Binance
    const [metaAndCtxs, initialUserState, initialOpenOrders, initialSpotState] = await Promise.all([
      info.metaAndAssetCtxs(),
      info.clearinghouseState({ user: walletAddress }),
      info.frontendOpenOrders({ user: walletAddress }),
      info.spotClearinghouseState({ user: walletAddress }).catch(() => null)
    ]);
    const [hlMeta, hlAssetCtxs] = metaAndCtxs;
    let openOrders = initialOpenOrders;
    let userState = initialUserState;
    let spotState = initialSpotState;

    let binanceData = null;
    try {
      const [resTicker, resFunding] = await Promise.all([
        fetch("https://fapi.binance.com/fapi/v1/ticker/24hr").then(r => r.json()),
        fetch("https://fapi.binance.com/fapi/v1/premiumIndex").then(r => r.json())
      ]);
      if (Array.isArray(resTicker) && Array.isArray(resFunding)) {
        binanceData = { tickers: resTicker, premiumData: resFunding };
      }
    } catch (e) {
      console.warn("Failed to fetch from Binance, falling back to Hyperliquid data:", e.message);
    }

    let scoredCoins = [];
    if (binanceData) {
      const fundingMap = {};
      binanceData.premiumData.forEach(item => {
        fundingMap[item.symbol] = {
          fundingRate: parseFloat(item.lastFundingRate) || 0,
          markPrice: parseFloat(item.markPrice) || 0
        };
      });

      const binanceCoins = {};
      binanceData.tickers.forEach(coin => {
        const fundingInfo = fundingMap[coin.symbol] || { fundingRate: 0.0001, markPrice: parseFloat(coin.lastPrice) };
        const change = parseFloat(coin.priceChangePercent) || 0;
        const volume = parseFloat(coin.quoteVolume) || 0;
        const price = fundingInfo.markPrice || parseFloat(coin.lastPrice);
        const symbolBase = coin.symbol.replace("USDT", "");
        
        binanceCoins[symbolBase] = {
          symbol: symbolBase,
          price,
          change,
          volume,
          funding: fundingInfo.fundingRate,
          high: parseFloat(coin.highPrice) || price * 1.03,
          low: parseFloat(coin.lowPrice) || price * 0.97
        };
      });

      scoredCoins = hlMeta.universe.map((asset, index) => {
        const binCoin = binanceCoins[asset.name];
        if (!binCoin) return null; // Only trade coins that exist on Binance

        const ctx = hlAssetCtxs[index];
        const hlPrice = parseFloat(ctx?.markPx || ctx?.midPx || binCoin.price);

        const coinData = {
          ...binCoin,
          price: hlPrice // Use Hyperliquid's actual live price for execution
        };

        return {
          ...coinData,
          score: calculateScore(coinData, false),
          assetIndex: index,
          assetInfo: asset
        };
      }).filter(Boolean);
      
      console.log("Using Binance scanner data. Scored coins count:", scoredCoins.length);
    } else {
      // Fallback: Use Hyperliquid data directly
      scoredCoins = hlMeta.universe.map((asset, index) => {
        const ctx = hlAssetCtxs[index];
        if (!ctx) return null;

        const price = parseFloat(ctx.markPx || ctx.midPx || "0");
        const prevPrice = parseFloat(ctx.prevDayPx || "0") || price;
        const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
        const volume = parseFloat(ctx.dayNtlVlm || "0");
        const funding = parseFloat(ctx.funding || "0") * 8; // Convert hourly funding to 8h equivalent

        const coinData = {
          symbol: asset.name,
          price: price,
          change: change,
          volume: volume,
          funding: funding,
          high: price * 1.03,
          low: price * 0.97,
        };

        return {
          ...coinData,
          score: calculateScore(coinData, true),
          assetIndex: index,
          assetInfo: asset
        };
      }).filter(Boolean);
      
      console.log("Using Hyperliquid fallback scanner data. Scored coins count:", scoredCoins.length);
    }

    // Sort by score descending, then by volume descending
    scoredCoins.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.volume - a.volume;
    });

    console.log("Top 5 candidates:", scoredCoins.slice(0, 5).map(c => ({
      symbol: c.symbol,
      score: c.score,
      price: c.price,
      change: parseFloat(c.change.toFixed(2)),
      funding: c.funding,
      volume: Math.round(c.volume)
    })));

    const minScore = req.query.min_score ? parseInt(req.query.min_score) : (process.env.HYPERLIQUID_MIN_SCORE ? parseInt(process.env.HYPERLIQUID_MIN_SCORE) : 85);
    const replacementScoreDiff = process.env.HYPERLIQUID_REPLACEMENT_SCORE_DIFF 
      ? parseInt(process.env.HYPERLIQUID_REPLACEMENT_SCORE_DIFF) 
      : 5; // default 5 points

    // 5. Cancel stale unfilled limit entry orders (and their associated TP/SL) if their score is no longer >= minScore
    const cancels = [];
    const coinsWithPendingOrders = new Set();
    for (const order of openOrders) {
      const hasPosition = userState.assetPositions.some(p => p.position.coin === order.coin && parseFloat(p.position.s) !== 0);
      if (!hasPosition) {
        coinsWithPendingOrders.add(order.coin);
      }
    }
    console.log(`[Stale Cleanup] Open orders count: ${openOrders.length}, pending coins found: ${Array.from(coinsWithPendingOrders).join(", ")}`);

    // Find the highest score among all tradeable candidates (no positions, no open orders)
    const potentialCandidates = scoredCoins.filter(c => 
      c.score >= minScore && 
      !openOrders.some(o => o.coin === c.symbol) && 
      !userState.assetPositions.some(p => p.position.coin === c.symbol && parseFloat(p.position.s) !== 0)
    );
    const bestCand = potentialCandidates[0]; // Since scoredCoins is already sorted descending, the first is the best
    const bestCandScore = bestCand ? bestCand.score : 0;
    console.log(`[Stale Cleanup] Best tradeable candidate in market: ${bestCand ? bestCand.symbol : 'None'} (Score: ${bestCandScore})`);

    for (const coinSymbol of coinsWithPendingOrders) {
      const currentCoin = scoredCoins.find(c => c.symbol === coinSymbol);
      const currentScore = currentCoin ? currentCoin.score : 0;

      let shouldCancel = false;
      let cancelReason = "";

      if (currentScore < minScore) {
        shouldCancel = true;
        cancelReason = `Current Score ${currentScore} is below Min Score ${minScore}`;
      } else if (bestCandScore - currentScore >= replacementScoreDiff) {
        shouldCancel = true;
        cancelReason = `A better candidate exists: ${bestCand.symbol} (Score: ${bestCandScore}) has a score higher than ${coinSymbol} (Score: ${currentScore}) by >= ${replacementScoreDiff} points`;
      }

      if (shouldCancel) {
        const assetIndex = hlMeta.universe.findIndex(a => a.name === coinSymbol);
        if (assetIndex !== -1) {
          const coinOrders = openOrders.filter(o => o.coin === coinSymbol);
          coinOrders.forEach(o => {
            cancels.push({ a: assetIndex, o: o.oid });
          });
          console.log(`Scheduling cancellation of all pending orders for ${coinSymbol}. Reason: ${cancelReason}`);
        }
      }
    }

    if (cancels.length > 0) {
      try {
        const cancelRes = await exchange.cancel({ cancels });
        console.log("Stale/orphaned orders cancelled successfully:", JSON.stringify(cancelRes));
        // Refresh openOrders and userState to reflect freed margin
        openOrders = await info.frontendOpenOrders({ user: walletAddress });
        userState = await info.clearinghouseState({ user: walletAddress });
        if (spotState) {
          spotState = await info.spotClearinghouseState({ user: walletAddress }).catch(() => null);
        }
        console.log(`[Stale Cleanup] States refreshed after cancellation. New withdrawable balance: $${userState.withdrawable}`);
      } catch (e) {
        console.error("Failed to cancel stale orders:", e.message);
      }
    }

    // 5b. Active Position Trailing (Breakeven & Profit Trailing)
    let needsOrdersRefresh = false;
    for (const pos of userState.assetPositions) {
      const size = parseFloat(pos.position.s || "0");
      if (size === 0) continue;

      const coin = pos.position.coin;
      const entryPx = parseFloat(pos.position.entryPx || "0");
      if (entryPx === 0) continue;

      // Find current mark price from scanner
      const currentCoin = scoredCoins.find(c => c.symbol === coin);
      if (!currentCoin) continue;
      const currentPrice = currentCoin.price;

      const isLong = size > 0;
      const returnPct = isLong ? (currentPrice - entryPx) / entryPx : (entryPx - currentPrice) / entryPx;

      // Find active trigger orders for this coin
      const coinOrders = openOrders.filter(o => o.coin === coin && o.isTrigger);
      
      // Stop Loss is a trigger order whose price is on the loss side of the entry
      const slOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) < entryPx : parseFloat(o.triggerPx) > entryPx));
      
      // Take Profit is a trigger order whose price is on the profit side of the entry
      const tpOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) > entryPx : parseFloat(o.triggerPx) < entryPx));

      // A. Breakeven Stop Loss: if in profit >= 1.5%, move SL to entry
      if (returnPct >= 0.015 && slOrder && parseFloat(slOrder.triggerPx) !== entryPx) {
        console.log(`[Breakeven] Position ${coin} is in profit by ${(returnPct * 100).toFixed(2)}%. Moving SL to entry: ${entryPx}`);
        try {
          // Cancel old SL
          const cancelRes = await exchange.cancel({
            cancels: [{ a: currentCoin.assetIndex, o: slOrder.oid }]
          });
          console.log(`[Breakeven] Cancelled old SL order ${slOrder.oid}:`, JSON.stringify(cancelRes));

          // Place new SL at entry price
          const entrySz = formatSize(Math.abs(size), currentCoin.assetInfo.szDecimals);
          const entryPxStr = formatPrice(entryPx);
          const slWorstPx = formatPrice(getTriggerLimitPrice(!isLong, entryPx));

          const orderRes = await exchange.order({
            orders: [{
              a: currentCoin.assetIndex,
              b: !isLong,
              p: slWorstPx,
              s: entrySz,
              r: true,
              t: {
                trigger: {
                  triggerPx: entryPxStr,
                  isMarket: true,
                  tpsl: "sl"
                }
              }
            }]
          });
          console.log(`[Breakeven] Placed new SL at entry for ${coin}:`, JSON.stringify(orderRes));
          needsOrdersRefresh = true;
        } catch (e) {
          console.error(`[Breakeven] Failed to move SL for ${coin}:`, e.message);
        }
      }

      // B. Profit Trailing: if price gets within 0.8% of TP and score is high (>= 90), trail TP higher
      if (tpOrder && currentCoin.score >= 90) {
        const tpPx = parseFloat(tpOrder.triggerPx);
        const isNearTp = isLong ? currentPrice >= tpPx * 0.992 : currentPrice <= tpPx * 1.008;

        if (isNearTp) {
          const newTpPx = isLong ? currentPrice * 1.02 : currentPrice * 0.98; // trail by another 2%
          const newSlPx = tpPx; // Lock in original TP profit!

          console.log(`[Profit Trailing] Position ${coin} is near TP (${tpPx}). Score is ${currentCoin.score}. Trailing TP to ${newTpPx.toFixed(4)} and raising SL to ${newSlPx.toFixed(4)}`);
          try {
            // Cancel old TP and SL
            const cancelsToMake = [{ a: currentCoin.assetIndex, o: tpOrder.oid }];
            if (slOrder) {
              cancelsToMake.push({ a: currentCoin.assetIndex, o: slOrder.oid });
            }
            await exchange.cancel({ cancels: cancelsToMake });
            console.log(`[Profit Trailing] Cancelled old TP/SL orders for ${coin}`);

            // Place new TP and SL
            const entrySz = formatSize(Math.abs(size), currentCoin.assetInfo.szDecimals);
            
            const newTpPxStr = formatPrice(newTpPx);
            const tpWorstPx = formatPrice(getTriggerLimitPrice(!isLong, newTpPx));

            const newSlPxStr = formatPrice(newSlPx);
            const slWorstPx = formatPrice(getTriggerLimitPrice(!isLong, newSlPx));

            const orderRes = await exchange.order({
              orders: [
                // New TP
                {
                  a: currentCoin.assetIndex,
                  b: !isLong,
                  p: tpWorstPx,
                  s: entrySz,
                  r: true,
                  t: {
                    trigger: {
                      triggerPx: newTpPxStr,
                      isMarket: true,
                      tpsl: "tp"
                    }
                  }
                },
                // New SL (Locking in original TP price)
                {
                  a: currentCoin.assetIndex,
                  b: !isLong,
                  p: slWorstPx,
                  s: entrySz,
                  r: true,
                  t: {
                    trigger: {
                      triggerPx: newSlPxStr,
                      isMarket: true,
                      tpsl: "sl"
                    }
                  }
                }
              ],
              grouping: "normalTpsl"
            });
            console.log(`[Profit Trailing] Successfully trailed TP/SL for ${coin}:`, JSON.stringify(orderRes));
            needsOrdersRefresh = true;
          } catch (e) {
            console.error(`[Profit Trailing] Failed to trail TP/SL for ${coin}:`, e.message);
          }
        }
      }
    }

    if (needsOrdersRefresh) {
      try {
        openOrders = await info.frontendOpenOrders({ user: walletAddress });
      } catch (e) {
        console.error("Failed to refresh openOrders after trailing:", e.message);
      }
    }

    // 5c. Limit Order Entry Level Trailing
    const entryShiftThreshold = process.env.HYPERLIQUID_ENTRY_SHIFT_THRESHOLD 
      ? parseFloat(process.env.HYPERLIQUID_ENTRY_SHIFT_THRESHOLD) 
      : 0.0075; // default 0.75%

    // Re-evaluate pending orders to see if they need level trailing
    const pendingCoins = new Set();
    for (const order of openOrders) {
      const hasPosition = userState.assetPositions.some(p => p.position.coin === order.coin && parseFloat(p.position.s) !== 0);
      if (!hasPosition) {
        pendingCoins.add(order.coin);
      }
    }

    let needsOrdersRefreshAfterTrailing = false;
    for (const coinSymbol of pendingCoins) {
      const currentCoin = scoredCoins.find(c => c.symbol === coinSymbol);
      if (!currentCoin) {
        console.log(`[Entry Trailing] Skip check for ${coinSymbol}: coin not found in scanner.`);
        continue;
      }
      if (currentCoin.score < minScore) {
        console.log(`[Entry Trailing] Skip check for ${coinSymbol}: score ${currentCoin.score} is below min ${minScore}.`);
        continue;
      }

      // Find existing Limit Entry order
      const coinOrders = openOrders.filter(o => o.coin === coinSymbol);
      const entryOrder = coinOrders.find(o => !o.isTrigger && (!o.triggerPx || parseFloat(o.triggerPx) === 0));
      console.log(`[Entry Trailing] Found pending coin ${coinSymbol} with ${coinOrders.length} open orders. Existing entry order: ${entryOrder ? entryOrder.limitPx : 'None'}`);

      const geckoId = geckoIdMap[coinSymbol];
      let taData = null;
      let derivData = null;
      let optionsData = null;

      if (geckoId) {
        try {
          const results = await Promise.allSettled([
            callTrueNorthMcp('technical_analysis', { token_address: geckoId, timeframe: '1h' }),
            callTrueNorthMcp('derivatives_analysis', { token_address: geckoId }),
            callTrueNorthMcp('options_report', { token_address: geckoId })
          ]);
          
          if (results[0].status === 'fulfilled') taData = results[0].value;
          if (results[1].status === 'fulfilled') derivData = results[1].value;
          if (results[2].status === 'fulfilled') optionsData = results[2].value;
        } catch (e) {
          console.error(`[Entry Trailing] TrueNorth MCP query failed for ${coinSymbol}:`, e.message);
        }
      }

      const useSmartSlTp = process.env.USE_SMART_SL_TP !== 'false' && req.query.smart_sl_tp !== 'false';
      const direction = detectAutoDirection(currentCoin, taData);
      const levels = computeStrategyLevels(currentCoin, direction, taData, derivData, optionsData, useSmartSlTp);
      console.log(`[Entry Trailing] Calculated levels for ${coinSymbol} - Direction: ${direction}, New Entry: ${levels.entry}, TP: ${levels.tp}, SL: ${levels.sl}`);

      let shouldUpdate = false;
      let reasonText = "";

      if (entryOrder) {
        const oldEntryPx = parseFloat(entryOrder.limitPx);
        const priceDiffPct = Math.abs(oldEntryPx - levels.entry) / levels.entry;

        if (priceDiffPct >= entryShiftThreshold) {
          shouldUpdate = true;
          reasonText = `Entry price shifted by ${(priceDiffPct * 100).toFixed(2)}% (from ${oldEntryPx} to ${levels.entry}), exceeding threshold of ${(entryShiftThreshold * 100).toFixed(2)}%`;
        }
      } else {
        shouldUpdate = true;
        reasonText = `Orphaned TP/SL orders found without a limit entry order`;
      }

      if (shouldUpdate) {
        console.log(`[Entry Trailing] Updating entry levels for ${coinSymbol}. Reason: ${reasonText}`);
        try {
          // Cancel all existing open orders for this coin
          const cancelsToMake = coinOrders.map(o => ({ a: currentCoin.assetIndex, o: o.oid }));
          const cancelRes = await exchange.cancel({ cancels: cancelsToMake });
          console.log(`[Entry Trailing] Cancelled old orders for ${coinSymbol}:`, JSON.stringify(cancelRes));

          // Calculate size
          const accountSizeEnv = process.env.HYPERLIQUID_ACCOUNT_SIZE;
          let withdrawableUsd = parseFloat(userState.withdrawable || "0");
          if (withdrawableUsd === 0 && spotState && spotState.balances) {
            const usdcBal = spotState.balances.find(b => b.coin === "USDC");
            if (usdcBal) {
              withdrawableUsd = parseFloat(usdcBal.total || "0") - parseFloat(usdcBal.hold || "0");
            }
          }
          const accountSize = accountSizeEnv ? parseFloat(accountSizeEnv) : withdrawableUsd;
          if (accountSize <= 5) {
            console.error(`[Entry Trailing] Insufficient balance for ${coinSymbol}. Account size: $${accountSize}`);
            continue;
          }

          const finalLeverage = 5;
          let positionSizeUsd = (accountSize * 0.90) * finalLeverage;
          if (positionSizeUsd < 10.5) {
            positionSizeUsd = 10.5;
          }
          const positionSizeTokens = positionSizeUsd / levels.entry;

          const isBuy = direction === "LONG";
          const entrySz = formatSize(positionSizeTokens, currentCoin.assetInfo.szDecimals);
          const entryPxStr = formatPrice(levels.entry);
          const tpPxStr = formatPrice(levels.tp);
          const tpWorstPxStr = formatPrice(getTriggerLimitPrice(!isBuy, levels.tp));
          const slPxStr = formatPrice(levels.sl);
          const slWorstPxStr = formatPrice(getTriggerLimitPrice(!isBuy, levels.sl));

          // Place leverage
          await exchange.updateLeverage({
            asset: currentCoin.assetIndex,
            isCross: true,
            leverage: finalLeverage
          });

          // Place order
          const orderRes = await exchange.order({
            orders: [
              {
                a: currentCoin.assetIndex,
                b: isBuy,
                p: entryPxStr,
                s: entrySz,
                r: false,
                t: { limit: { tif: "Gtc" } }
              },
              {
                a: currentCoin.assetIndex,
                b: !isBuy,
                p: tpWorstPxStr,
                s: entrySz,
                r: true,
                t: {
                  trigger: {
                    triggerPx: tpPxStr,
                    isMarket: true,
                    tpsl: "tp"
                  }
                }
              },
              {
                a: currentCoin.assetIndex,
                b: !isBuy,
                p: slWorstPxStr,
                s: entrySz,
                r: true,
                t: {
                  trigger: {
                    triggerPx: slPxStr,
                    isMarket: true,
                    tpsl: "sl"
                  }
                }
              }
            ],
            grouping: "normalTpsl"
          });
          console.log(`[Entry Trailing] Placed new trailed bracket order for ${coinSymbol}:`, JSON.stringify(orderRes));
          needsOrdersRefreshAfterTrailing = true;
        } catch (e) {
          console.error(`[Entry Trailing] Failed to update levels for ${coinSymbol}:`, e.message);
        }
      } else {
        console.log(`[Entry Trailing] No update needed for ${coinSymbol}. Calculated entry: ${levels.entry}, existing order price: ${entryOrder ? entryOrder.limitPx : 'None'}. Price shift: ${entryOrder ? (Math.abs(parseFloat(entryOrder.limitPx) - levels.entry) / levels.entry * 100).toFixed(4) + '%' : 'N/A'}`);
      }
    }

    if (needsOrdersRefreshAfterTrailing) {
      try {
        openOrders = await info.frontendOpenOrders({ user: walletAddress });
      } catch (e) {
        console.error("Failed to refresh openOrders after entry trailing:", e.message);
      }
    }

    // Pick top candidates (score >= minScore)
    const candidates = scoredCoins.filter(c => c.score >= minScore);
    if (candidates.length === 0) {
      return res.status(200).json({ status: "success", message: `No candidates with score >= ${minScore} found at this time.` });
    }

    // Filter candidates that are not currently in active positions/orders
    const tradeableCandidates = [];
    for (const cand of candidates) {
      const hasOpenOrder = openOrders.some(order => order.coin === cand.symbol);
      const hasPosition = userState.assetPositions.some(p => p.position.coin === cand.symbol && parseFloat(p.position.s) !== 0);

      if (!hasOpenOrder && !hasPosition) {
        tradeableCandidates.push(cand);
      }
    }

    if (tradeableCandidates.length === 0) {
      return res.status(200).json({ status: "success", message: "Candidates found but all already have open positions or orders." });
    }

    // Process the top candidate
    const target = tradeableCandidates[0];
    const geckoId = geckoIdMap[target.symbol];

    let taData = null;
    let derivData = null;
    let optionsData = null;

    if (geckoId) {
      try {
        const results = await Promise.allSettled([
          callTrueNorthMcp('technical_analysis', { token_address: geckoId, timeframe: '1h' }),
          callTrueNorthMcp('derivatives_analysis', { token_address: geckoId }),
          callTrueNorthMcp('options_report', { token_address: geckoId })
        ]);
        
        if (results[0].status === 'fulfilled') taData = results[0].value;
        if (results[1].status === 'fulfilled') derivData = results[1].value;
        if (results[2].status === 'fulfilled') optionsData = results[2].value;
      } catch (e) {
        console.error("TrueNorth MCP query failed:", e.message);
      }
    }

    const useSmartSlTp = process.env.USE_SMART_SL_TP !== 'false' && req.query.smart_sl_tp !== 'false';
    console.log(`[Bot Execution] Smart TP/SL Enabled: ${useSmartSlTp}`);

    const direction = detectAutoDirection(target, taData);
    const levels = computeStrategyLevels(target, direction, taData, derivData, optionsData, useSmartSlTp);

    // 6. Risk and Position Size Calculations
    const accountSizeEnv = process.env.HYPERLIQUID_ACCOUNT_SIZE;
    let withdrawableUsd = parseFloat(userState.withdrawable || "0");

    // Support Unified Accounts: fallback to spot USDC balance if perp balance is 0
    if (withdrawableUsd === 0 && spotState && spotState.balances) {
      const usdcBal = spotState.balances.find(b => b.coin === "USDC");
      if (usdcBal) {
        withdrawableUsd = parseFloat(usdcBal.total || "0") - parseFloat(usdcBal.hold || "0");
      }
    }
    const accountSize = accountSizeEnv ? parseFloat(accountSizeEnv) : withdrawableUsd;

    if (accountSize <= 5) {
      console.warn(`[Bot Execution] No trade: Insufficient balance. Account size: $${accountSize}`);
      return res.status(200).json({ status: "success", message: `No trade executed: Insufficient balance. Account size: $${accountSize}` });
    }

    const slDistancePct = Math.abs(levels.entry - levels.sl) / levels.entry;
    if (slDistancePct === 0) {
      console.warn(`[Bot Execution] No trade: Calculated Stop Loss distance is zero. Entry: ${levels.entry}, SL: ${levels.sl}`);
      return res.status(200).json({ status: "success", message: "No trade executed: Calculated Stop Loss distance is zero." });
    }

    // Option A: Use 90% of account balance with 5x leverage to leave buffer for fees and slippage
    const finalLeverage = 5;
    let positionSizeUsd = (accountSize * 0.90) * finalLeverage;
    
    // Hyperliquid requires a minimum notional order size of $10.0.
    // We round up to $10.5 if the calculated size is smaller, to ensure the order is accepted.
    if (positionSizeUsd < 10.5) {
      positionSizeUsd = 10.5;
    }

    const positionSizeTokens = positionSizeUsd / levels.entry;

    // 7. Execute Leverage and Order
    // A. Update Leverage
    await exchange.updateLeverage({
      asset: target.assetIndex,
      isCross: true,
      leverage: finalLeverage
    });

    // B. Place Bracket Order
    const isBuy = direction === "LONG";
    const entrySz = formatSize(positionSizeTokens, target.assetInfo.szDecimals);
    const entryPx = formatPrice(levels.entry);

    const tpPx = formatPrice(levels.tp);
    const tpWorstPx = formatPrice(getTriggerLimitPrice(!isBuy, levels.tp));

    const slPx = formatPrice(levels.sl);
    const slWorstPx = formatPrice(getTriggerLimitPrice(!isBuy, levels.sl));

    const orderResult = await exchange.order({
      orders: [
        // Limit Entry
        {
          a: target.assetIndex,
          b: isBuy,
          p: entryPx,
          s: entrySz,
          r: false,
          t: { limit: { tif: "Gtc" } }
        },
        // Take Profit Trigger Order (Market Trigger to guarantee fill)
        {
          a: target.assetIndex,
          b: !isBuy,
          p: tpWorstPx,
          s: entrySz,
          r: true,
          t: {
            trigger: {
              triggerPx: tpPx,
              isMarket: true,
              tpsl: "tp"
            }
          }
        },
        // Stop Loss Trigger Order (Market Trigger to guarantee invalidation)
        {
          a: target.assetIndex,
          b: !isBuy,
          p: slWorstPx,
          s: entrySz,
          r: true,
          t: {
            trigger: {
              triggerPx: slPx,
              isMarket: true,
              tpsl: "sl"
            }
          }
        }
      ],
      grouping: "normalTpsl"
    });

    return res.status(200).json({
      status: "success",
      executedTrade: {
        symbol: target.symbol,
        score: target.score,
        direction,
        leverage: finalLeverage,
        positionSizeUsd: positionSizeUsd.toFixed(2),
        entryPrice: entryPx,
        stopLoss: slPx,
        takeProfit: tpPx,
        orderResult
      }
    });

  } catch (error) {
    console.error("Bot execution error:", error);
    return res.status(500).json({ error: error.message });
  }
}
// Trigger Vercel rebuild
