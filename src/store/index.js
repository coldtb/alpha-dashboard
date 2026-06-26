// In-memory state store
export const store = {
  top100Coins: [],
  filteredCoins: [],
  watchlistPrices: {
    "BTC": { price: 0, change: 0, low: 0, high: 0 },
    "ETH": { price: 0, change: 0, low: 0, high: 0 },
    "SOL": { price: 0, change: 0, low: 0, high: 0 },
    "HYPE": { price: 0, change: 0, low: 0, high: 0 },
    "LINK": { price: 0, change: 0, low: 0, high: 0 },
    "XRP": { price: 0, change: 0, low: 0, high: 0 },
    "INJ": { price: 0, change: 0, low: 0, high: 0 },
    "WLD": { price: 0, change: 0, low: 0, high: 0 }
  },
  customTrades: [],
  activeTab: "market", // "market", "custom", "social", or "backtest"
  lastBacktestData: null,
  activeBotConfig: {
    minScore: 90,
    minSlBuffer: 0.010,
    minTpBuffer: 0.050,
    entryShiftThreshold: 0.0075,
    replacementScoreDiff: 5
  },
  mcpCache: {
    technical: {},
    derivatives: {},
    smartMoney: {},
    options: {}
  }
};

// Persistence helpers
export function loadCustomTrades() {
  const saved = localStorage.getItem("alpha_custom_trades");
  if (saved) {
    try {
      store.customTrades = JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse custom trades:", e);
    }
  }
}

export function saveCustomTrades() {
  localStorage.setItem("alpha_custom_trades", JSON.stringify(store.customTrades));
}
