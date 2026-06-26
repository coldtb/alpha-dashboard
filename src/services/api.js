import { store } from '../store/index.js';
import { floatParse } from '../utils/helpers.js';

// Generic JSON-RPC tool caller helper
export async function callMcpTool(toolName, args) {
  try {
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
    if (!res.ok) {
      throw new Error(`Proxy status: ${res.status}`);
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    if (data.result && data.result.content && data.result.content[0] && data.result.content[0].text) {
      return JSON.parse(data.result.content[0].text);
    }
    throw new Error('Invalid response structure');
  } catch (err) {
    console.warn(`Failed to call TrueNorth tool ${toolName}:`, err);
    return null;
  }
}

// Fetch Binance Futures top 100 volume data and funding rates
export async function fetchScannerData() {
  try {
    // 1. Fetch 24h tickers
    const resTicker = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
    const tickers = await resTicker.json();
    
    // 2. Fetch funding rates
    const resFunding = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex");
    const premiumData = await resFunding.json();
    
    // Create funding rate map
    const fundingMap = {};
    premiumData.forEach(item => {
      fundingMap[item.symbol] = {
        fundingRate: floatParse(item.lastFundingRate),
        markPrice: floatParse(item.markPrice)
      };
    });
    
    // 3. Process and filter
    const usdtPerps = tickers.filter(t => t.symbol.endsWith("USDT"));
    
    // Sort by 24h volume (USDT)
    usdtPerps.sort((a, b) => floatParse(b.quoteVolume) - floatParse(a.quoteVolume));
    
    // Take Top 100
    const top100Raw = usdtPerps.slice(0, 100);
    
    // Integrate funding rates and calculate setups
    store.top100Coins = top100Raw.map((coin, index) => {
      const symbolBase = coin.symbol.replace("USDT", "");
      const fundingInfo = fundingMap[coin.symbol] || { fundingRate: 0.0001, markPrice: floatParse(coin.lastPrice) };
      
      const change = floatParse(coin.priceChangePercent);
      const fundingRate = fundingInfo.fundingRate;
      
      // Determine setups
      let setup = "Neutral";
      if (Math.abs(change) <= 3.0 && fundingRate < 0) {
        setup = "Squeeze Setup";
      } else if (Math.abs(change) <= 1.5) {
        setup = "Consolidating";
      }
      
      return {
        rank: index + 1,
        symbol: symbolBase,
        fullName: coin.symbol,
        price: fundingInfo.markPrice || floatParse(coin.lastPrice),
        change: change,
        volume: floatParse(coin.quoteVolume),
        funding: fundingRate,
        setup: setup,
        high: floatParse(coin.highPrice),
        low: floatParse(coin.lowPrice)
      };
    });
    
    // Also fetch HYPE from Hyperliquid mids
    await fetchHyperliquidHypePrice();
    
  } catch (err) {
    console.error("Error fetching scanner data:", err);
  }
}

// Fetch HYPE price from Hyperliquid API
export async function fetchHyperliquidHypePrice() {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" })
    });
    const mids = await res.json();
    const hypePrice = parseFloat(mids["HYPE"] || 0);
    
    if (hypePrice > 0) {
      store.watchlistPrices["HYPE"].price = hypePrice;
      
      const existingIdx = store.top100Coins.findIndex(c => c.symbol === "HYPE");
      if (existingIdx !== -1) {
        store.top100Coins[existingIdx].price = hypePrice;
        store.top100Coins[existingIdx].high = hypePrice * 1.05;
        store.top100Coins[existingIdx].low = hypePrice * 0.95;
      } else {
        store.top100Coins.push({
          rank: 101,
          symbol: "HYPE",
          fullName: "HYPE",
          price: hypePrice,
          change: -9.4,
          volume: 85000000,
          funding: -0.00013,
          setup: "Squeeze Setup",
          high: hypePrice * 1.05,
          low: hypePrice * 0.95
        });
      }
    }
  } catch (e) {
    console.error("HL price fetch error:", e);
  }
}

// WebSocket connection to Binance Futures real-time ticks
export function initWebSockets(onPriceUpdate, onConnectionStateChange) {
  const wsUrl = "wss://fstream.binance.com/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker/linkusdt@ticker/xrpusdt@ticker/injusdt@ticker/wldusdt@ticker";
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log("Binance WebSocket connection established.");
    if (onConnectionStateChange) {
      onConnectionStateChange("Connected");
    }
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const data = message.data;
    
    if (data) {
      const symbolBase = data.s.replace("USDT", "");
      const newPrice = parseFloat(data.c);
      const change = parseFloat(data.P);
      
      const prevData = store.watchlistPrices[symbolBase];
      if (prevData) {
        const oldPrice = prevData.price;
        prevData.price = newPrice;
        prevData.change = change;
        
        // Sync to top100Coins
        const coinIdx = store.top100Coins.findIndex(c => c.symbol === symbolBase);
        if (coinIdx !== -1) {
          store.top100Coins[coinIdx].price = newPrice;
          store.top100Coins[coinIdx].change = change;
        }

        if (onPriceUpdate) {
          onPriceUpdate(symbolBase, newPrice, oldPrice);
        }
      }
    }
  };
  
  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
  
  ws.onclose = () => {
    console.log("WebSocket connection closed. Reconnecting...");
    if (onConnectionStateChange) {
      onConnectionStateChange("Reconnecting");
    }
    setTimeout(() => initWebSockets(onPriceUpdate, onConnectionStateChange), 5000);
  };
}

// Fetch deep insights from TrueNorth MCP
export async function fetchDeepInsights(symbol, geckoId) {
  const [taData, derivData, whaleData, optionsData] = await Promise.all([
    store.mcpCache.technical[symbol] || callMcpTool('technical_analysis', { token_address: geckoId, timeframe: '1h' }).catch(() => null),
    store.mcpCache.derivatives[symbol] || callMcpTool('derivatives_analysis', { token_address: geckoId }).catch(() => null),
    store.mcpCache.smartMoney[symbol] || callMcpTool('hyperliquid_smart_money', { token_address: geckoId }).catch(() => null),
    store.mcpCache.options[symbol] || callMcpTool('options_report', { token_address: geckoId }).catch(() => null)
  ]);
  
  if (taData) store.mcpCache.technical[symbol] = taData;
  if (derivData) store.mcpCache.derivatives[symbol] = derivData;
  if (whaleData) store.mcpCache.smartMoney[symbol] = whaleData;
  if (optionsData) store.mcpCache.options[symbol] = optionsData;
  
  return { taData, derivData, whaleData, optionsData };
}

// Fetch active positions and performance PnL data from bot API
export async function fetchPerformance() {
  const res = await fetch("/api/pnl");
  if (!res.ok) {
    throw new Error(`PNL API returned status: ${res.status}`);
  }
  const data = await res.json();
  if (data.status !== "success") {
    throw new Error(data.error || "Unknown API error");
  }
  return data;
}

// Backtester API client
export async function runBacktest(coin, days, minScore) {
  const response = await fetch(`/api/backtest?coin=${coin}&days=${days}&min_score=${minScore}`);
  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || "Failed to execute backtest");
  }
  return await response.json();
}

// Bot Config API client
export async function fetchBotConfig() {
  const res = await fetch("/api/config");
  if (!res.ok) {
    throw new Error(`Config API returned status: ${res.status}`);
  }
  return await res.json();
}
