import { Ticker } from '../types';

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

// Hyperliquid Mainnet 30 Crypto Perps Watchlist
export const DEFAULT_TRADFI_WATCHLIST: string[] = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT",
  "TON", "TRX", "LTC", "TAO", "SUI", "ARB", "NEAR", "ALGO", "UNI", "AAVE",
  "CRV", "HYPE", "XMR", "ZEC", "ENA", "ZRO", "WLD", "PUMP", "kPEPE"
];

// Fetch crypto perp market data from Hyperliquid
export async function fetchMarkets(watchlist: string[] = DEFAULT_TRADFI_WATCHLIST): Promise<Ticker[]> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" })
    });
    if (!res.ok) return [];
    const [meta, ctxs] = await res.json();
    if (!meta?.universe || !Array.isArray(ctxs)) return [];

    const symbols = watchlist && watchlist.length ? watchlist : DEFAULT_TRADFI_WATCHLIST;
    const cleanWatchlist = symbols.map(s => s.replace("xyz:", ""));

    const tickers: Ticker[] = [];
    meta.universe.forEach((asset: any, index: number) => {
      if (cleanWatchlist.length > 0 && !cleanWatchlist.includes(asset.name)) return;
      const ctx = ctxs[index];
      if (!ctx) return;

      const price = parseFloat(ctx.markPx || ctx.midPx || "0");
      const prevPrice = parseFloat(ctx.prevDayPx || "0") || price;
      const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
      const volume = parseFloat(ctx.dayNtlVlm || "0");
      const funding = parseFloat(ctx.funding || "0") * 3; // Daily equivalent

      if (price === 0) return;

      let setup = "Consolidating";
      if (Math.abs(change) >= 2.5 || Math.abs(funding) > 0.0003) {
        setup = "Squeeze Setup";
      }

      tickers.push({
        rank: 0,
        symbol: asset.name,
        price,
        change,
        volume,
        funding,
        high: price * 1.02,
        low: price * 0.98,
        score: Math.min(100, Math.max(0, Math.round(50 + change * 2))),
        setup,
        assetIndex: index
      });
    });

    // Sort by volume descending
    tickers.sort((a, b) => b.volume - a.volume);
    tickers.forEach((t, i) => { t.rank = i + 1; });

    return tickers;
  } catch (err) {
    console.error("Error fetching crypto perp markets:", err);
    return [];
  }
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
export async function runBacktest(coin: string, days: number, minScore: number, initialBalance?: number): Promise<any> {
  const url = `/api/backtest?coin=${coin}&days=${days}&min_score=${minScore}` +
    (initialBalance !== undefined ? `&initial_balance=${initialBalance}` : '');
  const response = await fetch(url);
  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || `Backtest failed with status ${response.status}`);
  }
  return response.json();
}
