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
  "WLD": "worldcoin-org"
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
function computeStrategyLevels(coin, dir, taData) {
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
        tp = vwap > entry ? vwap : entry + (entry - sl) * 2;
      }
    } else {
      entry = high - (high - low) * 0.618;
      sl    = low * 0.985;
      tp    = vwap > entry ? vwap : entry + (entry - sl) * 2;
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
        tp = vwap < entry ? vwap : entry - (sl - entry) * 2;
      }
    } else {
      entry = high - (high - low) * 0.382;
      sl    = high * 1.015;
      tp    = vwap < entry ? vwap : entry - (sl - entry) * 2;
      reason = 'fib_fallback';
    }

    if (funding > 0.001) {
      entry = price;
      reason += '+overextended_long';
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
function calculateScore(coin) {
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
  if (coin.volume > 100000000) score += 20;
  else if (coin.volume > 50000000) score += 15;
  else if (coin.volume > 10000000) score += 10;

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
  return parseFloat(sz).toFixed(decimals);
}

function getTriggerLimitPrice(isBuyTrigger, triggerPx) {
  return isBuyTrigger ? triggerPx * 1.10 : triggerPx * 0.90;
}

export default async function handler(req, res) {
  // 1. Cron Auth Check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
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

    // 4. Fetch Scanner Data directly from Hyperliquid (to avoid Binance IP block on cloud servers)
    const [metaAndCtxs, userState, openOrders, spotState] = await Promise.all([
      info.metaAndAssetCtxs(),
      info.clearinghouseState({ user: walletAddress }),
      info.openOrders({ user: walletAddress }),
      info.spotClearinghouseState({ user: walletAddress }).catch(() => null)
    ]);
    const [hlMeta, hlAssetCtxs] = metaAndCtxs;

    // Map universe and contexts to standard structure and calculate scores
    const scoredCoins = hlMeta.universe.map((asset, index) => {
      const ctx = hlAssetCtxs[index];
      if (!ctx) return null;

      const price = parseFloat(ctx.markPx || ctx.midPx || "0");
      const prevPrice = parseFloat(ctx.prevDayPx || "0") || price;
      const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
      const volume = parseFloat(ctx.dayNtlVlm || "0");
      const funding = parseFloat(ctx.funding || "0") * 8; // Convert hourly funding to 8h equivalent for scoring alignment

      const coinData = {
        symbol: asset.name,
        price: price,
        change: change,
        volume: volume,
        funding: funding,
        high: price * 1.03, // estimate high
        low: price * 0.97,  // estimate low
      };

      return {
        ...coinData,
        score: calculateScore(coinData),
        assetIndex: index,
        assetInfo: asset
      };
    }).filter(Boolean);

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

    // Pick top candidates (score >= 90)
    const candidates = scoredCoins.filter(c => c.score >= 90);
    if (candidates.length === 0) {
      return res.status(200).json({ status: "success", message: "No candidates with score >= 90 found at this time." });
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
    if (geckoId) {
      try {
        const mcpRes = await callTrueNorthMcp('technical_analysis', { token_address: geckoId, timeframe: '1h' });
        if (mcpRes) taData = mcpRes;
      } catch (e) {
        console.error("TrueNorth MCP query failed, falling back to Fib levels:", e.message);
      }
    }

    const direction = detectAutoDirection(target, taData);
    const levels = computeStrategyLevels(target, direction, taData);

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
      return res.status(400).json({ error: `Insufficient balance for trading. Account size: $${accountSize}` });
    }

    const riskPct = process.env.HYPERLIQUID_RISK_PCT ? parseFloat(process.env.HYPERLIQUID_RISK_PCT) : 1.0; // default 1%
    const riskAmount = accountSize * (riskPct / 100);

    const slDistancePct = Math.abs(levels.entry - levels.sl) / levels.entry;
    if (slDistancePct === 0) {
      return res.status(400).json({ error: "Calculated Stop Loss distance is zero." });
    }

    let positionSizeUsd = riskAmount / slDistancePct;
    
    // Hyperliquid requires a minimum notional order size of $10.0.
    // We round up to $10.0 if the calculated size is smaller, to ensure the order is accepted.
    if (positionSizeUsd < 10.0) {
      positionSizeUsd = 10.0;
    }

    const positionSizeTokens = positionSizeUsd / levels.entry;

    // Determine leverage
    const leverageNeeded = Math.ceil(positionSizeUsd / accountSize);
    const finalLeverage = Math.max(3, Math.min(leverageNeeded, 10)); // Safe range 3x to 10x

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
