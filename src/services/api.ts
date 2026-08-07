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

// Hyperliquid Mainnet 30 Crypto Perps + Builder DEX Watchlist (matches bot active universe)
export const DEFAULT_TRADFI_WATCHLIST: string[] = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT",
  "TON", "TRX", "LTC", "TAO", "SUI", "ARB", "NEAR", "ALGO", "UNI", "AAVE",
  "CRV", "HYPE", "XMR", "ZEC", "ENA", "ZRO", "WLD", "PUMP", "kPEPE",
  "xyz:CL", "xyz:GOLD", "xyz:SILVER", "xyz:SP500", "xyz:NVDA", "xyz:TSLA", "xyz:AAPL"
];


// Module-level cache for 24h change / volume (fetched once per browser session via candleSnapshot)
let _marketExtrasCache: Record<string, { change: number; volume: number; high: number; low: number }> = {};

// Fetch tradfi market data from Hyperliquid builder DEX "xyz" (same universe the bot trades)
export async function fetchMarkets(watchlist: string[] = DEFAULT_TRADFI_WATCHLIST): Promise<Ticker[]> {
  try {
    const symbols = watchlist && watchlist.length ? watchlist : DEFAULT_TRADFI_WATCHLIST;

    // 1. Live mids on default DEX & xyz DEX
    const [resMidsMain, resMidsXyz] = await Promise.all([
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" })
      }).then(r => r.json()).catch(() => ({})),
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids", dex: "xyz" })
      }).then(r => r.json()).catch(() => ({}))
    ]);
    const mids = { ...resMidsMain, ...resMidsXyz };

    // 2. Asset context (funding, etc.) on default DEX & xyz DEX
    const [resCtxMain, resCtxXyz] = await Promise.all([
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs" })
      }).then(r => r.json()).catch(() => [null, []]),
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs", dex: "xyz" })
      }).then(r => r.json()).catch(() => [null, []])
    ]);

    const idxByName: Record<string, number> = {};
    const ctxs: any[] = [];

    if (resCtxMain[0]?.universe) {
      resCtxMain[0].universe.forEach((u: any, i: number) => {
        idxByName[u.name] = i;
        ctxs[i] = resCtxMain[1][i];
      });
    }
    if (resCtxXyz[0]?.universe) {
      const offset = (resCtxMain[0]?.universe || []).length;
      resCtxXyz[0].universe.forEach((u: any, i: number) => {
        const fullIdx = offset + i;
        idxByName[u.name] = fullIdx;
        idxByName[`xyz:${u.name}`] = fullIdx;
        ctxs[fullIdx] = resCtxXyz[1][i];
      });
    }


    // 3. 24h change + volume via daily candles (fetched once per session, then cached)
    if (Object.keys(_marketExtrasCache).length === 0) {
      const now = Date.now();
      const startTime = now - 24 * 60 * 60 * 1000;
      const results = await Promise.all(symbols.map(async (coin) => {
        try {
          const res = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: "1d", startTime, endTime: now } })
          });
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            const first = data[0];
            const last = data[data.length - 1];
            const open = parseFloat(first.o);
            const close = parseFloat(last.c);
            const change = open ? ((close - open) / open) * 100 : 0;
            const volume = data.reduce((s: number, c: any) => s + parseFloat(c.v || 0), 0);
            return [coin, { change, volume, high: parseFloat(last.h), low: parseFloat(last.l) }];
          }
        } catch (e) { /* ignore individual failures */ }
        return [coin, { change: 0, volume: 0, high: 0, low: 0 }];
      }));
      results.forEach(([coin, val]) => { _marketExtrasCache[coin as string] = val as any; });
    }

    const tickers: Ticker[] = symbols.map((coin, index) => {
      const price = parseFloat(mids[coin] || "0");
      const ctxIdx = idxByName[coin];
      const ctx = ctxIdx !== undefined ? ctxs[ctxIdx] : null;
      const funding = ctx && ctx.funding !== undefined ? parseFloat(ctx.funding) : 0;
      const ext = _marketExtrasCache[coin] || { change: 0, volume: 0, high: price * 1.02, low: price * 0.98 };
      return {
        rank: index + 1,
        symbol: coin.replace("xyz:", ""),
        price,
        change: ext.change,
        volume: ext.volume,
        funding,
        high: ext.high || price * 1.02,
        low: ext.low || price * 0.98,
        score: 50,
        assetIndex: ctxIdx !== undefined ? ctxIdx : -1
      };
    });

    return tickers;
  } catch (err) {
    console.error("Error fetching tradfi markets:", err);
    return [];
  }
}

export interface DeepInsights {
  taData: any;
  derivData: any;
  whaleData: any;
  optionsData: any;
}

// Fetch deep insights from TrueNorth MCP (crypto only; tradfi symbols return null)
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

// Fetch historical candles from Hyperliquid builder DEX "xyz"
export async function fetchCandles(coin: string): Promise<any[]> {
  try {
    let hlCoin = coin;
    if (!hlCoin.startsWith("xyz:")) hlCoin = "xyz:" + hlCoin;
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin: hlCoin,
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
