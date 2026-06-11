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

    // 4. Fetch Scanner Data
    const resTicker = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
    const tickers = await resTicker.json();

    const resFunding = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex");
    const premiumData = await resFunding.json();

    const fundingMap = {};
    premiumData.forEach(item => {
      fundingMap[item.symbol] = {
        fundingRate: parseFloat(item.lastFundingRate) || 0,
        markPrice: parseFloat(item.markPrice) || 0
      };
    });

    const usdtPerps = tickers.filter(t => t.symbol.endsWith("USDT"));
    usdtPerps.sort((a, b) => (parseFloat(b.quoteVolume) || 0) - (parseFloat(a.quoteVolume) || 0));

    const top100Coins = usdtPerps.slice(0, 100).map((coin, index) => {
      const symbolBase = coin.symbol.replace("USDT", "");
      const fundingInfo = fundingMap[coin.symbol] || { fundingRate: 0.0001, markPrice: parseFloat(coin.lastPrice) };
      const change = parseFloat(coin.priceChangePercent) || 0;
      const fundingRate = fundingInfo.fundingRate;

      return {
        rank: index + 1,
        symbol: symbolBase,
        price: fundingInfo.markPrice || parseFloat(coin.lastPrice),
        change: change,
        volume: parseFloat(coin.quoteVolume) || 0,
        funding: fundingRate,
        high: parseFloat(coin.highPrice),
        low: parseFloat(coin.lowPrice)
      };
    });

    // Score and Sort
    const scoredCoins = top100Coins.map(coin => ({
      ...coin,
      score: calculateScore(coin)
    })).sort((a, b) => b.score - a.score);

    // Pick top candidates (score >= 90)
    const candidates = scoredCoins.filter(c => c.score >= 90);
    if (candidates.length === 0) {
      return res.status(200).json({ status: "success", message: "No candidates with score >= 90 found at this time." });
    }

    // 5. Fetch Hyperliquid Universe Meta
    const meta = await info.meta();
    const userState = await info.clearinghouseState({ user: walletAddress });
    const openOrders = await info.openOrders({ user: walletAddress });

    // Filter candidates that are tradeable and not currently in active positions/orders
    const tradeableCandidates = [];
    for (const cand of candidates) {
      const assetIndex = meta.universe.findIndex(a => a.name === cand.symbol);
      if (assetIndex === -1) continue; // Skip if not tradeable perp on HL

      // Check existing open orders or active position
      const hasOpenOrder = openOrders.some(order => order.coin === cand.symbol);
      const hasPosition = userState.assetPositions.some(p => p.position.coin === cand.symbol && parseFloat(p.position.s) !== 0);

      if (!hasOpenOrder && !hasPosition) {
        tradeableCandidates.push({ ...cand, assetIndex, assetInfo: meta.universe[assetIndex] });
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
    const withdrawableUsd = parseFloat(userState.withdrawable || "0");
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

    const positionSizeUsd = riskAmount / slDistancePct;
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
