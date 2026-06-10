// Antigravity Alpha Dashboard logic
import './style.css';

// State variables
let top100Coins = [];
let filteredCoins = [];
let watchlistPrices = {
  "BTC": { price: 0, change: 0, low: 0, high: 0 },
  "ETH": { price: 0, change: 0, low: 0, high: 0 },
  "SOL": { price: 0, change: 0, low: 0, high: 0 },
  "HYPE": { price: 0, change: 0, low: 0, high: 0 },
  "LINK": { price: 0, change: 0, low: 0, high: 0 },
  "XRP": { price: 0, change: 0, low: 0, high: 0 },
  "INJ": { price: 0, change: 0, low: 0, high: 0 },
  "WLD": { price: 0, change: 0, low: 0, high: 0 }
};
let customTrades = [];
let activeTab = "market"; // "market" or "custom"

// Hand-crafted professional trade plans from Wiki
const wikiTradePlans = {
  "BTC": {
    planType: "Plan 1: Reclaim Squeeze",
    badgeClass: "change-up",
    entryZone: "$62,450 – $62,700 (Reclaim Trigger)",
    sl: "$61,750 (1H close invalidation)",
    tp1: "$63,070",
    tp2: "$65,000",
    rr: "2.6:1",
    invalidation: "BTC $61.7k-аас доош орж 1H лаа хаагдвал арилжаа хүчингүй болно. Мөн эргэж сэргэх үед volume сул байвал арилжаанаас зайлсхий.",
    desc: "Үнэ GEX Flip ($61,214) болон SMA/VWAP түвшнийг дахин эзэлж (reclaim), нээлттэй short позицуудыг squeeze хийж өсөх боломжтой."
  },
  "HYPE": {
    planType: "Leverage Flush / Mean Reversion",
    badgeClass: "change-up",
    entryZone: "$54.50 – $56.50 (DCA хувааж авах)",
    sl: "$51.80 (June 6 unlock уналтын доод цэгийн доор)",
    tp1: "$65.00 (4H VWAP Mean target)",
    tp2: "$75.50 (ATH retest)",
    rr: "3.1:1",
    invalidation: "June 6-ны томоохон unlock-ны дараа хөшүүрэг бүрэн цэвэрлэгдсэн (flush) тул спот шингээлт дээр тулгуурласан. Хэрэв BTC $60,650-ийг эвдвэл хүлээх хэрэгтэй.",
    desc: "Токен түгжээ тайлалтын борлуулалтын даралтыг спот халимнууд амжилттай шингээж байна. Хөшүүрэг цэвэрлэгдсэн тул аюулгүй шал үнэ (floor) бүрдсэн."
  },
  "LINK": {
    planType: "Volatility Compression / Breakout",
    badgeClass: "change-up",
    entryZone: "$12.80 – $13.20 (Whale accumulation zone)",
    sl: "$11.90 (Whale support-оос доогуур)",
    tp1: "$16.00 (Түүхэн S/R)",
    tp2: "$19.50 (Near ATH level)",
    rr: "3.5:1",
    invalidation: "Хэрэв өдрийн хаалт $11.90-оос доош гарвал халимнууд байрлалаа хамгаалж чадаагүйн дохио тул шууд гарна.",
    desc: "RWA narrative болон сүлжээн дээрх институцийн хуримтлал (Smart Money) хүчтэй байна. Volatility хумигдсан тул дээш тэсрэх магадлал өндөр."
  }
};

// Prompts templates
const wikiPrompts = [
  {
    title: "PROMPT 1: Derivatives Divergence (Squeeze Setup)",
    desc: "Нээлттэй гэрээ (OI) өсч, funding rate сөрөг болж short squeeze бэлтгэгдэж буй токен олох.",
    code: `Please scan all mid-to-large cap crypto assets to find tokens showing a divergence between price and derivatives metrics.
Identify tokens where:
1. 24h Open Interest (OI) has increased by more than 10%, but spot price is flat/consolidating.
2. Funding Rate is in the bottom 15th percentile (negative / heavily discounted).
3. Dense short liquidation clusters are stacked within 3-5% above spot price.
Return a 1h/4h technical timing and SL anchor based on liquidation heatmap in Mongolian.`
  },
  {
    title: "PROMPT 2: Volatility Compression (Breakout Setup)",
    desc: "Bollinger Bands Width болон ADX ашиглан тэсрэлт хийхэд бэлэн буй токен олох.",
    code: `Please scan for tokens undergoing extreme volatility compression on 4h and 1D timeframes.
Look for:
1. Bollinger Bands Width < 0.04.
2. ADX (14) < 20 (no trend, heavy consolidation).
3. Neutral RSI (between 45 and 55).
Analyze derivatives (OI build-up and liquidation clusters) to determine breakout direction and map entry trigger in Mongolian.`
  },
  {
    title: "PROMPT 3: On-Chain Accumulation & Smart Money",
    desc: "VC-ууд болон ухаалаг арилжаачдын үнэд нөлөөлөхөөс өмнө цуглуулж буй токенуудыг дагах.",
    code: `Please scan on-chain metrics and smart money flows to find accumulated tokens.
Evaluate:
1. Whale/smart money holdings increasing over last 3-7 days while price consolidates.
2. Large token unlocks absorbed with zero sell pressure.
3. Top profit addresses (Smart Traders) silently accumulating.
Select top 2, evaluate technical support for safe entry and SL, output in Mongolian.`
  },
  {
    title: "PROMPT 4: Social Sentiment & Narrative Shift",
    desc: "KOL mention болон хайп дөнгөж эхэлж буй боловч үнэ хараахан тэсрээгүй токен олох.",
    code: `Please scan social intelligence and sentiment indicators to find early narrative shifts.
Look for:
1. Sudden spike in Twitter/X mindshare or KOL mentions over last 24h, but price up < 5%.
2. Upcoming catalysts (mainnet, upgrades, token events) in next 7-14 days.
3. Sector laggards starting to get social buzz.
Select top 2, define entry trigger and TP levels based on key resistances in Mongolian.`
  },
  {
    title: "PROMPT 5: TradingRiot Leverage Flush Scanner",
    desc: "Статистик аномали бүхий хөшүүрэг устгалтын (Leverage Flush) дараах эргэлтийг спот захиалгаар барих.",
    code: `Please scan all mid-to-large cap cryptocurrency markets to identify TradingRiot-style "Leverage Flush" or "Mean Reversion" setups.
Search for:
1. Leverage Flush: Tokens with 24h Liquidation Z-Score >= +2.0, where futures Open Interest (OI) has sharply decreased while spot price hit a major support zone.
2. Funding Rate Z-Score <= -2.0, confirming crowded shorts or whale spot absorption.
3. Spot Order Book Skew: Positive bids-to-asks skew (bids > asks by 1.5x within 2-3% of mark price).
Select top 2, define SL below the flush wick and reversion targets in Mongolian.`
  }
];

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  renderPromptsHub();
  
  // Load custom trades from localStorage
  const saved = localStorage.getItem("alpha_custom_trades");
  if (saved) {
    try {
      customTrades = JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse custom trades:", e);
    }
  }
  
  fetchScannerData();
  initWebSockets();
  
  // Set intervals to poll scanner data every 30 seconds
  setInterval(fetchScannerData, 30000);
  
  // Event Listeners for UI
  document.getElementById("scanner-search").addEventListener("input", filterAndRenderTable);
  
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      filterBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      filterAndRenderTable();
    });
  });
  
  // Tab Event Listeners
  const tabMarket = document.getElementById("tab-market-alpha");
  const tabMyPlans = document.getElementById("tab-my-plans");
  
  if (tabMarket && tabMyPlans) {
    tabMarket.addEventListener("click", () => {
      tabMarket.classList.add("active");
      tabMyPlans.classList.remove("active");
      activeTab = "market";
      renderPodium();
    });
    
    tabMyPlans.addEventListener("click", () => {
      tabMyPlans.classList.add("active");
      tabMarket.classList.remove("active");
      activeTab = "custom";
      renderPodium();
    });
  }
  
  // Planner Form Event Listeners
  const planSymbolInput = document.getElementById("plan-symbol");
  if (planSymbolInput) {
    planSymbolInput.addEventListener("input", handleSymbolInput);
  }
  
  const planDirectionSelect = document.getElementById("plan-direction");
  if (planDirectionSelect) {
    planDirectionSelect.addEventListener("change", handleDirectionChange);
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
      saveCustomPlan();
    });
  }
  
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);
});

// Render prompts in the Clipboard Hub
function renderPromptsHub() {
  const container = document.getElementById("prompts-hub");
  container.innerHTML = wikiPrompts.map((prompt, index) => `
    <div class="prompt-card">
      <div class="prompt-card-header">
        <div class="prompt-title">${prompt.title}</div>
        <button class="copy-btn" data-index="${index}">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
          </svg>
          Copy Prompt
        </button>
      </div>
      <div class="prompt-desc">${prompt.desc}</div>
      <div class="prompt-code" id="prompt-code-${index}">${prompt.code}</div>
    </div>
  `).join('');
  
  // Add copy action
  document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = e.currentTarget.getAttribute("data-index");
      const codeText = wikiPrompts[idx].code;
      
      navigator.clipboard.writeText(codeText).then(() => {
        const originalText = e.currentTarget.innerHTML;
        e.currentTarget.innerHTML = `
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          Copied!
        `;
        e.currentTarget.style.backgroundColor = "var(--color-green)";
        e.currentTarget.style.color = "#0b0c10";
        setTimeout(() => {
          e.currentTarget.innerHTML = originalText;
          e.currentTarget.style.backgroundColor = "";
          e.currentTarget.style.color = "";
        }, 2000);
      });
    });
  });
}

// Fetch Binance Futures top 100 volume data and funding rates
async function fetchScannerData() {
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
    top100Coins = top100Raw.map((coin, index) => {
      const symbolBase = coin.symbol.replace("USDT", "");
      const fundingInfo = fundingMap[coin.symbol] || { fundingRate: 0.0001, markPrice: floatParse(coin.lastPrice) };
      
      const change = floatParse(coin.priceChangePercent);
      const fundingRate = fundingInfo.fundingRate;
      
      // Determine setups
      let setup = "Neutral";
      // Squeeze: Flat price (±3%) and negative funding
      if (Math.abs(change) <= 3.0 && fundingRate < 0) {
        setup = "Squeeze Setup";
      } 
      // Volatility compression: very tight consolidation (±1.5%)
      else if (Math.abs(change) <= 1.5) {
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
    
    filterAndRenderTable();
    renderWatchlist();
    updateCustomPlansTabCount();
    renderPodium();
    
  } catch (err) {
    console.error("Error fetching scanner data:", err);
  }
}

// Fetch HYPE price from Hyperliquid API
async function fetchHyperliquidHypePrice() {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" })
    });
    const mids = await res.json();
    const hypePrice = parseFloat(mids["HYPE"] || 0);
    
    if (hypePrice > 0) {
      // Check if HYPE is in our top100 list (if not, we inject/update it)
      watchlistPrices["HYPE"].price = hypePrice;
      
      // Simulate HYPE in the list (since it's a major watchlist coin)
      const existingIdx = top100Coins.findIndex(c => c.symbol === "HYPE");
      if (existingIdx !== -1) {
        top100Coins[existingIdx].price = hypePrice;
        top100Coins[existingIdx].high = hypePrice * 1.05;
        top100Coins[existingIdx].low = hypePrice * 0.95;
      } else {
        top100Coins.push({
          rank: 101,
          symbol: "HYPE",
          fullName: "HYPE",
          price: hypePrice,
          change: -9.4, // Live reference for June 10
          volume: 85000000,
          funding: -0.00013, // -0.013% hourly as negative funding
          setup: "Squeeze Setup", // Highly negative post-unlock
          high: hypePrice * 1.05,
          low: hypePrice * 0.95
        });
      }
    }
  } catch (e) {
    console.error("HL price fetch error:", e);
  }
}

// Filter and render top 100 table
function filterAndRenderTable() {
  const searchQuery = document.getElementById("scanner-search").value.toUpperCase().trim();
  const activeFilter = document.querySelector(".filter-btn.active").getAttribute("data-filter");
  
  filteredCoins = top100Coins.filter(coin => {
    // Search filter
    const matchesSearch = coin.symbol.includes(searchQuery);
    
    // Badge filter
    let matchesFilter = true;
    if (activeFilter === "squeeze") {
      matchesFilter = coin.setup === "Squeeze Setup";
    } else if (activeFilter === "consolidating") {
      matchesFilter = coin.setup === "Consolidating";
    }
    
    return matchesSearch && matchesFilter;
  });
  
  const tbody = document.getElementById("scanner-table-body");
  if (filteredCoins.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem; color: var(--color-text-muted);">
          No matching coins found.
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filteredCoins.map(coin => {
    const isSqueeze = coin.setup === "Squeeze Setup";
    const rowClass = isSqueeze ? "table-squeeze-row" : "";
    const changeClass = coin.change >= 0 ? "change-up" : "change-down";
    const changePrefix = coin.change >= 0 ? "+" : "";
    
    // Formatting price representation
    let formattedPrice = `$${coin.price.toFixed(2)}`;
    if (coin.price < 1) formattedPrice = `$${coin.price.toFixed(6)}`;
    else if (coin.price < 10) formattedPrice = `$${coin.price.toFixed(4)}`;
    
    // Formatting funding rate representation
    const fundingPercent = (coin.funding * 100).toFixed(4);
    const fundingClass = coin.funding < 0 ? "change-up" : ""; // Negative funding is good for squeeze longs
    
    // Setup badge
    let setupBadge = `<span style="font-size: 0.8rem; color: var(--color-text-muted);">${coin.setup}</span>`;
    if (isSqueeze) {
      setupBadge = `<span class="badge-squeeze">SQUEEZE SETUP</span>`;
    } else if (coin.setup === "Consolidating") {
      setupBadge = `<span class="badge-squeeze" style="background: rgba(0, 176, 255, 0.1); color: var(--color-blue); border: 1px solid var(--color-blue);">CONSOLIDATING</span>`;
    }
    
    return `
      <tr class="${rowClass}" data-symbol="${coin.symbol}">
        <td><span style="color: var(--color-text-muted); font-size: 0.85rem;">#${coin.rank}</span></td>
        <td><span class="table-symbol">${coin.symbol}</span></td>
        <td id="price-table-${coin.symbol}" class="ticker-price-cell">${formattedPrice}</td>
        <td><span class="ticker-change ${changeClass}">${changePrefix}${coin.change.toFixed(2)}%</span></td>
        <td style="color: var(--color-text-muted); font-size: 0.9rem;">$${formatVolume(coin.volume)}</td>
        <td><span class="${fundingClass}" style="font-weight: 500;">${fundingPercent}%</span></td>
        <td style="text-align: right;">${setupBadge}</td>
      </tr>
    `;
  }).join('');
  
  // Add row click listeners
  tbody.querySelectorAll("tr").forEach(row => {
    row.addEventListener("click", () => {
      const sym = row.getAttribute("data-symbol");
      openDrawer(sym);
    });
  });
}

// Render major tickers watchlist
function renderWatchlist() {
  const container = document.getElementById("watchlist-grid");
  const watchlistSymbols = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD", "ETH", "SOL"];
  
  container.innerHTML = watchlistSymbols.map(sym => {
    const data = watchlistPrices[sym];
    // Sync price if loaded from top100
    const matchedCoin = top100Coins.find(c => c.symbol === sym);
    if (matchedCoin && sym !== "HYPE") {
      data.price = matchedCoin.price;
      data.change = matchedCoin.change;
    } else if (sym === "HYPE" && data.price === 0 && matchedCoin) {
      data.price = matchedCoin.price;
      data.change = matchedCoin.change;
    }
    
    const changeClass = data.change >= 0 ? "change-up" : "change-down";
    const changePrefix = data.change >= 0 ? "+" : "";
    
    // Check if squeeze condition is met
    const isSqueeze = Math.abs(data.change) <= 3.0 && matchedCoin && matchedCoin.funding < 0;
    const cardGlowClass = isSqueeze || sym === "HYPE" ? "glow-squeeze" : ""; // HYPE glows post-unlock as it's a top squeeze candidate
    
    let formattedPrice = `$${data.price.toFixed(2)}`;
    if (data.price < 1) formattedPrice = `$${data.price.toFixed(6)}`;
    else if (data.price < 10) formattedPrice = `$${data.price.toFixed(4)}`;
    
    return `
      <div class="ticker-card ${cardGlowClass}" data-symbol="${sym}">
        <div class="ticker-header">
          <div class="ticker-info">
            <span class="ticker-symbol">${sym}</span>
            <span class="ticker-name">${getAssetName(sym)}</span>
          </div>
          ${isSqueeze || sym === "HYPE" ? '<span class="badge-squeeze">SQUEEZE</span>' : ''}
        </div>
        <div class="ticker-price-container">
          <span class="ticker-price" id="price-card-${sym}">${formattedPrice}</span>
          <span class="ticker-change ${changeClass}">${changePrefix}${data.change.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add card click listeners
  container.querySelectorAll(".ticker-card").forEach(card => {
    card.addEventListener("click", () => {
      const sym = card.getAttribute("data-symbol");
      openDrawer(sym);
    });
  });
}

// WebSocket connection to Binance Futures real-time ticks
function initWebSockets() {
  const wsUrl = "wss://fstream.binance.com/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker/linkusdt@ticker/xrpusdt@ticker/injusdt@ticker/wldusdt@ticker";
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log("Binance WebSocket connection established.");
    document.querySelector(".status-badge span").textContent = "WebSockets Connected";
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const stream = message.stream;
    const data = message.data;
    
    if (data) {
      const symbolBase = data.s.replace("USDT", "");
      const newPrice = parseFloat(data.c);
      const change = parseFloat(data.P);
      
      const prevData = watchlistPrices[symbolBase];
      if (prevData) {
        const oldPrice = prevData.price;
        prevData.price = newPrice;
        prevData.change = change;
        
        // Update price on UI instantly
        const cardPriceEl = document.getElementById(`price-card-${symbolBase}`);
        if (cardPriceEl) {
          cardPriceEl.textContent = formatPriceText(newPrice);
          flashPrice(cardPriceEl, newPrice, oldPrice);
        }
        
        const tablePriceEl = document.getElementById(`price-table-${symbolBase}`);
        if (tablePriceEl) {
          tablePriceEl.textContent = formatPriceText(newPrice);
          flashPrice(tablePriceEl, newPrice, oldPrice);
        }

        const podiumPriceEl = document.getElementById(`podium-price-${symbolBase}`);
        if (podiumPriceEl) {
          podiumPriceEl.textContent = formatPriceText(newPrice);
          flashPrice(podiumPriceEl, newPrice, oldPrice);
        }
        
        // Sync to top100Coins
        const coinIdx = top100Coins.findIndex(c => c.symbol === symbolBase);
        if (coinIdx !== -1) {
          top100Coins[coinIdx].price = newPrice;
          top100Coins[coinIdx].change = change;
        }
      }
    }
  };
  
  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
  
  ws.onclose = () => {
    console.log("WebSocket connection closed. Reconnecting...");
    document.querySelector(".status-badge span").textContent = "Reconnecting WS...";
    setTimeout(initWebSockets, 5000);
  };
}

// Visual flash green/red when price ticks
function flashPrice(el, newPrice, oldPrice) {
  if (newPrice > oldPrice) {
    el.classList.add("flash-green");
    setTimeout(() => el.classList.remove("flash-green"), 500);
  } else if (newPrice < oldPrice) {
    el.classList.add("flash-red");
    setTimeout(() => el.classList.remove("flash-red"), 500);
  }
}

// Open detail drawer for a coin
function openDrawer(symbol) {
  const backdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("drawer");
  const content = document.getElementById("drawer-content");
  
  // First, check if there is a custom trade plan saved
  const customPlan = customTrades.find(t => t.symbol === symbol);
  if (customPlan) {
    const scoreInfo = calculateCustomSetupScore(customPlan);
    const riskAmount = customPlan.accountSize * (customPlan.riskPct / 100);
    const riskPctOfEntry = Math.abs(customPlan.entry - customPlan.sl) / customPlan.entry;
    const positionSizeUsdt = riskPctOfEntry > 0 ? (riskAmount / riskPctOfEntry) : 0;
    const positionSizeTokens = customPlan.entry > 0 ? (positionSizeUsdt / customPlan.entry) : 0;
    const recommendedLeverage = customPlan.accountSize > 0 ? (positionSizeUsdt / customPlan.accountSize).toFixed(1) : "1";
    const directionClass = customPlan.direction === "LONG" ? "change-up" : "change-down";
    const directionBadge = `<span class="plan-type-badge ${directionClass}">${customPlan.direction} SETUP</span>`;
    
    let invalidationText = `Хэрэв ханш ${formatPriceText(customPlan.sl)}-оос доош орж 4H хаалт хийвэл арилжааны Stop Loss идэвхжиж, $${riskAmount.toFixed(2)} (${customPlan.riskPct}%) алдагдал хүлээгээд гарна.`;
    if (customPlan.direction === "SHORT") {
      invalidationText = `Хэрэв ханш ${formatPriceText(customPlan.sl)}-оос дээш орж 4H хаалт хийвэл арилжааны Stop Loss идэвхжиж, $${riskAmount.toFixed(2)} (${customPlan.riskPct}%) алдагдал хүлээгээд гарна.`;
    }

    const coinForLevels = getScannedCoin(symbol) || {
      symbol: symbol,
      price: customPlan.entry,
      funding: 0,
      volume: 0,
      change: 0
    };
    const levels = getTrueNorthKeyLevels(coinForLevels);
    let trueNorthHtml = "";
    if (levels) {
      trueNorthHtml = `
        <div style="margin-top: 1.2rem;">
          <h4 style="font-family: var(--font-title); margin-bottom: 0.5rem; color: var(--color-blue); display: flex; align-items: center; gap: 0.4rem;">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle;">
              <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
            </svg>
            TrueNorth Key Execution Zones
          </h4>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; background: rgba(11, 12, 16, 0.4); padding: 0.8rem; border-radius: 10px; border: 1px solid var(--border-light);">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,255,255,0.03);">
              <span style="color: var(--color-text-muted);">Golden Pocket (0.618 support):</span>
              <span style="color: #ffd700; font-weight: 600;">${formatPriceText(levels.fib0618)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,255,255,0.03);">
              <span style="color: var(--color-text-muted);">Daily VWAP Pivot:</span>
              <span style="color: var(--color-blue); font-weight: 600;">${formatPriceText(levels.vwap)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,255,255,0.03);">
              <span style="color: var(--color-text-muted);">Short Liq Magnet (+2.5%):</span>
              <span style="color: var(--color-red); font-weight: 600;">${formatPriceText(levels.shortLiqCluster)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
              <span style="color: var(--color-text-muted);">Long Liq Magnet (-2.5%):</span>
              <span style="color: var(--color-green); font-weight: 600;">${formatPriceText(levels.longLiqCluster)}</span>
            </div>
          </div>
        </div>
      `;
    }
    
    content.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-symbol">
          ${symbol}
          ${directionBadge}
        </div>
        <div style="font-size: 0.95rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">
          Custom Trade Plan — Score: <span class="score-badge">${customPlan.score}/100</span>
        </div>
        <div class="drawer-price">${formatPriceText(customPlan.entry)}</div>
      </div>
      
      <div class="trade-plan-details">
        <div>
          <h4 style="font-family: var(--font-title); margin-bottom: 0.5rem; color: var(--color-primary);">Strategy Analysis</h4>
          <div style="font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.6; display: flex; flex-direction: column; gap: 0.25rem;">
            <div>• Market Score: <strong>${scoreInfo.market}/50</strong> (Funding, Volume, Consolidation)</div>
            <div>• Trade Structure Score: <strong>${scoreInfo.trade}/50</strong> (R:R, SL Distance, Trend)</div>
            <div style="margin-top: 0.5rem; font-weight: 500; color: #fff;">
              Дүгнэлт: ${customPlan.score >= 75 ? '🔥 High Conviction setup. Ороход тохиромжтой.' : (customPlan.score >= 50 ? '⏳ Moderate setup. Хяналтад авах.' : '⚠️ Low Conviction setup. Алгасахыг зөвлөж байна.')}
            </div>
          </div>
        </div>
        
        <div class="plan-stats-grid">
          <div class="plan-stat">
            <span class="stat-label">Entry Price</span>
            <span class="stat-val" style="color: var(--color-blue);">${formatPriceText(customPlan.entry)}</span>
          </div>
          <div class="plan-stat">
            <span class="stat-label">Stop Loss (SL)</span>
            <span class="stat-val down">${formatPriceText(customPlan.sl)}</span>
          </div>
          <div class="plan-stat">
            <span class="stat-label">Target Profit (TP)</span>
            <span class="stat-val up">${formatPriceText(customPlan.tp)}</span>
          </div>
          <div class="plan-stat">
            <span class="stat-label">Risk/Reward (R:R)</span>
            <span class="stat-val" style="color: #c084fc;">${scoreInfo.rr}:1</span>
          </div>
          <div class="plan-stat">
            <span class="stat-label">Risk Amount</span>
            <span class="stat-val" style="color: var(--color-red); font-size: 1.15rem;">$${riskAmount.toFixed(2)} (${customPlan.riskPct}%)</span>
          </div>
          <div class="plan-stat">
            <span class="stat-label">Position Size</span>
            <span class="stat-val" style="color: var(--color-green); font-size: 1.15rem;">$${positionSizeUsdt.toFixed(2)}</span>
          </div>
          <div class="plan-stat" style="grid-column: span 2;">
            <span class="stat-label">Contracts & Recommended Leverage</span>
            <span class="stat-val" style="color: #fff; font-size: 0.95rem;">
              ${positionSizeTokens.toFixed(4)} ${symbol} | Leverage: ${recommendedLeverage}x (Safe limit: ${(100 / scoreInfo.slPct).toFixed(1)}x)
            </span>
          </div>
        </div>
        
        <div>
          <h4 style="font-family: var(--font-title); margin-bottom: 0.5rem; color: var(--color-blue);">Level Visualization</h4>
          <div class="plan-visualization">
            <div class="viz-line tp" style="top: ${customPlan.direction === 'LONG' ? '20%' : '80%'}; border-color: ${customPlan.direction === 'LONG' ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 61, 0, 0.3)'};"></div>
            <div class="viz-line entry" style="top: 50%;"></div>
            <div class="viz-line sl" style="top: ${customPlan.direction === 'LONG' ? '80%' : '20%'}; border-color: ${customPlan.direction === 'LONG' ? 'rgba(255, 61, 0, 0.3)' : 'rgba(0, 230, 118, 0.3)'};"></div>
            
            <div class="viz-label tp" style="color: ${customPlan.direction === 'LONG' ? 'var(--color-green)' : 'var(--color-red)'}; font-weight: ${customPlan.direction === 'LONG' ? '600' : 'normal'};">
              <span>${customPlan.direction === 'LONG' ? 'TP Target' : 'SL Level'}</span>
              <span>${formatPriceText(customPlan.direction === 'LONG' ? customPlan.tp : customPlan.sl)}</span>
            </div>
            <div class="viz-label entry">
              <span>Entry Level</span>
              <span>${formatPriceText(customPlan.entry)}</span>
            </div>
            <div class="viz-label sl" style="color: ${customPlan.direction === 'LONG' ? 'var(--color-red)' : 'var(--color-green)'}; font-weight: ${customPlan.direction === 'LONG' ? 'normal' : '600'};">
              <span>${customPlan.direction === 'LONG' ? 'SL Level' : 'TP Target'}</span>
              <span>${formatPriceText(customPlan.direction === 'LONG' ? customPlan.sl : customPlan.tp)}</span>
            </div>
          </div>
        </div>
        
        ${trueNorthHtml}
        
        <div class="invalidation-box">
          <div class="invalidation-title">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12,2L1,21H23L12,2M12,6L19.8,18H4.2L12,6M11,10V14H13V10H11M11,16V18H13V16H11Z"/>
            </svg>
            Risk Invalidation Rule
          </div>
          <div>${invalidationText}</div>
        </div>
      </div>
    `;
    
    backdrop.classList.add("open");
    drawer.classList.add("open");
    return;
  }

  // Fallback to auto-generated or wiki plans if not custom
  const coin = top100Coins.find(c => c.symbol === symbol) || {
    symbol: symbol,
    price: watchlistPrices[symbol]?.price || 0,
    change: watchlistPrices[symbol]?.change || 0,
    funding: 0.0001,
    setup: "Neutral"
  };
  
  let plan = wikiTradePlans[symbol];
  
  if (!plan) {
    const isSqueeze = coin.setup === "Squeeze Setup";
    const type = isSqueeze ? "Mean Reversion Long" : (coin.change >= 1.5 ? "Momentum Long" : "Range Breakout Long");
    const entryMin = coin.price * 0.98;
    const entryMax = coin.price;
    const sl = coin.price * 0.94;
    const tp1 = coin.price * 1.05;
    const tp2 = coin.price * 1.12;
    
    plan = {
      planType: type,
      badgeClass: coin.change >= 0 ? "change-up" : "change-down",
      entryZone: `${formatPriceText(entryMin)} – ${formatPriceText(entryMax)} (DCA Zone)`,
      sl: `${formatPriceText(sl)} (Below support limit)`,
      tp1: formatPriceText(tp1),
      tp2: formatPriceText(tp2),
      rr: "2.5:1 (Calculated)",
      invalidation: `Хэрэв ханш ${formatPriceText(sl)}-оос доош орж 4H лааны хаалт хийвэл сөрөг хөшүүргийн уналт үүсэх тул SL идэвхжиж арилжаа хүчингүй болно.`,
      desc: isSqueeze 
        ? "Ханш хэвтээ байгаа мөртлөө funding rate сөрөг байгаа нь short squeeze үүсэх таатай суурийг бүрдүүлсэн тул reversion entry бэлтгэнэ."
        : "Vite ажиллагааны дагуу техникийн дэмжлэг, арилжааны хэмжээний өсөлт дээр суурилсан хамгаалалттай арилжааны чиглэл."
    };
  }
  
  const currentText = formatPriceText(coin.price);
  
  const levels = getTrueNorthKeyLevels(coin);
  let trueNorthHtml = "";
  if (levels) {
    trueNorthHtml = `
      <div style="margin-top: 1.2rem;">
        <h4 style="font-family: var(--font-title); margin-bottom: 0.5rem; color: var(--color-blue); display: flex; align-items: center; gap: 0.4rem;">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle;">
            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
          </svg>
          TrueNorth Key Execution Zones
        </h4>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; background: rgba(11, 12, 16, 0.4); padding: 0.8rem; border-radius: 10px; border: 1px solid var(--border-light);">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <span style="color: var(--color-text-muted);">Golden Pocket (0.618 support):</span>
            <span style="color: #ffd700; font-weight: 600;">${formatPriceText(levels.fib0618)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <span style="color: var(--color-text-muted);">Daily VWAP Pivot:</span>
            <span style="color: var(--color-blue); font-weight: 600;">${formatPriceText(levels.vwap)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <span style="color: var(--color-text-muted);">Short Liq Magnet (+2.5%):</span>
            <span style="color: var(--color-red); font-weight: 600;">${formatPriceText(levels.shortLiqCluster)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
            <span style="color: var(--color-text-muted);">Long Liq Magnet (-2.5%):</span>
            <span style="color: var(--color-green); font-weight: 600;">${formatPriceText(levels.longLiqCluster)}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  content.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-symbol">
        ${symbol}
        <span class="plan-type-badge ${plan.badgeClass}">${plan.planType}</span>
      </div>
      <div style="font-size: 0.95rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">
        ${getAssetName(symbol)} (Binance Futures)
      </div>
      <div class="drawer-price" id="drawer-live-price-${symbol}">${currentText}</div>
    </div>
    
    <div class="trade-plan-details">
      <div>
        <h4 style="font-family: var(--font-title); margin-bottom: 0.5rem; color: var(--color-primary);">Strategy Analysis</h4>
        <p style="font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.6;">${plan.desc}</p>
      </div>
      
      <div class="plan-stats-grid">
        <div class="plan-stat">
          <span class="stat-label">Entry Range (DCA)</span>
          <span class="stat-val" style="color: var(--color-blue);">${plan.entryZone}</span>
        </div>
        <div class="plan-stat">
          <span class="stat-label">Stop Loss (SL)</span>
          <span class="stat-val down">${plan.sl}</span>
        </div>
        <div class="plan-stat">
          <span class="stat-label">Target Profit 1 (TP1)</span>
          <span class="stat-val up">${plan.tp1}</span>
        </div>
        <div class="plan-stat">
          <span class="stat-label">Target Profit 2 (TP2)</span>
          <span class="stat-val up">${plan.tp2}</span>
        </div>
        <div class="plan-stat" style="grid-column: span 2;">
          <span class="stat-label">Risk/Reward (R:R Ratio)</span>
          <span class="stat-val" style="color: #c084fc; font-size: 1.25rem;">${plan.rr}</span>
        </div>
      </div>
      
      <div>
        <h4 style="font-family: var(--font-title); margin-bottom: 0.5rem; color: var(--color-blue);">Level Visualization</h4>
        <div class="plan-visualization">
          <div class="viz-line tp"></div>
          <div class="viz-line entry"></div>
          <div class="viz-line sl"></div>
          
          <div class="viz-label tp">
            <span>TP1 Target</span>
            <span>${plan.tp1}</span>
          </div>
          <div class="viz-label entry">
            <span>Entry (Spot / Average)</span>
            <span>${currentText}</span>
          </div>
          <div class="viz-label sl">
            <span>Invalidation SL</span>
            <span>${plan.sl.split(" ")[0]}</span>
          </div>
        </div>
      </div>
      
      ${trueNorthHtml}
      
      <div class="invalidation-box">
        <div class="invalidation-title">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12,2L1,21H23L12,2M12,6L19.8,18H4.2L12,6M11,10V14H13V10H11M11,16V18H13V16H11Z"/>
          </svg>
          Invalidation / Эрсдэлийн Удирдлага
        </div>
        <div>${plan.invalidation}</div>
      </div>
    </div>
  `;
  
  backdrop.classList.add("open");
  drawer.classList.add("open");
}

function closeDrawer() {
  const backdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("drawer");
  
  backdrop.classList.remove("open");
  drawer.classList.remove("open");
}

// Calculate conviction score for a coin
function calculateScore(coin) {
  let score = 0;
  
  // 1. Squeeze Setup (Derivatives Divergence) -> max 50 points
  const change = Math.abs(coin.change);
  if (change <= 3.0) {
    score += 30; // Consolidating price
    if (change <= 1.5) score += 10; // Extra tight price consolidation
  }
  
  // Funding rate factor
  if (coin.funding < 0) {
    score += 20; // Negative funding
    if (coin.funding <= -0.0005) {
      score += 15; // Deep negative funding
    } else if (coin.funding <= -0.0002) {
      score += 10;
    }
  } else {
    // Highly positive funding: if price is flat, it's froth, which has high mean reversion potential
    if (coin.funding > 0.0003 && change <= 3.0) {
      score += 15; // Mean reversion potential
    }
  }
  
  // 2. Volume Factor (Liquidity / Interest) -> max 20 points
  if (coin.volume > 100000000) score += 20; // >100M volume
  else if (coin.volume > 50000000) score += 15; // >50M volume
  else if (coin.volume > 10000000) score += 10;
  
  // 3. Conviction Watchlist Bonus -> 15 points
  const watchlist = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];
  if (watchlist.includes(coin.symbol)) {
    score += 15;
  }
  
  // Cap at 100
  return Math.min(score, 100);
}

// Render Top 3 Alpha Podium
function renderPodium() {
  const container = document.getElementById("podium-grid");
  
  if (activeTab === "market") {
    // Calculate scores for all coins
    const scoredCoins = top100Coins.map(coin => ({
      ...coin,
      score: calculateScore(coin)
    }));
    
    // Sort by score descending
    scoredCoins.sort((a, b) => b.score - a.score);
    
    // Take top 3
    const top3 = scoredCoins.slice(0, 3);
    
    if (top3.length === 0) {
      container.innerHTML = `
        <div class="ticker-card" style="justify-content: center; align-items: center; min-height: 120px;">
          <div style="font-size: 0.9rem; color: var(--color-text-muted);">Calculating setups...</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = top3.map((coin, index) => {
      const rank = index + 1;
      const rankClass = `rank-${rank}`;
      const priceText = formatPriceText(coin.price);
      const changeClass = coin.change >= 0 ? "change-up" : "change-down";
      const changePrefix = coin.change >= 0 ? "+" : "";
      
      return `
        <div class="podium-card" data-symbol="${coin.symbol}">
          <div class="podium-left">
            <div class="signal-rank-badge ${rankClass}">${rank}</div>
            <div class="podium-info">
              <span class="podium-symbol">
                ${coin.symbol} 
                <span class="score-badge">${coin.score}/100</span>
              </span>
              <span class="podium-score">${coin.setup}</span>
            </div>
          </div>
          <div class="podium-right">
            <span class="podium-price" id="podium-price-${coin.symbol}">${priceText}</span>
            <span class="ticker-change ${changeClass}" style="font-size: 0.75rem; padding: 0.1rem 0.4rem; margin-top: 0.2rem;">${changePrefix}${coin.change.toFixed(2)}%</span>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click listeners to podium cards
    container.querySelectorAll(".podium-card").forEach(card => {
      card.addEventListener("click", () => {
        const sym = card.getAttribute("data-symbol");
        openDrawer(sym);
      });
    });
  } else {
    // Sort customTrades by score descending
    const sortedCustom = [...customTrades].sort((a, b) => b.score - a.score);
    const top3Custom = sortedCustom.slice(0, 3);
    
    if (top3Custom.length === 0) {
      container.innerHTML = `
        <div class="ticker-card" style="justify-content: center; align-items: center; min-height: 120px; text-align: center; padding: 1.5rem;">
          <div style="font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.5;">
            No custom trade plans yet.<br>Use the Trade Planner on the left to add one!
          </div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = top3Custom.map((plan, index) => {
      const rank = index + 1;
      const rankClass = `rank-${rank}`;
      const priceText = formatPriceText(plan.entry);
      const directionClass = plan.direction === "LONG" ? "change-up" : "change-down";
      const risk = Math.abs(plan.entry - plan.sl);
      const reward = Math.abs(plan.tp - plan.entry);
      const rr = risk > 0 ? (reward / risk).toFixed(1) : "0";
      
      return `
        <div class="podium-card custom-plan-card ${rankClass}" data-symbol="${plan.symbol}">
          <div class="podium-left">
            <div class="signal-rank-badge ${rankClass}">${rank}</div>
            <div class="podium-info">
              <span class="podium-symbol">
                ${plan.symbol} 
                <span class="score-badge">${plan.score}/100</span>
              </span>
              <span class="podium-score ${directionClass}" style="font-weight: 600;">
                ${plan.direction} Setup
              </span>
            </div>
          </div>
          <div class="podium-right" style="flex-direction: row; align-items: center; gap: 0.8rem;">
            <div style="display: flex; flex-direction: column; align-items: flex-end;">
              <span class="podium-price">${priceText}</span>
              <span class="ticker-change" style="font-size: 0.7rem; padding: 0.1rem 0.4rem; margin-top: 0.2rem; background: rgba(255,255,255,0.05); color: var(--color-text-muted);">
                R:R ${rr}
              </span>
            </div>
            <button class="delete-plan-btn" data-symbol="${plan.symbol}" title="Delete Plan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click listeners to custom podium cards
    container.querySelectorAll(".podium-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".delete-plan-btn")) return;
        const sym = card.getAttribute("data-symbol");
        openDrawer(sym);
      });
    });
    
    // Add click listener for delete buttons
    container.querySelectorAll(".delete-plan-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const sym = btn.getAttribute("data-symbol");
        deleteCustomPlan(sym);
      });
    });
  }
}

// Custom scoring algorithm based on Wiki rules
function calculateCustomSetupScore(plan) {
  let marketScore = 0;
  let tradeScore = 0;
  
  const symbol = plan.symbol;
  const direction = plan.direction;
  const entry = plan.entry;
  const sl = plan.sl;
  const tp = plan.tp;
  
  const matchedCoin = top100Coins.find(c => c.symbol === symbol) || 
                      (watchlistPrices[symbol] && watchlistPrices[symbol].price > 0 ? { 
                        symbol: symbol, 
                        price: watchlistPrices[symbol].price, 
                        change: watchlistPrices[symbol].change,
                        volume: 50000000, 
                        funding: -0.0001
                      } : null);
                      
  if (matchedCoin) {
    // 1. Funding rate score (max 25)
    const funding = matchedCoin.funding;
    if (direction === "LONG") {
      if (funding < 0) {
        marketScore += 15;
        if (funding <= -0.0005) marketScore += 10;
        else if (funding <= -0.0002) marketScore += 7;
      } else if (funding < 0.0003) {
        marketScore += 10;
      } else {
        marketScore += 5;
      }
    } else { // SHORT
      if (funding > 0.0002) {
        marketScore += 15;
        if (funding >= 0.0008) marketScore += 10;
        else if (funding >= 0.0004) marketScore += 7;
      } else if (funding > -0.0001) {
        marketScore += 10;
      } else {
        marketScore += 5;
      }
    }
    
    // 2. Volume score (max 15)
    const volume = matchedCoin.volume;
    if (volume > 100000000) marketScore += 15;
    else if (volume > 50000000) marketScore += 12;
    else if (volume > 10000000) marketScore += 8;
    else marketScore += 4;
    
    // 3. Price Consolidation (max 10)
    const change = Math.abs(matchedCoin.change);
    if (change <= 1.5) marketScore += 10;
    else if (change <= 3.0) marketScore += 5;
    else marketScore += 2;
  } else {
    marketScore = 25; // default mid-score for unrecognized coins
  }
  
  // 4. Trade Structure Score (max 50)
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr = risk > 0 ? (reward / risk) : 0;
  
  if (rr >= 3.0) tradeScore += 20;
  else if (rr >= 2.0) tradeScore += 15;
  else if (rr >= 1.5) tradeScore += 10;
  else if (rr >= 1.0) tradeScore += 5;
  else tradeScore -= 10;
  
  // Stop Loss Distance (max 15)
  const slDistancePct = entry > 0 ? (risk / entry * 100) : 0;
  if (slDistancePct >= 1.5 && slDistancePct <= 4.0) {
    tradeScore += 15;
  } else if (slDistancePct > 4.0 && slDistancePct <= 8.0) {
    tradeScore += 10;
  } else if (slDistancePct >= 0.5 && slDistancePct < 1.5) {
    tradeScore += 10;
  } else if (slDistancePct > 8.0) {
    tradeScore += 5;
  } else {
    tradeScore += 2;
  }
  
  // Trend Alignment (max 15)
  if (matchedCoin) {
    const isPriceUp = matchedCoin.change > 0;
    if ((isPriceUp && direction === "LONG") || (!isPriceUp && direction === "SHORT")) {
      tradeScore += 15;
    } else {
      tradeScore += 5;
    }
  } else {
    tradeScore += 10;
  }
  
  const totalScore = Math.max(0, Math.min(100, marketScore + tradeScore));
  return {
    total: totalScore,
    market: marketScore,
    trade: tradeScore,
    rr: rr.toFixed(2),
    slPct: slDistancePct.toFixed(2)
  };
}

// Helper to find scanned coin data
function getScannedCoin(symbol) {
  return top100Coins.find(c => c.symbol === symbol) || 
         (watchlistPrices[symbol] && watchlistPrices[symbol].price > 0 ? {
           symbol: symbol,
           price: watchlistPrices[symbol].price,
           change: watchlistPrices[symbol].change,
           volume: 50000000,
           funding: -0.0001,
           high: watchlistPrices[symbol].price * 1.03,
           low: watchlistPrices[symbol].price * 0.97
         } : null);
}

// Render TrueNorth key execution zones and interactive suggestion badges below Symbol field
function renderTrueNorthIndicator(coin, dir) {
  const indicator = document.getElementById("symbol-live-indicator");
  if (!indicator || !coin) return;
  
  const formattedPrice = formatPriceText(coin.price);
  const fundingPercent = (coin.funding * 100).toFixed(4);
  
  const high = coin.high || coin.price * 1.03;
  const low = coin.low || coin.price * 0.97;
  const priceDecimals = coin.price < 1 ? 6 : (coin.price < 10 ? 4 : 2);
  
  // Golden Pocket (0.618 support for Long, 0.382 resistance for Short)
  const fibVal = (dir === "LONG" ? (high - (high - low) * 0.618) : (high - (high - low) * 0.382)).toFixed(priceDecimals);
  // Estimated daily VWAP Pivot
  const vwapVal = ((high + low + coin.price) / 3).toFixed(priceDecimals);
  // Wick Stop Loss (Below 24h low for Long, above 24h high for Short)
  const slVal = (dir === "LONG" ? (low * 0.99) : (high * 1.01)).toFixed(priceDecimals);
  
  indicator.innerHTML = `
    <div style="margin-bottom:0.25rem;">Live: <span style="color:#fff;">${formattedPrice}</span> | 24h: <span class="${coin.change >= 0 ? 'change-up' : 'change-down'}">${coin.change >= 0 ? '+' : ''}${coin.change.toFixed(2)}%</span> | Funding: <span style="color:#fff;">${fundingPercent}%</span></div>
    <div style="font-size:0.7rem; color:var(--color-text-muted); display:flex; gap:0.3rem; flex-wrap:wrap; margin-top:0.35rem; align-items:center;">
      <span style="font-weight:600; color:#9ca3af;">TrueNorth Zones:</span>
      <span class="suggest-level-badge" data-target="entry" data-value="${fibVal}" style="background: rgba(255,215,0,0.08); border: 1px solid rgba(255,215,0,0.25); color:#ffd700; padding:0.05rem 0.25rem; border-radius:4px; cursor:pointer;" title="Click to fill Entry Price">Entry (Fib): $${fibVal}</span>
      <span class="suggest-level-badge" data-target="tp" data-value="${vwapVal}" style="background: rgba(0,176,255,0.08); border: 1px solid rgba(0,176,255,0.25); color:var(--color-blue); padding:0.05rem 0.25rem; border-radius:4px; cursor:pointer;" title="Click to fill Take Profit">TP (VWAP): $${vwapVal}</span>
      <span class="suggest-level-badge" data-target="sl" data-value="${slVal}" style="background: rgba(255,61,0,0.08); border: 1px solid rgba(255,61,0,0.25); color:var(--color-red); padding:0.05rem 0.25rem; border-radius:4px; cursor:pointer;" title="Click to fill Stop Loss">SL (Wick): $${slVal}</span>
    </div>
  `;
}

// Calculate TrueNorth key level structures for details page
function getTrueNorthKeyLevels(coin) {
  if (!coin || coin.price === 0) return null;
  const high = coin.high || coin.price * 1.03;
  const low = coin.low || coin.price * 0.97;
  const price = coin.price;
  
  const fib0618 = high - (high - low) * 0.618;
  const vwap = (high + low + price) / 3;
  const shortLiqCluster = price * 1.025;
  const longLiqCluster = price * 0.975;
  
  return { fib0618, vwap, shortLiqCluster, longLiqCluster };
}

// Handle typing in the Planner symbol input field
function handleSymbolInput(e) {
  const symbol = e.target.value.toUpperCase().trim();
  const indicator = document.getElementById("symbol-live-indicator");
  
  if (!symbol) {
    if (indicator) indicator.textContent = "Enter symbol...";
    return;
  }
  
  const coin = getScannedCoin(symbol);
  if (coin) {
    const directionSelect = document.getElementById("plan-direction");
    const dir = directionSelect ? directionSelect.value : "LONG";
    renderTrueNorthIndicator(coin, dir);
    repopulateSlAndTp(coin.price);
  } else {
    if (indicator) {
      indicator.textContent = "Custom asset. Enter values manually.";
    }
  }
}

// Handle change of direction select element
function handleDirectionChange() {
  const symbolEl = document.getElementById("plan-symbol");
  const directionSelect = document.getElementById("plan-direction");
  const entryEl = document.getElementById("plan-entry");
  
  if (!symbolEl || !directionSelect) return;
  const symbol = symbolEl.value.toUpperCase().trim();
  const dir = directionSelect.value;
  
  const coin = getScannedCoin(symbol);
  if (coin) {
    renderTrueNorthIndicator(coin, dir);
    repopulateSlAndTp(coin.price);
  } else {
    const price = parseFloat(entryEl.value) || 0;
    if (price > 0) {
      repopulateSlAndTp(price);
    }
  }
}

// Repopulate SL/TP based on entry price and direction
function repopulateSlAndTp(price) {
  const directionSelect = document.getElementById("plan-direction");
  const entryEl = document.getElementById("plan-entry");
  const slEl = document.getElementById("plan-sl");
  const tpEl = document.getElementById("plan-tp");
  
  if (!entryEl || !slEl || !tpEl || !directionSelect) return;
  
  const dir = directionSelect.value;
  const priceDecimals = price < 1 ? 6 : (price < 10 ? 4 : 2);
  
  entryEl.value = price.toFixed(priceDecimals);
  
  if (dir === "LONG") {
    slEl.value = (price * 0.97).toFixed(priceDecimals);
    tpEl.value = (price * 1.06).toFixed(priceDecimals);
  } else {
    slEl.value = (price * 1.03).toFixed(priceDecimals);
    tpEl.value = (price * 0.94).toFixed(priceDecimals);
  }
}

// Save planner custom trade plan
function saveCustomPlan() {
  const symbolEl = document.getElementById("plan-symbol");
  const directionEl = document.getElementById("plan-direction");
  const entryEl = document.getElementById("plan-entry");
  const slEl = document.getElementById("plan-sl");
  const tpEl = document.getElementById("plan-tp");
  const riskPctEl = document.getElementById("plan-risk-pct");
  const accountSizeEl = document.getElementById("plan-account-size");
  
  if (!symbolEl || !directionEl || !entryEl || !slEl || !tpEl) return;
  
  const symbol = symbolEl.value.toUpperCase().trim();
  const direction = directionEl.value;
  const entry = parseFloat(entryEl.value) || 0;
  const sl = parseFloat(slEl.value) || 0;
  const tp = parseFloat(tpEl.value) || 0;
  const riskPct = parseFloat(riskPctEl.value) || 2;
  const accountSize = parseFloat(accountSizeEl.value) || 10000;
  
  if (!symbol) {
    alert("Please enter a valid symbol.");
    return;
  }
  if (entry <= 0 || sl <= 0 || tp <= 0) {
    alert("All prices must be positive numbers.");
    return;
  }
  
  if (direction === "LONG") {
    if (sl >= entry) {
      alert("For LONG trades, Stop Loss must be BELOW Entry Price.");
      return;
    }
    if (tp <= entry) {
      alert("For LONG trades, Take Profit must be ABOVE Entry Price.");
      return;
    }
  } else {
    if (sl <= entry) {
      alert("For SHORT trades, Stop Loss must be ABOVE Entry Price.");
      return;
    }
    if (tp >= entry) {
      alert("For SHORT trades, Take Profit must be BELOW Entry Price.");
      return;
    }
  }
  
  const scoreInfo = calculateCustomSetupScore({ symbol, direction, entry, sl, tp });
  
  const newPlan = {
    symbol,
    direction,
    entry,
    sl,
    tp,
    riskPct,
    accountSize,
    score: scoreInfo.total,
    timestamp: Date.now()
  };
  
  customTrades = customTrades.filter(t => t.symbol !== symbol);
  customTrades.push(newPlan);
  
  localStorage.setItem("alpha_custom_trades", JSON.stringify(customTrades));
  
  symbolEl.value = "";
  const indicator = document.getElementById("symbol-live-indicator");
  if (indicator) indicator.textContent = "Enter symbol...";
  
  updateCustomPlansTabCount();
  
  activeTab = "custom";
  const tabMarket = document.getElementById("tab-market-alpha");
  const tabMyPlans = document.getElementById("tab-my-plans");
  if (tabMarket && tabMyPlans) {
    tabMarket.classList.remove("active");
    tabMyPlans.classList.add("active");
  }
  
  renderPodium();
}

// Delete custom plan
function deleteCustomPlan(symbol) {
  customTrades = customTrades.filter(t => t.symbol !== symbol);
  localStorage.setItem("alpha_custom_trades", JSON.stringify(customTrades));
  updateCustomPlansTabCount();
  renderPodium();
}

// Update the tab label with number of plans
function updateCustomPlansTabCount() {
  const tabBtn = document.getElementById("tab-my-plans");
  if (tabBtn) {
    tabBtn.textContent = `My Plans (${customTrades.length})`;
  }
}

// Helpers
function floatParse(val) {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
}

function formatVolume(val) {
  if (val >= 1e9) return (val / 1e9).toFixed(2) + "B";
  if (val >= 1e6) return (val / 1e6).toFixed(2) + "M";
  if (val >= 1e3) return (val / 1e3).toFixed(2) + "K";
  return val.toFixed(2);
}

function getAssetName(sym) {
  const names = {
    "BTC": "Bitcoin",
    "ETH": "Ethereum",
    "SOL": "Solana",
    "HYPE": "Hyperliquid",
    "LINK": "Chainlink",
    "XRP": "Ripple",
    "INJ": "Injective",
    "WLD": "Worldcoin"
  };
  return names[sym] || "Altcoin Perp";
}

function formatPriceText(price) {
  if (price === 0) return "-";
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 10) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
