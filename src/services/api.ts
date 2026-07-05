import { Ticker, BotConfig } from '../types';
import { floatParse } from '../utils/helpers';

// Generic JSON-RPC tool caller helper
export async function callMcpTool(toolName: string, args: Record<string, any>): Promise<any> {
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
export async function fetchScannerData(): Promise<Ticker[]> {
  try {
    // 1. Fetch 24h tickers
    const resTicker = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
    const tickers = await resTicker.json();
    
    // 2. Fetch funding rates
    const resFunding = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex");
    const premiumData = await resFunding.json();
    
    // Create funding rate map
    const fundingMap: Record<string, { fundingRate: number; markPrice: number }> = {};
    premiumData.forEach((item: any) => {
      fundingMap[item.symbol] = {
        fundingRate: floatParse(item.lastFundingRate),
        markPrice: floatParse(item.markPrice)
      };
    });
    
    // 3. Process and filter
    const usdtPerps = tickers.filter((t: any) => t.symbol.endsWith("USDT"));
    
    // Sort by 24h volume (USDT)
    usdtPerps.sort((a: any, b: any) => floatParse(b.quoteVolume) - floatParse(a.quoteVolume));
    
    // Take Top 100
    const top100Raw = usdtPerps.slice(0, 100);
    
    // Integrate funding rates and calculate setups
    const parsedTickers: Ticker[] = top100Raw.map((coin: any, index: number) => {
      const symbolBase = coin.symbol.replace("USDT", "");
      const fundingInfo = fundingMap[coin.symbol] || { fundingRate: 0.0001, markPrice: floatParse(coin.lastPrice) };
      
      const change = floatParse(coin.priceChangePercent);
      
      return {
        rank: index + 1,
        symbol: symbolBase,
        price: fundingInfo.markPrice || floatParse(coin.lastPrice),
        change: change,
        volume: floatParse(coin.quoteVolume),
        funding: fundingInfo.fundingRate,
        high: floatParse(coin.highPrice),
        low: floatParse(coin.lowPrice),
        score: 50,
        assetIndex: -1
      };
    });
    
    return parsedTickers;
  } catch (err) {
    console.error("Error fetching scanner data:", err);
    return [];
  }
}

// Fetch HYPE price from Hyperliquid API
export async function fetchHyperliquidHypePrice(): Promise<number> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" })
    });
    const mids = await res.json();
    return parseFloat(mids["HYPE"] || 0);
  } catch (e) {
    console.error("HL price fetch error:", e);
    return 0;
  }
}

// WebSocket connection to Binance Futures real-time ticks
export function initWebSockets(
  onPriceUpdate: (symbol: string, newPrice: number, change: number) => void,
  onConnectionStateChange?: (state: string) => void
): () => void {
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
      onPriceUpdate(symbolBase, newPrice, change);
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
  };

  // Return unsubscribe/disconnect function
  return () => {
    ws.close();
  };
}

export interface DeepInsights {
  taData: any;
  derivData: any;
  whaleData: any;
  optionsData: any;
}

// Fetch deep insights from TrueNorth MCP
export async function fetchDeepInsights(
  symbol: string,
  geckoId: string,
  cache: Record<string, any> = {}
): Promise<DeepInsights> {
  const [taData, derivData, whaleData, optionsData] = await Promise.all([
    cache[`ta_${symbol}`] || callMcpTool('technical_analysis', { token_address: geckoId, timeframe: '1h' }).catch(() => null),
    cache[`deriv_${symbol}`] || callMcpTool('derivatives_analysis', { token_address: geckoId }).catch(() => null),
    cache[`smart_${symbol}`] || callMcpTool('hyperliquid_smart_money', { token_address: geckoId }).catch(() => null),
    cache[`options_${symbol}`] || callMcpTool('options_report', { token_address: geckoId }).catch(() => null)
  ]);
  
  return { taData, derivData, whaleData, optionsData };
}

// Fetch active positions and performance PnL data from bot API
export async function fetchPerformance(): Promise<any> {
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
export async function runBacktest(coin: string, days: number, minScore: number): Promise<any> {
  const response = await fetch(`/api/backtest?coin=${coin}&days=${days}&min_score=${minScore}`);
  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || "Failed to execute backtest");
  }
  return await response.json();
}

// Bot Config API client
export async function fetchBotConfig(): Promise<BotConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) {
    throw new Error(`Config API returned status: ${res.status}`);
  }
  return await res.json();
}

// Fetch historical candles from public Hyperliquid API
export async function fetchCandles(coin: string): Promise<any[]> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin,
          interval: "1h",
          startTime: Date.now() - 30 * 60 * 60 * 1000,
          endTime: Date.now()
        }
      })
    });
    if (!res.ok) throw new Error(`Hyperliquid HTTP error: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`Failed to fetch candles for ${coin}:`, e);
    return [];
  }
}
