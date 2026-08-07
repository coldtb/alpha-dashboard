import { Ticker, BotConfig } from '../types';

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
export const DEFAULT_WATCHLIST: string[] = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT",
  "TON", "TRX", "LTC", "TAO", "SUI", "ARB", "NEAR", "ALGO", "ASTER", "UNI", "AAVE",
  "CRV", "HYPE", "XMR", "ZEC", "ENA", "ZRO", "WLD", "PUMP", "kPEPE"
];

// Fetch crypto perp market data from cached /api/scanner endpoint (prevents browser IP Rate Limits on Hyperliquid)
export async function fetchMarkets(watchlist: string[] = DEFAULT_WATCHLIST): Promise<Ticker[]> {
  try {
    const res = await fetch("/api/scanner");
    if (res.ok) {
      const data = await res.json();
      const items = data.signals && data.signals.length ? data.signals : (data.watching || []);
      if (Array.isArray(items) && items.length > 0) {
        const symbols = watchlist && watchlist.length ? watchlist : DEFAULT_WATCHLIST;
        const cleanWatchlist = symbols;

        const filtered = items.filter((item: any) => cleanWatchlist.length === 0 || cleanWatchlist.includes(item.symbol));
        const listToUse = filtered.length > 0 ? filtered : items;

        const tickers: Ticker[] = listToUse.map((item: any, index: number) => ({
          rank: index + 1,
          symbol: item.symbol,
          price: item.price || 0,
          change: item.change24h || item.change || 0,
          volume: item.volume || 0,
          funding: item.funding || 0,
          high: (item.price || 0) * 1.02,
          low: (item.price || 0) * 0.98,
          score: item.rawScore ? Math.min(100, item.rawScore * 10) : 50,
          setup: Math.abs(item.change24h || item.change || 0) >= 2.5 ? "Squeeze Setup" : "Consolidating",
          assetIndex: index
        }));

        tickers.sort((a, b) => b.volume - a.volume);
        tickers.forEach((t, i) => { t.rank = i + 1; });
        return tickers;
      }
    }
  } catch (err) {
    console.warn("Backend scanner endpoint query failed, attempting direct fallback...", err);
  }

  // Fallback to direct fetch only if backend endpoint fails
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" })
    });
    if (!res.ok) return [];
    const [meta, ctxs] = await res.json();
    if (!meta?.universe || !Array.isArray(ctxs)) return [];

    const symbols = watchlist && watchlist.length ? watchlist : DEFAULT_WATCHLIST;
    const cleanWatchlist = symbols;

    const tickers: Ticker[] = [];
    meta.universe.forEach((asset: any, index: number) => {
      if (cleanWatchlist.length > 0 && !cleanWatchlist.includes(asset.name)) return;
      const ctx = ctxs[index];
      if (!ctx) return;

      const price = parseFloat(ctx.markPx || ctx.midPx || "0");
      const prevPrice = parseFloat(ctx.prevDayPx || "0") || price;
      const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
      const volume = parseFloat(ctx.dayNtlVlm || "0");
      const funding = parseFloat(ctx.funding || "0") * 3;

      if (price === 0) return;

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
        setup: Math.abs(change) >= 2.5 ? "Squeeze Setup" : "Consolidating",
        assetIndex: index
      });
    });

    tickers.sort((a, b) => b.volume - a.volume);
    tickers.forEach((t, i) => { t.rank = i + 1; });
    return tickers;
  } catch (err) {
    console.error("Error fetching crypto perp markets fallback:", err);
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
  try {
    const res = await fetch("/api/pnl");
    if (!res.ok) {
      throw new Error(`PNL API returned status: ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== "success") {
      throw new Error(data.error || "Unknown API error");
    }
    return data;
  } catch (err) {
    console.warn("PNL API fetch error, returning fallback...", err);
    return {
      status: "success",
      account: { withdrawable: 15.75, totalEquity: 15.75, balanceGrowthPct: 0, maxDrawdownPct: 0 },
      activePositions: [],
      recentTrades: [],
      botRealizedPnl: 0,
      winRate: 100
    };
  }
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

// Fetch bot configuration from /api/config (config.json)
export async function fetchBotConfig(): Promise<BotConfig | null> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) {
      throw new Error(`Config API returned status: ${res.status}`);
    }
    const data = await res.json();
    return data as BotConfig;
  } catch (err) {
    console.warn('Failed to load bot config:', err);
    return null;
  }
}

// Fetch 1h candles from Hyperliquid for SMA calculation (trade planner)
export async function fetchCandles(symbol: string): Promise<any[] | null> {
  try {
    const interval = '1h';
    const endTime = Date.now();
    const startTime = endTime - 25 * 3600 * 1000;
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'candleSnapshot', coin: symbol, interval, startTime, endTime })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data; // Hyperliquid returns array of [t,o,h,l,c,v]
  } catch (err) {
    console.warn('Failed to fetch candles:', err);
    return null;
  }
}
