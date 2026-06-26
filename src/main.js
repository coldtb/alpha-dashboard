// Antigravity Alpha Dashboard logic
import './style.css';

import { store, loadCustomTrades } from './store/index.js';
import { 
  geckoIdMap, 
  detectAutoDirection, 
  getScannedCoin 
} from './utils/helpers.js';
import { 
  callMcpTool,
  fetchScannerData, 
  initWebSockets, 
  fetchPerformance, 
  runBacktest, 
  fetchBotConfig 
} from './services/api.js';
import {
  initFallingDollars,
  renderPromptsHub,
  filterAndRenderTable,
  openDrawer,
  closeDrawer,
  updatePriceUI,
  renderPodium,
  repopulateSlAndTp,
  saveCustomPlan,
  deleteCustomPlan,
  updateCustomPlansTabCount,
  renderPerformance,
  renderBacktestResults,
  openBacktestLogDrawer,
  updateBotConfigLabels,
  renderTrueNorthIndicator
} from './components/ui.js';

let plannerDebounceTimer = null;

// TrueNorth debounced level calculation coordinator
async function fetchTrueNorthPlannerData(symbol) {
  const geckoId = geckoIdMap[symbol];
  if (!geckoId) return;
  
  const indicator = document.getElementById("symbol-live-indicator");
  if (!indicator) return;
  
  let data = null;
  if (store.mcpCache.technical[symbol]) {
    data = store.mcpCache.technical[symbol];
  } else {
    data = await callMcpTool('technical_analysis', { token_address: geckoId, timeframe: '1h' });
    if (data) {
      store.mcpCache.technical[symbol] = data;
    }
  }
  
  const currentSymbolEl = document.getElementById("plan-symbol");
  if (currentSymbolEl && currentSymbolEl.value.toUpperCase().trim() === symbol) {
    const coin = getScannedCoin(symbol);
    if (data && coin) {
      const autoDir = detectAutoDirection(coin, data);
      renderTrueNorthIndicator(coin, autoDir, true, data);
      repopulateSlAndTp(coin.price, autoDir, data);
    } else {
      const span = indicator.querySelector('.mcp-loader-span');
      if (span) span.remove();
    }
  }
}

// Handle typing in the Planner symbol input field
function handleSymbolInput(e) {
  const symbol = e.target.value.toUpperCase().trim();
  const indicator = document.getElementById("symbol-live-indicator");
  
  if (!symbol) {
    if (indicator) indicator.innerHTML = '<span style="color:var(--color-text-muted); font-size:0.8rem;">Symbol оруулна уу...</span>';
    return;
  }
  
  const coin = getScannedCoin(symbol);
  if (coin) {
    const quickDir = detectAutoDirection(coin);
    renderTrueNorthIndicator(coin, quickDir, false);
    repopulateSlAndTp(coin.price, quickDir);
    
    clearTimeout(plannerDebounceTimer);
    plannerDebounceTimer = setTimeout(() => {
      fetchTrueNorthPlannerData(symbol);
    }, 500);
  } else {
    if (indicator) {
      indicator.innerHTML = '<span style="color:var(--color-text-muted); font-size:0.8rem;">Custom asset — утгуудыг гараар оруулна уу.</span>';
    }
  }
}

// Backtest submit form handler
async function handleBacktestSubmit() {
  const coin = document.getElementById("bt-coin").value;
  const days = document.getElementById("bt-days").value;
  const minScore = document.getElementById("bt-minscore").value;

  const runBtn = document.getElementById("run-backtest-btn");
  const loadingOverlay = document.getElementById("bt-loading");
  const resultsContainer = document.getElementById("bt-results");

  if (runBtn) runBtn.disabled = true;
  if (loadingOverlay) loadingOverlay.style.display = "flex";
  if (resultsContainer) resultsContainer.style.display = "none";

  try {
    const data = await runBacktest(coin, days, minScore);
    store.lastBacktestData = data;
    renderBacktestResults(data);
    
    if (loadingOverlay) loadingOverlay.style.display = "none";
    if (resultsContainer) resultsContainer.style.display = "flex";
  } catch (e) {
    alert("Backtest failed: " + e.message);
    if (loadingOverlay) loadingOverlay.style.display = "none";
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

// Custom trade plan deletion coordinator
function handleDeletePlan(sym) {
  deleteCustomPlan(sym, () => {
    renderPodium(handleDeletePlan, openDrawer);
  });
}

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  initFallingDollars();
  renderPromptsHub();
  
  // Load custom trades from localStorage
  loadCustomTrades();
  updateCustomPlansTabCount();
  
  // Scanners and pollers coordination
  async function updateScanner() {
    await fetchScannerData();
    filterAndRenderTable(openDrawer);
    renderPodium(handleDeletePlan, openDrawer);
  }

  async function updatePerformance() {
    try {
      const data = await fetchPerformance();
      renderPerformance(data);
    } catch (e) {
      console.warn("Could not fetch performance metrics:", e.message);
    }
  }

  updateScanner();
  updatePerformance();
  
  // Set intervals to poll scanner and performance data every 30 seconds
  setInterval(updateScanner, 30000);
  setInterval(updatePerformance, 30000);
  
  // WebSocket streams integration
  initWebSockets(
    updatePriceUI,
    (state) => {
      const statusBadgeSpan = document.querySelector(".status-badge span");
      if (statusBadgeSpan) {
        statusBadgeSpan.textContent = state === "Connected" ? "WebSocket Stream Active" : "Reconnecting WS...";
      }
    }
  );
  
  // Event Listeners for UI
  const scannerSearchInput = document.getElementById("scanner-search");
  if (scannerSearchInput) {
    scannerSearchInput.addEventListener("input", () => filterAndRenderTable(openDrawer));
  }
  
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      filterBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      filterAndRenderTable(openDrawer);
    });
  });
  
  // Tab Event Listeners
  const tabMarket = document.getElementById("tab-market-alpha");
  const tabMyPlans = document.getElementById("tab-my-plans");
  const tabSocial = document.getElementById("tab-social-alpha");
  const tabBacktest = document.getElementById("tab-backtest-strategy");
  
  const podiumGrid = document.getElementById("podium-grid");
  const backtestView = document.getElementById("backtest-view");

  const switchTab = (tab) => {
    store.activeTab = tab;
    
    [tabMarket, tabMyPlans, tabSocial, tabBacktest].forEach(t => {
      if (t) {
        if (t.getAttribute("data-tab") === tab) {
          t.classList.add("active");
        } else {
          t.classList.remove("active");
        }
      }
    });

    if (tab === "backtest") {
      if (podiumGrid) podiumGrid.style.display = "none";
      if (backtestView) backtestView.style.display = "flex";
    } else {
      if (backtestView) backtestView.style.display = "none";
      if (podiumGrid) podiumGrid.style.display = "flex";
      renderPodium(handleDeletePlan, openDrawer);
    }
  };

  if (tabMarket) tabMarket.addEventListener("click", () => switchTab("market"));
  if (tabMyPlans) tabMyPlans.addEventListener("click", () => switchTab("custom"));
  if (tabSocial) tabSocial.addEventListener("click", () => switchTab("social"));
  if (tabBacktest) tabBacktest.addEventListener("click", () => switchTab("backtest"));
  
  // Planner Form Event Listeners
  const planSymbolInput = document.getElementById("plan-symbol");
  if (planSymbolInput) {
    planSymbolInput.addEventListener("input", handleSymbolInput);
  }
  
  const indicator = document.getElementById("symbol-live-indicator");
  if (indicator) {
    indicator.addEventListener("click", (e) => {
      const badge = e.target.closest(".suggest-level-badge");
      if (!badge) return;
      
      const target = badge.getAttribute("data-target");
      const val = badge.getAttribute("data-value");
      
      const el = document.getElementById(`plan-${target}`);
      if (el) {
        el.value = val;
      }
    });
  }
  
  const plannerForm = document.getElementById("planner-form");
  if (plannerForm) {
    plannerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveCustomPlan(() => {
        renderPodium(handleDeletePlan, openDrawer);
        switchTab("custom");
      });
    });
  }

  const backtestForm = document.getElementById("backtest-form");
  if (backtestForm) {
    backtestForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleBacktestSubmit();
    });
  }

  const viewLogBtn = document.getElementById("bt-view-log-btn");
  if (viewLogBtn) {
    viewLogBtn.addEventListener("click", () => {
      if (store.lastBacktestData) {
        openBacktestLogDrawer(
          store.lastBacktestData.trades,
          store.lastBacktestData.coin,
          store.lastBacktestData.days,
          store.lastBacktestData.minScore
        );
      }
    });
  }
  
  const drawerCloseBtn = document.getElementById("drawer-close");
  if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", closeDrawer);
  
  const drawerBackdropEl = document.getElementById("drawer-backdrop");
  if (drawerBackdropEl) drawerBackdropEl.addEventListener("click", closeDrawer);
  
  // Load active config on startup
  async function loadBotConfig() {
    try {
      const cfg = await fetchBotConfig();
      store.activeBotConfig = { ...store.activeBotConfig, ...cfg };
      updateBotConfigLabels(store.activeBotConfig);
    } catch (e) {
      console.warn("Failed to fetch active bot config:", e.message);
    }
  }
  loadBotConfig();
});
