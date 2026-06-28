import { ExchangeClient, InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import crypto from "crypto";
import fs from "fs";
import path from "path";

let config = {
  minScore: 85,
  minSlBuffer: 0.008,
  minTpBuffer: 0.010,
  entryShiftThreshold: 0.0075,
  replacementScoreDiff: 10,
  nansenBuilderAddress: "",
  nansenBuilderFeeRate: 80,
  blacklist: [],
  enableSupportRebound: true,
  minSupportDropPct: 0.015,
  supportMinStrength: 50,
  enableResistanceRebound: true,
  minResistanceRisePct: 0.015,
  resistanceMinStrength: 50,
  entryBufferPct: 0.005,
  maxReboundDistancePct: 0.025,
  maxTpPct: 0.10
};

try {
  const configPath = path.join(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    config = { ...config, ...JSON.parse(rawConfig) };
    console.log("Loaded config.json at startup:", config);
  }
} catch (e) {
  console.warn("Failed to load config.json at startup, using defaults:", e.message);
}

function generateBotCloid() {
  return "0x626f745f" + crypto.randomBytes(12).toString("hex");
}

// Symbol to CoinGecko ID map for TrueNorth MCP Server queries
const geckoIdMap = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "SOL": "solana",
  "HYPE": "hyperliquid",
  "LINK": "chainlink",
  "XRP": "ripple",
  "INJ": "injective-protocol",
  "WLD": "worldcoin-wld",
  "ZEC": "zcash",
  "XLM": "stellar",
  "TRX": "tron",
  "SUI": "sui",
  "TIA": "celestia",
  "FTM": "fantom",
  "AVAX": "avalanche-2",
  "NEAR": "near",
  "OP": "optimism",
  "ARB": "arbitrum",
  "DOGE": "dogecoin",
  "LTC": "litecoin",
  "PEPE": "pepe",
  "WIF": "dogwifhat",
  "BONK": "bonk",
  "ENA": "ethena",
  "ONDO": "ondo-finance",
  "JUP": "jupiter-exchange-solana",
  "POPCAT": "popcat-solana",
  "NVDA": "nvidia",
  "MU": "micron-technology",
  "LLY": "eli-lilly-and-co",
  "0G": "0g-chain"
};

const nansenContractMap = {
  "BTC": { chain: "ethereum", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" },
  "ETH": { chain: "ethereum", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
  "SOL": { chain: "solana", address: "So11111111111111111111111111111111111111112" },
  "WLD": { chain: "ethereum", address: "0x163f8c2467924be0ae7b5347228cabf260318753" },
  "LINK": { chain: "ethereum", address: "0x514910771af9ca656af840dff83e8264ecf986ca" },
  "XRP": { chain: "ethereum", address: "0x1d2f0da169ce246c8562d41288c7c9803a6bc41c" },
  "INJ": { chain: "ethereum", address: "0xe28b3b32b6c3ef5a950105ad7457a79794706e55" },
  "WIF": { chain: "solana", address: "EKpQGSJtjMFqKZ9KQGWjh69zXGV3whwd2CHMwb5j74yi" },
  "BONK": { chain: "solana", address: "DezXAZ8z7PnrnRJjz3wJaRix35C1ONNFwExao6GP8G1m" },
  "POPCAT": { chain: "solana", address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr" },
  "JUP": { chain: "solana", address: "JUPyiwrEEZJ9ToEPJVhuGAMFB6hTE14t4a4y8y7kGDE" },
  "PYTH": { chain: "solana", address: "HZ128229z6D7TM8mIGZbmxSyd1ADy6fgGUuknKBMST4F" },
  "RENDER": { chain: "solana", address: "rndrizKT3MK1iimdxZ6ecSgiEsP34G1mDeYbh35xB2d" },
  "ENA": { chain: "ethereum", address: "0x57e114b691db790c352f8b262a3479b128522643" },
  "PENDLE": { chain: "ethereum", address: "0x808507081b8f63fd5117a957205440027609934e" },
  "LDO": { chain: "ethereum", address: "0x5a98fc80d23026f40767289d4d819673c69212bc" },
  "UNI": { chain: "ethereum", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" },
  "AAVE": { chain: "ethereum", address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9" }
};

async function callNansenMcp(toolName, args) {
  const token = process.env.NANSEN_API_KEY;
  if (!token) {
    throw new Error("NANSEN_API_KEY environment variable is not set");
  }
  const url = `https://mcp.nansen.ai/ra/mcp`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'NANSEN-API-KEY': token
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
    throw new Error(`Nansen MCP Server error: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.substring(6).trim();
      return JSON.parse(dataStr);
    }
  }
  throw new Error("Invalid Nansen SSE response format");
}

async function getNansenTokenAddress(symbol) {
  if (nansenContractMap[symbol]) {
    return nansenContractMap[symbol];
  }
  try {
    const searchRes = await callNansenMcp('general_search', { query: symbol, max_results: 5 });
    const content = searchRes?.result?.content?.[0]?.text || searchRes?.result?.structuredContent?.result || "";
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes('|') && !line.includes('Contract Address') && !line.includes('---')) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 6) {
          const sym = parts[2];
          const address = parts[3];
          const chain = parts[4];
          if (sym.toLowerCase() === symbol.toLowerCase() && address && address.toLowerCase() !== symbol.toLowerCase()) {
            return { chain, address };
          }
        }
      }
    }
  } catch (e) {
    console.error(`Failed to resolve Nansen address for ${symbol}:`, e.message);
  }
  return null;
}

async function getSmartMoneyBonus(chain, tokenAddress) {
  let bonus = 0;
  let details = "";
  let nansenSmartMoney = 0;
  let nansenWhale = 0;
  let nansenExchange = 0;
  
  try {
    const res = await callNansenMcp('token_recent_flows_summary', {
      request: { chain, tokenAddress }
    });
    const text = res?.result?.content?.[0]?.text || res?.result?.structuredContent?.result || "";
    if (text) {
      details = text;
      // Parse Smart Trader flow
      const smartTraderMatch = text.match(/Smart Trader wallets:\s*Net inflow of\s*\$([\d\.]+[kMB]?)/i);
      const smartTraderOutflow = text.match(/Smart Trader wallets:\s*Net outflow of\s*\$([\d\.]+[kMB]?)/i);
      
      // Parse Exchange flow
      const exchangeOutflow = text.match(/Exchange wallets:\s*Net outflow of\s*\$([\d\.]+[kMB]?)/i);
      const exchangeInflow = text.match(/Exchange wallets:\s*Net inflow of\s*\$([\d\.]+[kMB]?)/i);
      
      // Parse Whale flow
      const whaleInflow = text.match(/Whale wallets:\s*Net inflow of\s*\$([\d\.]+[kMB]?)/i);
      const whaleOutflow = text.match(/Whale wallets:\s*Net outflow of\s*\$([\d\.]+[kMB]?)/i);

      if (smartTraderMatch) {
        bonus += 15;
        nansenSmartMoney = 1;
      } else if (smartTraderOutflow) {
        bonus -= 10;
        nansenSmartMoney = 2;
      }
      
      if (whaleInflow) {
        bonus += 10;
        nansenWhale = 1;
      } else if (whaleOutflow) {
        nansenWhale = 2;
      }
      
      if (exchangeOutflow) {
        bonus += 10;
        nansenExchange = 2;
      } else if (exchangeInflow) {
        bonus -= 10;
        nansenExchange = 1;
      }
    }
  } catch (e) {
    console.error(`Failed to get Nansen flows for ${tokenAddress}:`, e.message);
  }
  return { bonus, details, nansenSmartMoney, nansenWhale, nansenExchange };
}

function generateEncodedCloid(details) {
  const prefix = Buffer.from("bot_");
  const data = Buffer.alloc(12);
  data.writeUInt8(details.score || 0, 0);
  data.writeUInt8(details.nansenSmartMoney || 0, 1);
  data.writeUInt8(details.nansenWhale || 0, 2);
  data.writeUInt8(details.nansenExchange || 0, 3);
  data.writeUInt8(details.tnVwap || 0, 4);
  data.writeUInt8(details.direction === "LONG" ? 1 : 2, 5);
  crypto.randomBytes(6).copy(data, 6);
  return "0x" + Buffer.concat([prefix, data]).toString("hex");
}


// Generic JSON-RPC tool caller helper for TrueNorth
async function callTrueNorthMcp(toolName, args) {
  const token = process.env.TN_FINANCIAL_DATA_API_KEY;
  if (!token) {
    throw new Error("TN_FINANCIAL_DATA_API_KEY environment variable is not set");
  }
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
function detectAutoDirection(coin, taData = null, sma24 = null) {
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

  let dir = 'LONG';
  if (score > 0) dir = 'LONG';
  else if (score < 0) dir = 'SHORT';
  else dir = change24h >= 0 ? 'LONG' : 'SHORT';

  // Apply Trend Filter: Only align with the 24h SMA trend and respect distance cap
  if (sma24 !== null) {
    const price = coin.price;
    const maxDistancePct = process.env.SMA_MAX_DISTANCE_PCT 
      ? parseFloat(process.env.SMA_MAX_DISTANCE_PCT) 
      : 0.015; // 1.5% max pullback

    if (dir === 'LONG') {
      if (price < sma24) {
        return 'SKIP'; // Filter out counter-trend longs
      }
      if (price > sma24 * (1 + maxDistancePct)) {
        console.log(`[SMA Distance Filter] Skip LONG candidate ${coin.symbol}: Price (${price}) is more than ${(maxDistancePct * 100).toFixed(1)}% above 24h SMA (${sma24.toFixed(4)})`);
        return 'SKIP'; // Filter out overextended longs
      }

      // Check if TrueNorth cumulative VWAP is bearish
      if (taData?.support_resistance?.vwap?.cumulative) {
        const vwapData = taData.support_resistance.vwap.cumulative;
        if (vwapData.state === 'price_below' || vwapData.slope === 'down') {
          console.log(`[VWAP Trend Filter] Skip LONG candidate ${coin.symbol}: TrueNorth 1h VWAP is Bearish (Price below VWAP or slope down)`);
          return 'SKIP';
        }
      }
    }
    if (dir === 'SHORT') {
      if (price > sma24) {
        return 'SKIP'; // Filter out counter-trend shorts
      }
      if (price < sma24 * (1 - maxDistancePct)) {
        console.log(`[SMA Distance Filter] Skip SHORT candidate ${coin.symbol}: Price (${price}) is more than ${(maxDistancePct * 100).toFixed(1)}% below 24h SMA (${sma24.toFixed(4)})`);
        return 'SKIP'; // Filter out overextended shorts
      }

      // Check if TrueNorth cumulative VWAP is bullish
      if (taData?.support_resistance?.vwap?.cumulative) {
        const vwapData = taData.support_resistance.vwap.cumulative;
        if (vwapData.state === 'price_above' || vwapData.slope === 'up') {
          console.log(`[VWAP Trend Filter] Skip SHORT candidate ${coin.symbol}: TrueNorth 1h VWAP is Bullish (Price above VWAP or slope up)`);
          return 'SKIP';
        }
      }
    }
  }

  return dir;
}

// Level computation
function computeStrategyLevels(coin, dir, taData, derivData, optionsData, useSmartSlTp = true, entryOverride = null, maxTpPctOverride = null) {
  const price   = coin.price;
  const funding = coin.funding || 0;
  const dec     = price < 1 ? 6 : (price < 10 ? 4 : 2);

  let high = coin.high || price * 1.03;
  let low  = coin.low  || price * 0.97;
  let vwap = (high + low + price) / 3;
  let channels = [];

  let entry = entryOverride !== null ? entryOverride : price;
  let reason = entryOverride !== null ? 'recovery_entry' : 'fallback';

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

  // Calculate Entry Price: Check for Support/Resistance Rebound first, else fall back to VWAP
  let strongSupport = null;
  let strongResistance = null;
  const buffer = config.entryBufferPct !== undefined ? config.entryBufferPct : 0.005;

  if (entryOverride === null) {
    if (dir === 'LONG' && config.enableSupportRebound !== false && channels.length > 0) {
      const minStrength = config.supportMinStrength !== undefined ? config.supportMinStrength : 50;
      const validSupports = channels.filter(c => c.hi <= price && c.lo < price && c.strength >= minStrength);
      if (validSupports.length > 0) {
        // Sort by proximity to current price (highest 'hi' level first)
        validSupports.sort((a, b) => b.hi - a.hi);
        const candSupport = validSupports[0];
        const candEntry = Math.min(candSupport.hi * (1 + buffer), price);
        const maxDist = config.maxReboundDistancePct !== undefined ? config.maxReboundDistancePct : 0.025;
        const dist = (price - candEntry) / price;
        
        if (dist <= maxDist) {
          strongSupport = candSupport;
          entry = candEntry;
          reason = 'support_rebound_limit';
        } else {
          console.log(`[Support Rebound] Distance too far: Entry ${candEntry.toFixed(dec)} is too far from price ${price} (Distance: ${(dist * 100).toFixed(2)}% > ${(maxDist * 100).toFixed(1)}%). Falling back to standard entry.`);
        }
      }
    } else if (dir === 'SHORT' && config.enableResistanceRebound !== false && channels.length > 0) {
      const minStrength = config.resistanceMinStrength !== undefined ? config.resistanceMinStrength : 50;
      const validResistances = channels.filter(c => c.lo >= price && c.hi > price && c.strength >= minStrength);
      if (validResistances.length > 0) {
        // Sort by proximity to current price (lowest 'lo' level first)
        validResistances.sort((a, b) => a.lo - b.lo);
        const candResistance = validResistances[0];
        const candEntry = Math.max(candResistance.lo * (1 - buffer), price);
        const maxDist = config.maxReboundDistancePct !== undefined ? config.maxReboundDistancePct : 0.025;
        const dist = (candEntry - price) / price;

        if (dist <= maxDist) {
          strongResistance = candResistance;
          entry = candEntry;
          reason = 'resistance_rebound_limit';
        } else {
          console.log(`[Resistance Rebound] Distance too far: Entry ${candEntry.toFixed(dec)} is too far from price ${price} (Distance: ${(dist * 100).toFixed(2)}% > ${(maxDist * 100).toFixed(1)}%). Falling back to standard entry.`);
        }
      }
    }

    if (reason !== 'support_rebound_limit' && reason !== 'resistance_rebound_limit') {
      // Calculate VWAP-based Limit Entry Price using TrueNorth data
      if (taData?.support_resistance?.vwap?.cumulative?.value) {
        const tnVwap = taData.support_resistance.vwap.cumulative.value;
        const maxPullbackPct = process.env.SMA_MAX_DISTANCE_PCT 
          ? parseFloat(process.env.SMA_MAX_DISTANCE_PCT) 
          : 0.015; // 1.5% max pullback bounds to guarantee fill probability
          
        if (dir === 'LONG') {
          if (price > tnVwap) {
            // If current price is above VWAP, buy at VWAP (bounded by max 1.5% pullback)
            entry = Math.max(tnVwap, price * (1 - maxPullbackPct));
            reason = 'tn_vwap_limit';
          } else {
            // If current price is already below VWAP, buy at current market price (cheaper)
            entry = price;
            reason = 'tn_vwap_below_market';
          }
        } else { // SHORT
          if (price < tnVwap) {
            // If current price is below VWAP, sell at VWAP (bounded by max 1.5% pullback)
            entry = Math.min(tnVwap, price * (1 + maxPullbackPct));
            reason = 'tn_vwap_limit';
          } else {
            // If current price is already above VWAP, sell at current market price (more expensive)
            entry = price;
            reason = 'tn_vwap_above_market';
          }
        }
      } else {
        // Fallback limit entry at 0.5% pullback from current price if VWAP is missing
        entry = dir === 'LONG' ? price * 0.995 : price * 1.005;
        reason = 'fallback_pullback_limit';
      }
    }
  }

  // Initial TP/SL are relative to calculated Limit Entry price
  let sl    = dir === 'LONG' ? entry * 0.97 : entry * 1.03;
  let tp    = dir === 'LONG' ? entry * 1.03 : entry * 0.97;

  // 1. Calculate standard levels first
  if (dir === 'LONG') {
    if (strongSupport) {
      sl = strongSupport.lo * 0.985;
      reason = 'support_rebound_limit+sr_channel';

      const resistances = channels.filter(c => c.lo >= price).sort((a, b) => a.lo - b.lo);
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
    }
  } else {
    if (strongResistance) {
      sl = strongResistance.hi * 1.015;
      reason = 'resistance_rebound_limit+sr_channel';

      const supports = channels.filter(c => c.hi <= price).sort((a, b) => b.hi - a.hi);
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

    // Enforce 1.5x R:R on the adjusted TP and cap excessive TP (R:R > 3.0 or > 4% gain)
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

    // Enforce 1.5x R:R and cap excessive TP (R:R > 3.0 or > 4% gain)
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

  // 4. Final Safety Enforcements (Guards against invalid/narrow TP and SL)
  if (dir === 'LONG') {
    // Stop Loss must be at least config.minSlBuffer below entry (e.g. 1%)
    const maxSlAllowed = entry * (1 - config.minSlBuffer);
    if (sl > maxSlAllowed) {
      sl = maxSlAllowed;
    }
    // Stop Loss is capped at a maximum of -2% (-10% ROE at 5x)
    const minSlAllowed = entry * 0.98;
    if (sl < minSlAllowed) {
      sl = minSlAllowed;
    }
    // Enforce Take Profit is at least config.minTpBuffer above entry
    const minTpAllowed = entry * (1 + config.minTpBuffer);
    if (tp < minTpAllowed) {
      tp = minTpAllowed;
    }
    // Cap TP at a maximum of +config.maxTpPct to prevent unrealistic options targets
    const maxTpPct = maxTpPctOverride !== null ? maxTpPctOverride : (config.maxTpPct !== undefined ? config.maxTpPct : 0.10);
    const maxTpAllowed = entry * (1 + maxTpPct);
    if (tp > maxTpAllowed) {
      tp = maxTpAllowed;
    }
  } else {
    // Stop Loss must be at least config.minSlBuffer above entry (e.g. 1%)
    const minSlAllowed = entry * (1 + config.minSlBuffer);
    if (sl < minSlAllowed) {
      sl = minSlAllowed;
    }
    // Stop Loss is capped at a maximum of +2% (-10% ROE at 5x)
    const maxSlAllowed = entry * 1.02;
    if (sl > maxSlAllowed) {
      sl = maxSlAllowed;
    }
    // Enforce Take Profit is at least config.minTpBuffer below entry
    const maxTpAllowed = entry * (1 - config.minTpBuffer);
    if (tp > maxTpAllowed) {
      tp = maxTpAllowed;
    }
    // Cap TP at a maximum of -config.maxTpPct to prevent unrealistic options targets
    const maxTpPct = maxTpPctOverride !== null ? maxTpPctOverride : (config.maxTpPct !== undefined ? config.maxTpPct : 0.10);
    const minTpAllowed = entry * (1 - maxTpPct);
    if (tp < minTpAllowed) {
      tp = minTpAllowed;
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
  
  // Symmetric funding rate scoring for both LONG and SHORT setup strength
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
  const thresholds = isHyperliquidScale 
    ? (config.hyperliquidVolumeThresholds || [30000000, 15000000, 5000000])
    : (config.binanceVolumeThresholds || [100000000, 50000000, 10000000]);

  if (vol > thresholds[0]) score += 20;
  else if (vol > thresholds[1]) score += 15;
  else if (vol > thresholds[2]) score += 10;

  const watchlist = config.watchlist || ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];
  const watchlistBonus = config.watchlistBonus !== undefined ? config.watchlistBonus : 15;
  if (watchlist.includes(coin.symbol)) {
    score += watchlistBonus;
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

function attachBuilderFee(orders) {
  if (config.nansenBuilderAddress && config.nansenBuilderAddress !== "") {
    const builderFeeObj = {
      b: config.nansenBuilderAddress,
      f: config.nansenBuilderFeeRate || 80
    };
    orders.forEach(o => {
      o.builder = builderFeeObj;
    });
    console.log(`[Builder Fee] Attached builder address ${config.nansenBuilderAddress} with fee ${builderFeeObj.f} to ${orders.length} orders.`);
  }
  return orders;
}

async function safeCancelOrders(exchange, cancels) {
  if (!cancels || cancels.length === 0) return;
  try {
    const res = await exchange.cancel({ cancels });
    return res;
  } catch (e) {
    console.warn(`[Safe Cancel] Cancel request returned an error (might be already cancelled/filled):`, e.message);
    if (e.message.includes("already canceled") || e.message.includes("never placed") || e.message.includes("filled")) {
      return null;
    }
    throw e;
  }
}

export default async function handler(req, res) {
  const isDryRun = process.env.DRY_RUN === "true" || req.query.dry_run === "true" || config.dryRun === true || config.dryRun === "true";
  const useSmartSlTp = process.env.USE_SMART_SL_TP !== 'false' && req.query.smart_sl_tp !== 'false';

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
    const [metaAndCtxs, initialUserState, initialOpenOrders, initialSpotState, userFills] = await Promise.all([
      info.metaAndAssetCtxs(),
      info.clearinghouseState({ user: walletAddress }),
      info.frontendOpenOrders({ user: walletAddress }),
      info.spotClearinghouseState({ user: walletAddress }).catch(() => null),
      info.userFills({ user: walletAddress }).catch(() => [])
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

    const minScore = req.query.min_score ? parseInt(req.query.min_score) : (process.env.HYPERLIQUID_MIN_SCORE ? parseInt(process.env.HYPERLIQUID_MIN_SCORE) : config.minScore);
    const replacementScoreDiff = process.env.HYPERLIQUID_REPLACEMENT_SCORE_DIFF 
      ? parseInt(process.env.HYPERLIQUID_REPLACEMENT_SCORE_DIFF) 
      : config.replacementScoreDiff;

    // 5. Cancel stale unfilled limit entry orders (and their associated TP/SL) if their score is no longer >= minScore
    const cancels = [];
    const coinsWithPendingOrders = new Set();
    for (const order of openOrders) {
      const hasPosition = userState.assetPositions.some(p => p.position.coin === order.coin && parseFloat(p.position.szi) !== 0);
      if (!hasPosition) {
        coinsWithPendingOrders.add(order.coin);
      }
    }
    console.log(`[Stale Cleanup] Open orders count: ${openOrders.length}, pending coins found: ${Array.from(coinsWithPendingOrders).join(", ")}`);

    // Find the highest score among all tradeable candidates (no positions, no open orders)
    const potentialCandidates = scoredCoins.filter(c => 
      c.score >= minScore && 
      !(config.blacklist || []).includes(c.symbol) && 
      !openOrders.some(o => o.coin === c.symbol) && 
      !userState.assetPositions.some(p => p.position.coin === c.symbol && parseFloat(p.position.szi) !== 0)
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
      } else if ((config.blacklist || []).includes(coinSymbol)) {
        shouldCancel = true;
        cancelReason = `Coin ${coinSymbol} has been blacklisted`;
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
        if (isDryRun) {
          console.log("[DRY RUN] Bypassed stale cancels:", JSON.stringify(cancels));
        } else {
          const cancelRes = await exchange.cancel({ cancels });
          console.log("Stale/orphaned orders cancelled successfully:", JSON.stringify(cancelRes));
        }
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
    const activeAccountSizeEnv = process.env.HYPERLIQUID_ACCOUNT_SIZE;
    let withdrawableUsdForActive = parseFloat(userState.withdrawable || "0");
    if (withdrawableUsdForActive === 0 && spotState && spotState.balances) {
      const usdcBal = spotState.balances.find(b => b.coin === "USDC");
      if (usdcBal) {
        withdrawableUsdForActive = parseFloat(usdcBal.total || "0") - parseFloat(usdcBal.hold || "0");
      }
    }
    const activeAccountSize = activeAccountSizeEnv ? parseFloat(activeAccountSizeEnv) : withdrawableUsdForActive;

    for (const pos of userState.assetPositions) {
      const size = parseFloat(pos.position.szi || "0");
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
      
      // Stop Loss is a trigger order whose price is on the loss side of the currentPrice
      let slOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) < currentPrice : parseFloat(o.triggerPx) > currentPrice));
      
      // Take Profit is a trigger order whose price is on the profit side of the currentPrice
      const tpOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) > currentPrice : parseFloat(o.triggerPx) < currentPrice));

      // Fetch TrueNorth technical analysis for divergence check
      let taDataActive = null;
      const geckoIdActive = geckoIdMap[coin];
      if (geckoIdActive) {
        try {
          const mcpRes = await callTrueNorthMcp('technical_analysis', { token_address: geckoIdActive, timeframe: '1h' });
          if (mcpRes?.result?.content?.[0]?.text) {
            taDataActive = JSON.parse(mcpRes.result.content[0].text);
          }
        } catch (e) {
          console.error(`[Active Trailing] TrueNorth MCP query failed for ${coin}:`, e.message);
        }
      }

      // 1. Calculate recovery levels in case TP/SL are missing (passing entryPx as entryOverride, and currentCoin for current TA references)
      const recoveryLevels = computeStrategyLevels(currentCoin, isLong ? 'LONG' : 'SHORT', taDataActive, null, null, useSmartSlTp, entryPx);

      // 2. Self-healing recovery: if TP or SL order is missing, recreate them!
      if (!tpOrder || !slOrder) {
        console.warn(`[Self-Healing] Missing TP or SL for active position ${coin}! (TP: ${!!tpOrder}, SL: ${!!slOrder})`);
        if (!isDryRun) {
          const ordersToPlace = [];
          const posSizeAbs = Math.abs(size);
          const posSizeStr = formatSize(posSizeAbs, currentCoin.assetInfo.szDecimals);

          if (!tpOrder) {
            const tpPxStr = formatPrice(recoveryLevels.tp);
            const tpWorstPxStr = formatPrice(getTriggerLimitPrice(!isLong, recoveryLevels.tp));
            ordersToPlace.push({
              a: currentCoin.assetIndex,
              b: !isLong,
              p: tpWorstPxStr,
              s: posSizeStr,
              r: true,
              t: { trigger: { triggerPx: tpPxStr, isMarket: true, tpsl: "tp" } },
              c: generateBotCloid()
            });
            console.log(`[Self-Healing] Queueing TP restore for ${coin} at ${tpPxStr}`);
          }

          if (!slOrder) {
            const slPxStr = formatPrice(recoveryLevels.sl);
            const slWorstPxStr = formatPrice(getTriggerLimitPrice(!isLong, recoveryLevels.sl));
            ordersToPlace.push({
              a: currentCoin.assetIndex,
              b: !isLong,
              p: slWorstPxStr,
              s: posSizeStr,
              r: true,
              t: { trigger: { triggerPx: slPxStr, isMarket: true, tpsl: "sl" } },
              c: generateBotCloid()
            });
            console.log(`[Self-Healing] Queueing SL restore for ${coin} at ${slPxStr}`);
          }

          if (ordersToPlace.length > 0) {
            try {
              const orderRes = await exchange.order({
                orders: attachBuilderFee(ordersToPlace)
              });
              console.log(`[Self-Healing] Successfully restored missing TP/SL orders for ${coin}:`, JSON.stringify(orderRes));
              needsOrdersRefresh = true;
            } catch (e) {
              console.error(`[Self-Healing] Failed to restore missing TP/SL for ${coin}:`, e.message);
            }
          }
        } else {
          console.log(`[DRY RUN] Bypassed Self-Healing TP/SL restoration for ${coin}. TP target: ${recoveryLevels.tp}, SL target: ${recoveryLevels.sl}`);
        }
        // Skip further trailing logic in this cycle to let the newly placed orders settle
        continue;
      }

      // 3. Hierarchical active trailing logic
      const tpPx = parseFloat(tpOrder.triggerPx);
      const isNearTp = isLong ? currentPrice >= tpPx * 0.992 : currentPrice <= tpPx * 1.008;
      
      const slIsWorseThanEntry = slOrder && (isLong ? parseFloat(slOrder.triggerPx) < entryPx : parseFloat(slOrder.triggerPx) > entryPx);

      // Check A: Profit Trailing (highest priority)
      if (isNearTp) {
        let trailedTp = isLong ? currentPrice * 1.02 : currentPrice * 0.98; // default fallback trailing TP
        let smartTpAdjusted = false;

        // Fetch Options and Derivatives analysis to check for walls/magnets beyond currentPrice
        if (geckoIdActive) {
          try {
            console.log(`[Profit Trailing] Fetching Options and Derivatives data from TrueNorth to calculate Smart TP for ${coin}...`);
            const [derivRes, optRes] = await Promise.all([
              callTrueNorthMcp('derivatives_analysis', { token_address: geckoIdActive }).catch(() => null),
              callTrueNorthMcp('options_report', { token_address: geckoIdActive }).catch(() => null)
            ]);
            
            let parsedDerivTrailing = null;
            let parsedOptTrailing = null;
            if (derivRes?.result?.content?.[0]?.text) {
              parsedDerivTrailing = JSON.parse(derivRes.result.content[0].text);
            }
            if (optRes?.result?.content?.[0]?.text) {
              parsedOptTrailing = JSON.parse(optRes.result.content[0].text);
            }

            // Calculate strategy levels with maxTpPctOverride = 0.15 (allow up to 15% price change target for second stage!)
            const trailingLevels = computeStrategyLevels(
              currentCoin,
              isLong ? 'LONG' : 'SHORT',
              taDataActive,
              parsedDerivTrailing,
              parsedOptTrailing,
              true, // useSmartSlTp
              entryPx, // entryOverride
              0.15 // maxTpPctOverride
            );

            // Verify if the calculated smart TP is further in the profit direction than currentPrice
            const isValidSmartTp = isLong ? trailingLevels.tp > currentPrice * 1.005 : trailingLevels.tp < currentPrice * 0.995;
            if (isValidSmartTp) {
              trailedTp = trailingLevels.tp;
              smartTpAdjusted = true;
              console.log(`[Profit Trailing] Found valid Smart TP for ${coin} beyond currentPrice: ${trailedTp} (Reason: ${trailingLevels.reason})`);
            }
          } catch (e) {
            console.error(`[Profit Trailing] Smart TP calculation failed for ${coin}:`, e.message);
          }
        }

        const newTpPx = trailedTp;
        const newSlPx = isLong ? tpPx * 0.990 : tpPx * 1.010;

        console.log(`[Profit Trailing] Position ${coin} is near TP (${tpPx}). Trailing TP to ${newTpPx.toFixed(4)}${smartTpAdjusted ? ' (Smart TP)' : ''} and locking SL at ${newSlPx.toFixed(4)}.`);
        try {
          // Pyramiding check and calculation
          const maxLeverage = currentCoin.assetInfo?.maxLeverage || 5;
          const finalLeverage = Math.min(5, maxLeverage);
          let targetSizeUsd = (activeAccountSize * 0.50) * finalLeverage;
          if (targetSizeUsd < 10.5) targetSizeUsd = 10.5;
          const targetSizeTokens = targetSizeUsd / currentPrice;
          const targetSize = parseFloat(formatSize(targetSizeTokens, currentCoin.assetInfo.szDecimals));
          
          const currentSizeAbs = Math.abs(size);
          const isAlreadyPyramided = currentSizeAbs > targetSize * 1.5;

          let newTotalSize = currentSizeAbs;

          if (!isAlreadyPyramided) {
            console.log(`[Profit Trailing] Executing Pyramided Market Order for ${coin}: Size=${targetSize}...`);
            if (isDryRun) {
              console.log(`[DRY RUN] Bypassed placing Pyramided Market Order for ${coin}: Size=${targetSize}`);
              newTotalSize = currentSizeAbs + targetSize;
            } else {
              try {
                const pyramidWorstPxStr = formatPrice(isLong ? currentPrice * 1.02 : currentPrice * 0.98);
                const marketOrderRes = await exchange.order({
                  orders: attachBuilderFee([{
                    a: currentCoin.assetIndex,
                    b: isLong,
                    p: pyramidWorstPxStr,
                    s: formatSize(targetSize, currentCoin.assetInfo.szDecimals),
                    r: false
                  }])
                });
                
                const status = marketOrderRes?.status;
                const statuses = marketOrderRes?.response?.data?.statuses || [];
                const firstStatus = statuses[0];

                if (status === "ok" && firstStatus && !firstStatus.error) {
                  console.log(`[Profit Trailing] Pyramided Market Order filled successfully:`, JSON.stringify(marketOrderRes));
                  newTotalSize = currentSizeAbs + targetSize;
                } else {
                  const errMsg = firstStatus?.error || "Unknown exchange error";
                  console.error(`[Profit Trailing] Pyramided Market Order rejected by exchange: ${errMsg}`);
                  console.log(`[Profit Trailing] Falling back to standard trailing without pyramiding.`);
                  newTotalSize = currentSizeAbs;
                }
              } catch (e) {
                console.error(`[Profit Trailing] Pyramided Market Order failed (likely insufficient margin):`, e.message);
                console.log(`[Profit Trailing] Falling back to standard trailing without pyramiding.`);
                newTotalSize = currentSizeAbs;
              }
            }
          } else {
            console.log(`[Profit Trailing] Position ${coin} is already pyramided. Skipping pyramiding.`);
          }

          const newTotalSzStr = formatSize(newTotalSize, currentCoin.assetInfo.szDecimals);
          const newTpPxStr = formatPrice(newTpPx);
          const tpWorstPx = formatPrice(getTriggerLimitPrice(!isLong, newTpPx));

          const newSlPxStr = formatPrice(newSlPx);
          const slWorstPx = formatPrice(getTriggerLimitPrice(!isLong, newSlPx));

          if (isDryRun) {
            console.log(`[DRY RUN] Bypassed trailed TP/SL for ${coin}: TP=${newTpPxStr}, SL=${newSlPxStr}`);
          } else {
            // Cancel old TP and SL (using safe helper to avoid crashes if already cancelled)
            const cancelsToMake = [{ a: currentCoin.assetIndex, o: tpOrder.oid }];
            if (slOrder) cancelsToMake.push({ a: currentCoin.assetIndex, o: slOrder.oid });
            
            await safeCancelOrders(exchange, cancelsToMake);

            // Place new TP and SL
            const orderRes = await exchange.order({
              orders: attachBuilderFee([
                {
                  a: currentCoin.assetIndex,
                  b: !isLong,
                  p: tpWorstPx,
                  s: newTotalSzStr,
                  r: true,
                  t: { trigger: { triggerPx: newTpPxStr, isMarket: true, tpsl: "tp" } },
                  c: generateBotCloid()
                },
                {
                  a: currentCoin.assetIndex,
                  b: !isLong,
                  p: slWorstPx,
                  s: newTotalSzStr,
                  r: true,
                  t: { trigger: { triggerPx: newSlPxStr, isMarket: true, tpsl: "sl" } },
                  c: generateBotCloid()
                }
              ])
            });
            console.log(`[Profit Trailing] Successfully trailed TP/SL for ${coin} with Size=${newTotalSzStr}:`, JSON.stringify(orderRes));
          }
          needsOrdersRefresh = true;
        } catch (e) {
          console.error(`[Profit Trailing] Failed to trail TP/SL for ${coin}:`, e.message);
        }
      }
      
      // Check B: Smart TP Adjustment (nearest resistance/support)
      else if (taDataActive?.support_resistance?.['support and resistance channel']?.channels) {
        const srChannels = [...taDataActive.support_resistance['support and resistance channel'].channels]
          .sort((a, b) => b.strength - a.strength);

        const minTpAllowed = isLong
          ? entryPx * (1 + config.minTpBuffer)
          : entryPx * (1 - config.minTpBuffer);

        let smartTpTarget = null;
        if (isLong) {
          const resistances = srChannels
            .filter(c => c.lo >= minTpAllowed && c.lo < tpPx)
            .sort((a, b) => b.lo - a.lo); // nearest valid resistance
          if (resistances.length > 0) smartTpTarget = resistances[0].lo;
        } else {
          const supports = srChannels
            .filter(c => c.hi <= minTpAllowed && c.hi > tpPx)
            .sort((a, b) => b.hi - a.hi); // nearest valid support
          if (supports.length > 0) smartTpTarget = supports[0].hi;
        }

        if (smartTpTarget) {
          console.log(`[Smart TP] ${coin}: Adjusting TP from ${tpPx} to nearest key level at ${smartTpTarget.toFixed(4)}.`);
          try {
            const entrySz = formatSize(Math.abs(size), currentCoin.assetInfo.szDecimals);
            const newTpPxStr = formatPrice(smartTpTarget);
            const tpWorstPx = formatPrice(getTriggerLimitPrice(!isLong, smartTpTarget));

            if (isDryRun) {
              console.log(`[DRY RUN] Bypassed Smart TP adjustment for ${coin}: old TP=${tpPx}, new TP=${smartTpTarget}`);
            } else {
              await safeCancelOrders(exchange, [{ a: currentCoin.assetIndex, o: tpOrder.oid }]);
              const orderRes = await exchange.order({
                orders: attachBuilderFee([{
                  a: currentCoin.assetIndex,
                  b: !isLong,
                  p: tpWorstPx,
                  s: entrySz,
                  r: true,
                  t: { trigger: { triggerPx: newTpPxStr, isMarket: true, tpsl: "tp" } },
                  c: generateBotCloid()
                }])
              });
              console.log(`[Smart TP] Successfully adjusted TP for ${coin}:`, JSON.stringify(orderRes));
            }
            needsOrdersRefresh = true;
          } catch (e) {
            console.error(`[Smart TP] Failed to adjust TP for ${coin}:`, e.message);
          }
        }
      }

      // Check C: Breakeven Stop Loss (in profit >= 1.5%)
      if (returnPct >= 0.015 && slOrder && slIsWorseThanEntry && !isNearTp) {
        console.log(`[Breakeven] Position ${coin} is in profit by ${(returnPct * 100).toFixed(2)}%. Moving SL to entry: ${entryPx}`);
        try {
          const entrySz = formatSize(Math.abs(size), currentCoin.assetInfo.szDecimals);
          const entryPxStr = formatPrice(entryPx);
          const slWorstPx = formatPrice(getTriggerLimitPrice(!isLong, entryPx));

          if (isDryRun) {
            console.log(`[DRY RUN] Bypassed SL cancellation and recreation at entry for ${coin}`);
          } else {
            await safeCancelOrders(exchange, [{ a: currentCoin.assetIndex, o: slOrder.oid }]);
            const orderRes = await exchange.order({
              orders: attachBuilderFee([{
                a: currentCoin.assetIndex,
                b: !isLong,
                p: slWorstPx,
                s: entrySz,
                r: true,
                t: { trigger: { triggerPx: entryPxStr, isMarket: true, tpsl: "sl" } },
                c: generateBotCloid()
              }])
            });
            console.log(`[Breakeven] Placed new SL at entry for ${coin}:`, JSON.stringify(orderRes));
          }
          needsOrdersRefresh = true;
        } catch (e) {
          console.error(`[Breakeven] Failed to move SL for ${coin}:`, e.message);
        }
      }

      // Check D: Counter-Divergence SL Tightening
      else if (taDataActive?.support_resistance?.rsi_divergence && slOrder && slIsWorseThanEntry) {
        const divInfo = taDataActive.support_resistance.rsi_divergence;
        const divType = divInfo.latest_signal?.type || "";
        const isCounterDivergence = isLong 
          ? (divType.includes("bear_hidden") || divType.includes("bear_classic"))
          : (divType.includes("bull_hidden") || divType.includes("bull_classic"));

        if (isCounterDivergence) {
          console.warn(`[Active Trailing] Counter-divergence (${divType}) detected for ${coin}! Tightening SL to entry: ${entryPx}`);
          try {
            const entrySz = formatSize(Math.abs(size), currentCoin.assetInfo.szDecimals);
            const entryPxStr = formatPrice(entryPx);
            const slWorstPx = formatPrice(getTriggerLimitPrice(!isLong, entryPx));

            if (isDryRun) {
              console.log(`[DRY RUN] Bypassed divergence SL tightening for ${coin}`);
            } else {
              await safeCancelOrders(exchange, [{ a: currentCoin.assetIndex, o: slOrder.oid }]);
              const orderRes = await exchange.order({
                orders: attachBuilderFee([{
                  a: currentCoin.assetIndex,
                  b: !isLong,
                  p: slWorstPx,
                  s: entrySz,
                  r: true,
                  t: { trigger: { triggerPx: entryPxStr, isMarket: true, tpsl: "sl" } },
                  c: generateBotCloid()
                }])
              });
              console.log(`[Active Trailing] Successfully tightened SL for ${coin}:`, JSON.stringify(orderRes));
            }
            needsOrdersRefresh = true;
          } catch (e) {
            console.error(`[Active Trailing] Failed to tighten SL for ${coin}:`, e.message);
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

    // 5c. Limit Order Entry Level Trailing: No longer needed as we use instant market (taker) entry.


    // Pick top candidates (score >= minScore) across all Hyperliquid coins
    const watchlist = config.watchlist || ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];
    const candidates = scoredCoins.filter(c => c.score >= minScore && watchlist.includes(c.symbol) && !(config.blacklist || []).includes(c.symbol));
    if (candidates.length === 0) {
      return res.status(200).json({ status: "success", message: `No candidates with score >= ${minScore} found at this time.` });
    }

    // Filter candidates that are not currently in active positions/orders
    const tradeableCandidates = [];
    for (const cand of candidates) {
      const hasOpenOrder = openOrders.some(order => order.coin === cand.symbol);
      const hasPosition = userState.assetPositions.some(p => p.position.coin === cand.symbol && parseFloat(p.position.szi) !== 0);

      if (!hasOpenOrder && !hasPosition) {
        tradeableCandidates.push(cand);
      }
    }

    if (tradeableCandidates.length === 0) {
      return res.status(200).json({ status: "success", message: "Candidates found but all already have open positions or orders." });
    }

    // Fetch BTC technical analysis and Nansen flows in parallel
    let btcTrend = 'UNKNOWN';
    const topN = Math.min(tradeableCandidates.length, 3);
    console.log(`[Nansen & BTC Check] Fetching global BTC trend and Nansen flows in parallel...`);
    
    await Promise.all([
      // 1. Fetch BTC trend
      (async () => {
        try {
          console.log("[BTC Trend Filter] Querying BTC technical analysis from TrueNorth...");
          const btcTaRes = await callTrueNorthMcp('technical_analysis', { token_address: 'bitcoin', timeframe: '1h' });
          if (btcTaRes?.result?.content?.[0]?.text) {
            const btcTa = JSON.parse(btcTaRes.result.content[0].text);
            const vwap = btcTa?.support_resistance?.vwap?.cumulative;
            if (vwap) {
              if (vwap.state === 'price_above' && vwap.slope === 'up') {
                btcTrend = 'BULLISH';
              } else if (vwap.state === 'price_below' && vwap.slope === 'down') {
                btcTrend = 'BEARISH';
              } else {
                btcTrend = 'NEUTRAL';
              }
            }
          }
        } catch (e) {
          console.error("[BTC Trend Filter] Failed to fetch or parse BTC TA from TrueNorth:", e.message);
        }
        console.log(`[BTC Trend Filter] Global BTC Trend determined: ${btcTrend}`);
      })(),
      // 2. Fetch Nansen flows
      (async () => {
        if (config.enableNansenScoring !== true) {
          console.log(`[Nansen Integration] Nansen scoring is disabled in config. Skipping Nansen API calls.`);
          tradeableCandidates.forEach(cand => {
            cand.nansenSmartMoney = 0;
            cand.nansenWhale = 0;
            cand.nansenExchange = 0;
          });
          return;
        }

        console.log(`[Nansen Integration] Querying Nansen Smart Money flows for top ${topN} candidates...`);
        await Promise.all(tradeableCandidates.slice(0, topN).map(async (cand) => {
          const nansenInfo = await getNansenTokenAddress(cand.symbol);
          if (nansenInfo) {
            console.log(`[Nansen Integration] Resolved address for ${cand.symbol}: ${nansenInfo.address} (${nansenInfo.chain})`);
            const { bonus, details, nansenSmartMoney, nansenWhale, nansenExchange } = await getSmartMoneyBonus(nansenInfo.chain, nansenInfo.address);
            cand.nansenSmartMoney = nansenSmartMoney;
            cand.nansenWhale = nansenWhale;
            cand.nansenExchange = nansenExchange;
            cand.score = Math.min(100, Math.max(0, cand.score + bonus));
            console.log(`[Nansen Integration] Adjusted candidate ${cand.symbol} score by ${bonus} to ${cand.score}. Flow details: ${details.replace(/\n/g, ' ')}`);
          } else {
            console.log(`[Nansen Integration] Could not resolve Nansen address/chain for ${cand.symbol}`);
            cand.nansenSmartMoney = 0;
            cand.nansenWhale = 0;
            cand.nansenExchange = 0;
          }
        }));
      })()
    ]);

    // Re-sort tradeableCandidates since scores might have changed after Nansen check
    tradeableCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.volume - a.volume;
    });

    // Process tradeable candidates through the Crowded Trade Filter
    let target = null;
    let taData = null;
    let derivData = null;
    let optionsData = null;

    const crowdedPercentileLimit = process.env.HYPERLIQUID_CROWDED_PERCENTILE 
      ? parseInt(process.env.HYPERLIQUID_CROWDED_PERCENTILE) 
      : 90;

    // Cooldown map calculation
    const lastFillTimeMap = {};
    if (Array.isArray(userFills)) {
      const minFillValueUsd = config.minFillValueUsd !== undefined ? config.minFillValueUsd : 5.0;
      userFills.forEach(f => {
        const fillValue = parseFloat(f.sz) * parseFloat(f.px);
        if (fillValue >= minFillValueUsd) {
          if (!lastFillTimeMap[f.coin] || f.time > lastFillTimeMap[f.coin]) {
            lastFillTimeMap[f.coin] = f.time;
          }
        }
      });
    }
    const cooldownHours = config.cooldownHours !== undefined ? config.cooldownHours : 2;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;

    for (const cand of tradeableCandidates) {
      const lastFillTime = lastFillTimeMap[cand.symbol];
      if (lastFillTime) {
        const timeSinceLastTrade = Date.now() - lastFillTime;
        if (timeSinceLastTrade < cooldownMs) {
          console.log(`[Cooldown Filter] Skip candidate ${cand.symbol}: Last trade was ${(timeSinceLastTrade / 60000).toFixed(1)} mins ago (cooldown: ${cooldownHours * 60} mins)`);
          continue;
        }
      }

      const geckoId = geckoIdMap[cand.symbol];
      let parsedTa = null;
      let parsedDeriv = null;
      let parsedOpt = null;

      if (geckoId) {
        try {
          console.log(`[Bot Execution] Checking candidate ${cand.symbol} (Score: ${cand.score}) with Crowded Trade filter...`);
          const results = await Promise.allSettled([
            callTrueNorthMcp('technical_analysis', { token_address: geckoId, timeframe: '1h' }),
            callTrueNorthMcp('derivatives_analysis', { token_address: geckoId }),
            callTrueNorthMcp('options_report', { token_address: geckoId })
          ]);
          
          if (results[0].status === 'fulfilled' && results[0].value?.result?.content?.[0]?.text) {
            try { 
              parsedTa = JSON.parse(results[0].value.result.content[0].text); 
              let tnVwapVal = 0;
              if (parsedTa?.support_resistance?.vwap?.cumulative) {
                const vwapData = parsedTa.support_resistance.vwap.cumulative;
                if (vwapData.state === 'price_above' && vwapData.slope === 'up') {
                  tnVwapVal = 1;
                } else if (vwapData.state === 'price_below' && vwapData.slope === 'down') {
                  tnVwapVal = 2;
                }
              }
              cand.tnVwap = tnVwapVal;
            } catch (e) { 
              console.error("Failed to parse taData:", e.message); 
            }
          }
          if (results[1].status === 'fulfilled' && results[1].value?.result?.content?.[0]?.text) {
            try { parsedDeriv = JSON.parse(results[1].value.result.content[0].text); } catch (e) { console.error("Failed to parse derivData:", e.message); }
          }
          if (results[2].status === 'fulfilled') {
            parsedOpt = results[2].value;
          }
        } catch (e) {
          console.error(`TrueNorth MCP query failed for candidate ${cand.symbol}:`, e.message);
        }
      } else {
        console.log(`[Bot Execution] Checking candidate ${cand.symbol} (Score: ${cand.score}) without TrueNorth mapping...`);
      }

      // Calculate 24h SMA for trend filter
      let sma24 = cand.price;
      try {
        const endTime = Date.now();
        const startTime = endTime - 30 * 60 * 60 * 1000;
        const candles = await info.candleSnapshot({ coin: cand.symbol, interval: "1h", startTime, endTime });
        if (candles && candles.length >= 25) {
          const last25 = candles.slice(-25);
          const sumClose = last25.reduce((sum, c) => sum + parseFloat(c.c), 0);
          sma24 = sumClose / 25;
        }
      } catch (e) {
        console.error(`Failed to calculate 24h SMA for candidate ${cand.symbol}:`, e.message);
      }

      // Evaluate raw direction (without SMA/VWAP trend filters)
      const rawDirection = detectAutoDirection(cand, parsedTa, null);

      // Pre-calculate candidate levels using raw direction
      const useSmartSlTpForCand = process.env.USE_SMART_SL_TP !== 'false' && req.query.smart_sl_tp !== 'false';
      const levels = computeStrategyLevels(cand, rawDirection, parsedTa, parsedDeriv, parsedOpt, useSmartSlTpForCand);
      
      let bypassTrendFilter = false;
      if (rawDirection === 'LONG' && levels.reason.includes('support_rebound')) {
        const minDrop = config.minSupportDropPct !== undefined ? config.minSupportDropPct : 0.015;
        if (levels.entry <= cand.price * (1 - minDrop)) {
          bypassTrendFilter = true;
          console.log(`[Support Rebound Bypass] Candidate ${cand.symbol} qualifies for Support Rebound limit buy (Entry: ${levels.entry} is >= ${(minDrop * 100).toFixed(1)}% below market price: ${cand.price}). Bypassing trend filters.`);
        } else {
          console.log(`[Support Rebound Bypass Check] Candidate ${cand.symbol} did not qualify: Entry: ${levels.entry} is not >= ${(minDrop * 100).toFixed(1)}% below market price: ${cand.price}`);
        }
      } else if (rawDirection === 'SHORT' && levels.reason.includes('resistance_rebound')) {
        const minRise = config.minResistanceRisePct !== undefined ? config.minResistanceRisePct : 0.015;
        if (levels.entry >= cand.price * (1 + minRise)) {
          bypassTrendFilter = true;
          console.log(`[Resistance Rebound Bypass] Candidate ${cand.symbol} qualifies for Resistance Rebound limit sell (Entry: ${levels.entry} is >= ${(minRise * 100).toFixed(1)}% above market price: ${cand.price}). Bypassing trend filters.`);
        } else {
          console.log(`[Resistance Rebound Bypass Check] Candidate ${cand.symbol} did not qualify: Entry: ${levels.entry} is not >= ${(minRise * 100).toFixed(1)}% above market price: ${cand.price}`);
        }
      }

      // Evaluate direction with trend filters applied (if not bypassed)
      const direction = bypassTrendFilter ? rawDirection : detectAutoDirection(cand, parsedTa, sma24);
      if (direction === 'SKIP') {
        console.log(`[Bot Execution] Skip candidate ${cand.symbol}: Direction filtered by 24h SMA/VWAP Trend Filter (Price: ${cand.price}, SMA: ${sma24})`);
        continue;
      }

      // BTC Trend Filter Check
      if (!bypassTrendFilter) {
        if (btcTrend === 'BULLISH' && direction === 'SHORT') {
          console.log(`[BTC Trend Filter] Skip SHORT candidate ${cand.symbol}: BTC is Bullish (Current BTC Trend: ${btcTrend})`);
          continue;
        }
        if (btcTrend === 'BEARISH' && direction === 'LONG') {
          console.log(`[BTC Trend Filter] Skip LONG candidate ${cand.symbol}: BTC is Bearish (Current BTC Trend: ${btcTrend})`);
          continue;
        }
        if (btcTrend === 'NEUTRAL') {
          const isReboundTrade = levels.reason.includes('support_rebound') || levels.reason.includes('resistance_rebound') || levels.reason.includes('sr_channel');
          if (isReboundTrade) {
            console.log(`[BTC Trend Filter] BTC is Neutral, but candidate ${cand.symbol} is a Rebound Trade (${levels.reason}). Bypassing neutral filter.`);
          } else {
            console.log(`[BTC Trend Filter] Skip ${direction} candidate ${cand.symbol}: BTC is Neutral (No clear trend)`);
            continue;
          }
        }
      }

      // Crowded Trade Filter
      if (parsedDeriv?.derivative_data?.[cand.symbol]) {
        const deriv = parsedDeriv.derivative_data[cand.symbol];
        const fundingInfo = deriv["1h Aggregated OI weighted funding rate"];
        if (fundingInfo) {
          const percentile = fundingInfo.current_funding_percentile_7d || 50;
          const fundingRate = fundingInfo.current_funding_rate_in_percentage || 0;
          
          let isCrowded = false;
          let crowdedReason = "";

          if (direction === 'LONG') {
            if (fundingRate > 0 && percentile >= crowdedPercentileLimit) {
              isCrowded = true;
              crowdedReason = `Long funding percentile ${percentile}% is >= ${crowdedPercentileLimit}% (Rate: ${fundingRate.toFixed(4)}%)`;
            }
          } else {
            if (fundingRate < 0 && percentile >= crowdedPercentileLimit) {
              isCrowded = true;
              crowdedReason = `Short funding percentile ${percentile}% is >= ${crowdedPercentileLimit}% (Rate: ${fundingRate.toFixed(4)}%)`;
            }
          }

          if (isCrowded) {
            console.warn(`[Bot Execution] Skip candidate ${cand.symbol}: Crowded Trade! Reason: ${crowdedReason}`);
            continue;
          }
        }
      }

      // Valid candidate found
      target = cand;
      taData = parsedTa;
      derivData = parsedDeriv;
      optionsData = parsedOpt;
      target.precalculatedLevels = levels;
      target.direction = direction;
      break;
    }

    if (!target) {
      console.warn("[Bot Execution] No trade: All candidates were filtered out by Crowded Trade rules.");
      return res.status(200).json({ status: "success", message: "No trade: All candidates were filtered out by Crowded Trade rules." });
    }

    console.log(`[Bot Execution] Smart TP/SL Enabled: ${useSmartSlTp}`);

    const direction = target.direction;
    const levels = target.precalculatedLevels || computeStrategyLevels(target, direction, taData, derivData, optionsData, useSmartSlTp);
    console.log(`[Bot Execution] Calculated Levels: Entry=${levels.entry}, TP=${levels.tp}, SL=${levels.sl}, Reason=${levels.reason}`);

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

    // Use dynamic leverage: min(5, coin's max leverage) to avoid "Invalid leverage value" error
    const maxLeverage = target.assetInfo?.maxLeverage || 5;
    const finalLeverage = Math.min(5, maxLeverage);
    let positionSizeUsd = (accountSize * 0.50) * finalLeverage;
    
    // Hyperliquid requires a minimum notional order size of $10.0.
    // We round up to $10.5 if the calculated size is smaller, to ensure the order is accepted.
    if (positionSizeUsd < 10.5) {
      positionSizeUsd = 10.5;
    }

    const positionSizeTokens = positionSizeUsd / levels.entry;

    // 7. Execute Leverage and Order
    const isBuy = direction === "LONG";
    const entrySz = formatSize(positionSizeTokens, target.assetInfo.szDecimals);
    const entryPx = formatPrice(levels.entry);
    const entryMarketWorstPx = formatPrice(isBuy ? levels.entry * 1.02 : levels.entry * 0.98);

    const tpPx = formatPrice(levels.tp);
    const tpWorstPx = formatPrice(getTriggerLimitPrice(!isBuy, levels.tp));

    const slPx = formatPrice(levels.sl);
    const slWorstPx = formatPrice(getTriggerLimitPrice(!isBuy, levels.sl));

    const entryCloid = generateEncodedCloid({
      score: target.score,
      nansenSmartMoney: target.nansenSmartMoney || 0,
      nansenWhale: target.nansenWhale || 0,
      nansenExchange: target.nansenExchange || 0,
      tnVwap: target.tnVwap || 0,
      direction
    });
    console.log(`[Bot Execution] Generated encoded cloid for entry: ${entryCloid}`);

    if (isDryRun) {
      console.log(`[DRY RUN] Bypassed updating leverage for ${target.symbol} to ${finalLeverage}x`);
      console.log(`[DRY RUN] Bypassed placing GTC Limit bracket order for ${target.symbol}: Entry Limit=${entryPx}, TP Trigger=${tpPx}, SL Trigger=${slPx}, Size=${entrySz}, Cloid=${entryCloid}`);
      return res.status(200).json({
        status: "success",
        message: "[DRY RUN] Simulated trade execution succeeded",
        executedTrade: {
          symbol: target.symbol,
          score: target.score,
          direction,
          leverage: finalLeverage,
          positionSizeUsd: positionSizeUsd.toFixed(2),
          entryPrice: entryPx,
          stopLoss: slPx,
          takeProfit: tpPx,
          cloid: entryCloid,
          orderResult: { status: "simulated" }
        }
      });
    } else {
      // A. Update Leverage
      await exchange.updateLeverage({
        asset: target.assetIndex,
        isCross: true,
        leverage: finalLeverage
      });

      // B. Place Bracket Order (Limit Entry + TP/SL bracket)
      const orderResult = await exchange.order({
        orders: attachBuilderFee([
          // Limit Maker Entry (Gtc)
          {
            a: target.assetIndex,
            b: isBuy,
            p: entryPx,
            s: entrySz,
            r: false,
            t: { limit: { tif: "Gtc" } },
            c: entryCloid
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
            },
            c: generateBotCloid()
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
            },
            c: generateBotCloid()
          }
        ]),
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
    }

  } catch (error) {
    console.error("Bot execution error:", error);
    return res.status(500).json({ error: error.message });
  }
}
// Trigger Vercel rebuild
