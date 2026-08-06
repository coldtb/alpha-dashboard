import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Ticker, Position, ClosedTrade, TradePlan, BotConfig, DeepInsights } from '../types';
import { fetchMarkets, DEFAULT_TRADFI_WATCHLIST, fetchPerformance, fetchBotConfig, fetchDeepInsights as apiFetchDeepInsights } from '../services/api';
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
  refreshScanner: (currentConfig?: BotConfig | null) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Initial State
  const [top100Coins, setTop100Coins] = useState<Ticker[]>([]);
  const [watchlistPrices, setWatchlistPrices] = useState<Record<string, { price: number; change: number; low: number; high: number }>>(
    Object.fromEntries(DEFAULT_TRADFI_WATCHLIST.map(s => [s.replace("xyz:", ""), { price: 0, change: 0, low: 0, high: 0 }]))
  );

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

  const [wsStatus, setWsStatus] = useState('Live (xyz DEX)');
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
    const scoreObj = calculateCustomSetupScore(plan, top100Coins, watchlistPrices, activeBotConfig);
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

  // Fetch TrueNorth deep insights when drawer is opened (crypto only; tradfi returns null)
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

  // 3. Fetch Tradfi Scanner Data (Hyperliquid builder DEX "xyz" — same universe the bot trades)
  const refreshScanner = useCallback(async (currentConfig?: BotConfig | null) => {
    try {
      const configToUse = currentConfig !== undefined ? currentConfig : activeBotConfig;
      const watchlist = (configToUse?.watchlist && configToUse.watchlist.length)
        ? configToUse.watchlist
        : DEFAULT_TRADFI_WATCHLIST;

      const rawTickers = await fetchMarkets(watchlist);

      // Score and process tickers
      const scored = rawTickers.map((coin, index) => {
        let setup: any = 'Neutral';
        if (Math.abs(coin.change) <= 3.0 && coin.funding < 0) {
          setup = 'Squeeze Setup';
        } else if (Math.abs(coin.change) <= 1.5) {
          setup = 'Consolidating';
        }

        const score = calculateScore(
          coin,
          false,
          configToUse ? {
            binance: configToUse.binanceVolumeThresholds,
            hyperliquid: configToUse.hyperliquidVolumeThresholds
          } : undefined,
          configToUse?.watchlist,
          configToUse?.watchlistBonus
        );

        return {
          ...coin,
          rank: index + 1,
          setup,
          score
        };
      });

      scored.sort((a, b) => b.score - a.score || b.volume - a.volume);
      setTop100Coins(scored);

      // Sync watchlist prices for the custom trade planner
      const wp: Record<string, { price: number; change: number; low: number; high: number }> = {};
      scored.forEach(c => {
        wp[c.symbol] = { price: c.price, change: c.change, low: c.low, high: c.high };
      });
      setWatchlistPrices(wp);
    } catch (e) {
      console.error("Scanner refresh error:", e);
    }
  }, [activeBotConfig]);

  // 4. Fetch Config & Start polling
  useEffect(() => {
    const initData = async () => {
      let configData: BotConfig | null = null;
      try {
        configData = await fetchBotConfig();
        setActiveBotConfig(configData);
      } catch (e) {
        console.warn("Failed to load bot config:", e);
      }

      await refreshScanner(configData);
      await refreshPerformance();
    };

    initData();
  }, [refreshScanner, refreshPerformance]);

  // Live prices are polled every 30s via refreshScanner (xyz DEX); no separate WebSocket needed.
  useEffect(() => {
    setWsStatus("Live (xyz DEX)");
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
