import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Ticker, Position, ClosedTrade, TradePlan, BotConfig, DeepInsights } from '../types';
import { fetchScannerData, fetchHyperliquidHypePrice, initWebSockets, fetchPerformance, fetchBotConfig, fetchDeepInsights as apiFetchDeepInsights } from '../services/api';
import { calculateScore, calculateCustomSetupScore } from '../utils/helpers';

export interface AppState {
  top100Coins: Ticker[];
  watchlistPrices: Record<string, { price: number; change: number; low: number; high: number }>;
  customTrades: TradePlan[];
  activeTab: 'market' | 'custom' | 'social' | 'backtest';
  lastBacktestData: any;
  activeBotConfig: BotConfig | null;
  balance: number;
  equity: number;
  botRealizedPnl: number;
  balanceGrowth: number;
  winRate: number;
  maxDrawdown: number;
  activePositions: Position[];
  closedTrades: ClosedTrade[];
  wsStatus: string;
  selectedCoin: Ticker | null;
  isDrawerOpen: boolean;
  drawerInsights: DeepInsights | null;
  loadingInsights: boolean;
}

interface StoreContextType extends AppState {
  setActiveTab: (tab: 'market' | 'custom' | 'social' | 'backtest') => void;
  setLastBacktestData: (data: any) => void;
  addCustomTrade: (plan: Omit<TradePlan, 'id' | 'score' | 'time'>) => void;
  removeCustomTrade: (id: string) => void;
  setSelectedCoin: (coin: Ticker | null) => void;
  closeDrawer: () => void;
  openDrawer: (coin: Ticker) => void;
  refreshPerformance: () => Promise<void>;
  refreshScanner: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Initial State
  const [top100Coins, setTop100Coins] = useState<Ticker[]>([]);
  const [watchlistPrices, setWatchlistPrices] = useState<Record<string, { price: number; change: number; low: number; high: number }>>({
    "BTC": { price: 0, change: 0, low: 0, high: 0 },
    "ETH": { price: 0, change: 0, low: 0, high: 0 },
    "SOL": { price: 0, change: 0, low: 0, high: 0 },
    "HYPE": { price: 0, change: 0, low: 0, high: 0 },
    "LINK": { price: 0, change: 0, low: 0, high: 0 },
    "XRP": { price: 0, change: 0, low: 0, high: 0 },
    "INJ": { price: 0, change: 0, low: 0, high: 0 },
    "WLD": { price: 0, change: 0, low: 0, high: 0 }
  });

  const [customTrades, setCustomTrades] = useState<TradePlan[]>([]);
  const [activeTab, setActiveTabState] = useState<'market' | 'custom' | 'social' | 'backtest'>('market');
  const [lastBacktestData, setLastBacktestData] = useState<any>(null);
  const [activeBotConfig, setActiveBotConfig] = useState<BotConfig | null>(null);

  // Performance PNL stats
  const [balance, setBalance] = useState(0);
  const [equity, setEquity] = useState(0);
  const [botRealizedPnl, setBotRealizedPnl] = useState(0);
  const [balanceGrowth, setBalanceGrowth] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [maxDrawdown, setMaxDrawdown] = useState(0);
  const [activePositions, setActivePositions] = useState<Position[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);

  const [wsStatus, setWsStatus] = useState('Disconnected');
  const [selectedCoin, setSelectedCoinState] = useState<Ticker | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerInsights, setDrawerInsights] = useState<DeepInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Load custom trades from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('alpha_custom_trades');
    if (saved) {
      try {
        setCustomTrades(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse custom trades:', e);
      }
    }
  }, []);

  // Sync tab status with router or state changes if needed
  const setActiveTab = (tab: 'market' | 'custom' | 'social' | 'backtest') => {
    setActiveTabState(tab);
  };

  // Helper to save custom plans to localstorage
  const persistCustomTrades = (trades: TradePlan[]) => {
    setCustomTrades(trades);
    localStorage.setItem('alpha_custom_trades', JSON.stringify(trades));
  };

  const addCustomTrade = (plan: Omit<TradePlan, 'id' | 'score' | 'time'>) => {
    const scoreObj = calculateCustomSetupScore(plan, top100Coins, watchlistPrices);
    const newPlan: TradePlan = {
      ...plan,
      id: "plan_" + Date.now() + Math.random().toString(36).substring(2, 6),
      score: parseInt(scoreObj.total.toFixed(0)),
      time: Date.now()
    };
    persistCustomTrades([...customTrades, newPlan]);
  };

  const removeCustomTrade = (id: string) => {
    persistCustomTrades(customTrades.filter(t => t.id !== id));
  };

  const setSelectedCoin = (coin: Ticker | null) => {
    setSelectedCoinState(coin);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedCoinState(null);
    setDrawerInsights(null);
  };

  // Fetch TrueNorth deep insights when drawer is opened
  const openDrawer = useCallback(async (coin: Ticker) => {
    setSelectedCoinState(coin);
    setIsDrawerOpen(true);
    setLoadingInsights(true);
    setDrawerInsights(null);

    try {
      const geckoId = coin.symbol.toLowerCase(); // Map base symbol
      const mappedGeckoId = {
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "SOL": "solana",
        "HYPE": "hyperliquid",
        "LINK": "chainlink",
        "XRP": "ripple",
        "INJ": "injective-protocol",
        "WLD": "worldcoin-wld"
      }[coin.symbol] || geckoId;

      const insights = await apiFetchDeepInsights(coin.symbol, mappedGeckoId);
      setDrawerInsights(insights);
    } catch (e) {
      console.error("Failed to load drawer insights:", e);
    } finally {
      setLoadingInsights(false);
    }
  }, []);

  // 2. Fetch PnL Performance
  const refreshPerformance = useCallback(async () => {
    try {
      const data = await fetchPerformance();
      if (data.status === "success") {
        setBalance(data.account.withdrawable);
        setEquity(data.account.totalEquity);
        setBotRealizedPnl(data.botRealizedPnl);
        setBalanceGrowth(data.account.balanceGrowthPct);
        setWinRate(data.winRate);
        setMaxDrawdown(data.account.maxDrawdownPct);
        setActivePositions(data.activePositions || []);
        setClosedTrades(data.recentTrades || []);
      }
    } catch (e) {
      console.warn("Failed to fetch bot performance status:", e);
    }
  }, []);

  // 3. Fetch Top 100 Scanner Data
  const refreshScanner = useCallback(async () => {
    try {
      const rawTickers = await fetchScannerData();
      const hypePrice = await fetchHyperliquidHypePrice();

      // Score and process tickers
      const scored = rawTickers.map((coin, index) => {
        let setup: any = 'Neutral';
        if (Math.abs(coin.change) <= 3.0 && coin.funding < 0) {
          setup = 'Squeeze Setup';
        } else if (Math.abs(coin.change) <= 1.5) {
          setup = 'Consolidating';
        }

        const score = calculateScore(coin, false);

        return {
          ...coin,
          rank: index + 1,
          setup,
          score
        };
      });

      // Integrate HYPE
      if (hypePrice > 0) {
        setWatchlistPrices(prev => ({
          ...prev,
          "HYPE": { ...prev["HYPE"], price: hypePrice }
        }));

        const existingIdx = scored.findIndex(c => c.symbol === "HYPE");
        if (existingIdx !== -1) {
          scored[existingIdx].price = hypePrice;
          scored[existingIdx].high = hypePrice * 1.05;
          scored[existingIdx].low = hypePrice * 0.95;
        } else {
          scored.push({
            rank: 101,
            symbol: "HYPE",
            price: hypePrice,
            change: -2.5, // Mock change for HYPE if missing
            volume: 85000000,
            funding: -0.00013,
            high: hypePrice * 1.05,
            low: hypePrice * 0.95,
            score: 80,
            setup: "Squeeze Setup",
            assetIndex: -1
          });
        }
      }

      scored.sort((a, b) => b.score - a.score || b.volume - a.volume);
      setTop100Coins(scored);
    } catch (e) {
      console.error("Scanner refresh error:", e);
    }
  }, []);

  // 4. Fetch Config & Start Websockets
  useEffect(() => {
    const initData = async () => {
      try {
        const configData = await fetchBotConfig();
        setActiveBotConfig(configData);
      } catch (e) {
        console.warn("Failed to load bot config:", e);
      }

      await refreshScanner();
      await refreshPerformance();
    };

    initData();
  }, [refreshScanner, refreshPerformance]);

  // WebSocket listeners to push real-time price updates into store state
  useEffect(() => {
    const unsub = initWebSockets((symbol, newPrice, change) => {
      // 1. Update watchlist
      setWatchlistPrices(prev => {
        if (!prev[symbol]) return prev;
        return {
          ...prev,
          [symbol]: { ...prev[symbol], price: newPrice, change }
        };
      });

      // 2. Sync to scanner list
      setTop100Coins(prevList => {
        const idx = prevList.findIndex(c => c.symbol === symbol);
        if (idx === -1) return prevList;
        const updated = [...prevList];
        updated[idx] = {
          ...updated[idx],
          price: newPrice,
          change
        };
        return updated;
      });
    }, (state) => {
      setWsStatus(state);
    });

    return () => {
      unsub();
    };
  }, []);

  return (
    <StoreContext.Provider value={{
      top100Coins,
      watchlistPrices,
      customTrades,
      activeTab,
      lastBacktestData,
      activeBotConfig,
      balance,
      equity,
      botRealizedPnl,
      balanceGrowth,
      winRate,
      maxDrawdown,
      activePositions,
      closedTrades,
      wsStatus,
      selectedCoin,
      isDrawerOpen,
      drawerInsights,
      loadingInsights,
      setActiveTab,
      setLastBacktestData,
      addCustomTrade,
      removeCustomTrade,
      setSelectedCoin,
      closeDrawer,
      openDrawer,
      refreshPerformance,
      refreshScanner
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
