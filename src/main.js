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

// Symbol to CoinGecko ID map for TrueNorth MCP Server queries
const geckoIdMap = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "SOL": "solana",
  "HYPE": "hyperliquid",
  "LINK": "chainlink",
  "XRP": "ripple",
  "INJ": "injective-protocol",
  "WLD": "worldcoin-org"
};

// In-memory cache for MCP responses
const mcpCache = {
  technical: {},
  derivatives: {},
  smartMoney: {}
};

// Generic JSON-RPC tool caller helper
async function callMcpTool(toolName, args) {
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

let plannerDebounceTimer = null;

async function fetchTrueNorthPlannerData(symbol) {
  const geckoId = geckoIdMap[symbol];
  if (!geckoId) return;
  
  const indicator = document.getElementById("symbol-live-indicator");
  if (!indicator) return;
  
  let data = null;
  if (mcpCache.technical[symbol]) {
    data = mcpCache.technical[symbol];
  } else {
    data = await callMcpTool('technical_analysis', { token_address: geckoId, timeframe: '1h' });
    if (data) {
      mcpCache.technical[symbol] = data;
    }
  }
  
  const currentSymbolEl = document.getElementById("plan-symbol");
  if (currentSymbolEl && currentSymbolEl.value.toUpperCase().trim() === symbol) {
    const coin = getScannedCoin(symbol);
    if (data && coin) {
      const autoDir = detectAutoDirection(coin, data);
      renderTrueNorthIndicator(coin, autoDir, true, data);
      repopulateSlAndTp(coin.price, autoDir);
    } else {
      const span = indicator.querySelector('.mcp-loader-span');
      if (span) span.remove();
    }
  }
}

// Auto-detect trade direction based on funding rate, VWAP, S/R, momentum
function detectAutoDirection(coin, taData = null) {
  const funding = coin.funding || 0;  // already in decimal (e.g. 0.0001)
  const change24h = coin.change || 0;
  let score = 0; // positive = LONG bias, negative = SHORT bias
  let reasons = [];

  // ── Rule 1: Funding Rate ──
  // Negative funding = shorts paying longs → squeeze candidate → LONG
  // High positive funding = longs overextended → SHORT
  if (funding < -0.0001) {
    score += 2;
    reasons.push('neg_funding');
  } else if (funding < 0) {
    score += 1;
    reasons.push('slight_neg_funding');
  } else if (funding > 0.001) {
    score -= 2;
    reasons.push('high_pos_funding');
  } else if (funding > 0.0003) {
    score -= 1;
    reasons.push('pos_funding');
  }

  // ── Rule 2: Price vs VWAP ──
  if (taData && taData.support_resistance && taData.support_resistance.vwap) {
    const vwapData = taData.support_resistance.vwap.cumulative;
    if (vwapData) {
      if (vwapData.state === 'price_above' && vwapData.slope === 'up') {
        score += 2; // price above rising VWAP = bullish
        reasons.push('above_rising_vwap');
      } else if (vwapData.state === 'price_above' && vwapData.slope === 'down') {
        score += 0; // above but weakening
      } else if (vwapData.state === 'price_below' && vwapData.slope === 'down') {
        score -= 2; // below falling VWAP = bearish
        reasons.push('below_falling_vwap');
      } else if (vwapData.state === 'price_below' && vwapData.slope === 'up') {
        // Below VWAP but recovering → bounce candidate
        if (funding < 0) {
          score += 1; // squeeze setup
          reasons.push('below_vwap_squeeze');
        } else {
          score -= 1;
        }
      }
    }
  }

  // ── Rule 3: S/R Channel position ──
  if (taData && taData.support_resistance && taData.support_resistance['support and resistance channel']) {
    const channels = [...(taData.support_resistance['support and resistance channel'].channels || [])];
    const currentPrice = coin.price;
    channels.sort((a, b) => b.strength - a.strength);
    
    // Find nearest strong support below price
    const strongSupport = channels.find(c => c.hi <= currentPrice && c.strength >= 80);
    // Find nearest strong resistance above price
    const strongResistance = channels.find(c => c.lo >= currentPrice && c.strength >= 80);
    
    if (strongSupport && !strongResistance) {
      score += 1; // sitting on support with no resistance overhead → LONG
      reasons.push('at_support');
    } else if (strongResistance && !strongSupport) {
      score -= 1; // near resistance with no support → SHORT
      reasons.push('at_resistance');
    }
  }

  // ── Rule 4: 24h Momentum (weakest signal, tiebreaker) ──
  if (change24h > 3) {
    score += 1;
    reasons.push('bullish_momentum');
  } else if (change24h < -3) {
    score -= 1;
    reasons.push('bearish_momentum');
  }

  return score >= 0 ? 'LONG' : 'SHORT';
}

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
        
        <div id="mcp-deep-insights-${symbol}">
          <div class="mcp-drawer-loading">
            <div class="mcp-spinner"></div>
            <div>TrueNorth & Whale Flow ачаалж байна...</div>
          </div>
        </div>
        
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
    fetchDrawerDeepInsights(symbol);
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
      
      <div id="mcp-deep-insights-${symbol}">
        <div class="mcp-drawer-loading">
          <div class="mcp-spinner"></div>
          <div>TrueNorth & Whale Flow ачаалж байна...</div>
        </div>
      </div>
      
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
  fetchDrawerDeepInsights(symbol);
}

function closeDrawer() {
  const backdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("drawer");
  
  backdrop.classList.remove("open");
  drawer.classList.remove("open");
}

// Async: Fetch deep insights from TrueNorth MCP and render into drawer
async function fetchDrawerDeepInsights(symbol) {
  const container = document.getElementById(`mcp-deep-insights-${symbol}`);
  if (!container) return;
  
  const geckoId = geckoIdMap[symbol];
  if (!geckoId) {
    container.innerHTML = `<div style="font-size:0.8rem; color:var(--color-text-muted); text-align:center; padding:1rem;">TrueNorth: ${symbol} нь дэмжигдээгүй.</div>`;
    return;
  }
  
  // Fire all 3 queries in parallel
  const [taData, derivData, whaleData] = await Promise.all([
    mcpCache.technical[symbol] || callMcpTool('technical_analysis', { token_address: geckoId, timeframe: '1h' }),
    mcpCache.derivatives[symbol] || callMcpTool('derivatives_analysis', { token_address: geckoId }),
    mcpCache.smartMoney[symbol] || callMcpTool('hyperliquid_smart_money', { token_address: geckoId })
  ]);
  
  // Cache results
  if (taData) mcpCache.technical[symbol] = taData;
  if (derivData) mcpCache.derivatives[symbol] = derivData;
  if (whaleData) mcpCache.smartMoney[symbol] = whaleData;
  
  // Check if drawer is still open for same symbol
  const check = document.getElementById(`mcp-deep-insights-${symbol}`);
  if (!check) return;
  
  let html = '<div class="mcp-insights-container">';
  
  // ─── 1. TrueNorth S/R Channels ───
  if (taData && taData.support_resistance) {
    const sr = taData.support_resistance;
    let channelsHtml = '';
    
    if (sr['support and resistance channel'] && sr['support and resistance channel'].channels) {
      const channels = [...sr['support and resistance channel'].channels].sort((a, b) => b.strength - a.strength).slice(0, 5);
      const currentPrice = taData.token_metadata?.current_price || 0;
      
      channelsHtml = channels.map(ch => {
        const mid = (ch.hi + ch.lo) / 2;
        const isSupport = mid < currentPrice;
        const typeColor = isSupport ? 'var(--color-green)' : 'var(--color-red)';
        const typeLabel = isSupport ? 'Support' : 'Resistance';
        const strengthPct = Math.min(ch.strength, 120);
        
        return `
          <div class="channel-row">
            <div>
              <span style="color:${typeColor}; font-weight:600; font-size:0.7rem;">${typeLabel}</span>
              <span class="channel-range">${formatPriceText(ch.lo)} – ${formatPriceText(ch.hi)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <div style="width:50px; height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
                <div style="width:${strengthPct}%; height:100%; background:${typeColor}; border-radius:2px;"></div>
              </div>
              <span class="channel-strength">${ch.strength}</span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    let vwapHtml = '';
    if (sr.vwap && sr.vwap.cumulative) {
      const v = sr.vwap.cumulative;
      const slopeColor = v.slope === 'up' ? 'var(--color-green)' : 'var(--color-red)';
      const stateText = v.state === 'price_above' ? 'Үнэ дээр (Bullish)' : 'Үнэ доор (Bearish)';
      vwapHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem; padding:0.5rem 0.8rem; background:rgba(0,176,255,0.04); border-radius:8px; border: 1px solid rgba(0,176,255,0.1);">
          <div>
            <span style="font-size:0.7rem; color:var(--color-text-muted);">VWAP (${v.scope}):</span>
            <span style="font-family:var(--font-title); font-weight:700; color:var(--color-blue); margin-left:0.4rem;">${formatPriceText(v.value)}</span>
          </div>
          <div style="font-size:0.7rem;">
            <span style="color:${slopeColor}; font-weight:600;">↗ ${v.slope}</span> · <span style="color:var(--color-text-muted);">${stateText}</span>
          </div>
        </div>
      `;
    }
    
    html += `
      <div class="insight-block">
        <div class="insight-block-title">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M3,14L3.5,14.07L8.07,9.5C7.89,8.85 8.06,8.11 8.59,7.59C9.37,6.8 10.63,6.8 11.41,7.59C11.94,8.11 12.11,8.85 11.93,9.5L14.5,12.07L15,12C15.79,12 16.5,12.31 17.03,12.83L20.29,9.57C20.1,8.92 20.27,8.16 20.8,7.63C21.59,6.84 22.84,6.84 23.63,7.63C24.41,8.41 24.41,9.67 23.63,10.45C23.1,10.98 22.34,11.15 21.7,10.96L18.44,14.22C18.95,15.09 18.88,16.2 18.14,17L21.5,20.37C22.15,20.18 22.91,20.35 23.44,20.88C24.22,21.66 24.22,22.92 23.44,23.7C22.66,24.5 21.39,24.5 20.61,23.7C20.08,23.18 19.91,22.41 20.1,21.77L16.73,18.39C15.93,19.13 14.83,19.2 13.96,18.69L11.39,21.27C11.58,21.91 11.41,22.67 10.88,23.2C10.1,24 8.83,24 8.05,23.2C7.27,22.42 7.27,21.16 8.05,20.38C8.58,19.85 9.34,19.68 9.98,19.87L12.55,17.3C12.04,16.41 12.12,15.3 12.88,14.5L10.3,11.93C9.66,12.11 8.9,11.94 8.38,11.41C7.59,10.63 7.59,9.37 8.38,8.59L3.8,13.17L3,14Z"/></svg>
          TrueNorth Support/Resistance Channels
          <span class="mcp-status-pill live">LIVE</span>
        </div>
        <div class="channels-list">
          ${channelsHtml || '<div style="font-size:0.8rem; color:var(--color-text-muted);">Channels олдсонгүй.</div>'}
        </div>
        ${vwapHtml}
      </div>
    `;
  }
  
  // ─── 2. Derivatives: Liquidation Clusters & Funding ───
  if (derivData && derivData.derivative_data) {
    const sym = Object.keys(derivData.derivative_data).find(k => k !== '_metadata' && k !== 'url' && k !== 'title');
    if (sym) {
      const d = derivData.derivative_data[sym];
      
      let fundingHtml = '';
      const fundingKey = Object.keys(d).find(k => k.toLowerCase().includes('funding'));
      if (fundingKey) {
        const f = d[fundingKey];
        const rate = f.current_funding_rate_in_percentage;
        const annualized = f.annualized_funding_cost_est_in_percentage;
        const percentile = f.current_funding_percentile_7d;
        const fundingColor = rate < 0 ? 'var(--color-green)' : (rate > 0.01 ? 'var(--color-red)' : 'var(--color-blue)');
        const fundingLabel = rate < 0 ? 'Сөрөг (Short даралт)' : (rate > 0.01 ? 'Эерэг (Long даралт)' : 'Төвийг сахисан');
        
        fundingHtml = `
          <div class="liq-metrics-grid">
            <div class="liq-metric">
              <span class="w-label">Funding Rate</span>
              <span class="w-val" style="color:${fundingColor};">${rate != null ? rate.toFixed(4) : '–'}%</span>
              <span style="font-size:0.65rem; color:var(--color-text-muted);">${fundingLabel}</span>
            </div>
            <div class="liq-metric">
              <span class="w-label">Annualized / 7D Percentile</span>
              <span class="w-val" style="color:#fff;">${annualized != null ? annualized.toFixed(2) : '–'}%</span>
              <span style="font-size:0.65rem; color:var(--color-text-muted);">Percentile: ${percentile != null ? percentile.toFixed(1) : '–'}%</span>
            </div>
          </div>
        `;
      }
      
      let liqHtml = '';
      const liqKey = Object.keys(d).find(k => k.toLowerCase().includes('liquidation'));
      if (liqKey) {
        const liq = d[liqKey];
        const shortLiqs = liq.max_liquidation_points?.max_short_liquidation_point || [];
        const longLiqs = liq.max_liquidation_points?.max_long_liquidation_point || [];
        const imb = liq.imbalance;
        
        const shortTotal = imb?.short_total_usd || 0;
        const longTotal = imb?.long_total_usd || 0;
        const total = shortTotal + longTotal;
        const longPct = total > 0 ? (longTotal / total * 100) : 50;
        
        liqHtml = `
          <div style="margin-top:0.5rem;">
            <div style="font-size:0.7rem; color:var(--color-text-muted); margin-bottom:0.3rem;">Liquidation Imbalance:</div>
            <div class="liq-ratio-bar-wrapper">
              <div class="liq-ratio-bar-fill long" style="width:${longPct}%;"></div>
              <div class="liq-ratio-bar-fill short" style="width:${100 - longPct}%;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-top:0.2rem;">
              <span style="color:var(--color-green);">Long: $${formatVolume(longTotal)}</span>
              <span style="color:var(--color-text-muted);">${imb?.interpretation?.replace(/_/g, ' ') || ''}</span>
              <span style="color:var(--color-red);">Short: $${formatVolume(shortTotal)}</span>
            </div>
          </div>
          <div class="liq-metrics-grid" style="margin-top:0.5rem;">
            ${shortLiqs.slice(0, 2).map(s => `
              <div class="liq-metric" style="border-left:2px solid var(--color-red);">
                <span class="w-label">Short Liq Magnet</span>
                <span class="w-val" style="color:var(--color-red);">${formatPriceText(s.price)}</span>
                <span style="font-size:0.65rem; color:var(--color-text-muted);">$${formatVolume(s.liq_usd)} · +${s.distance_pct?.toFixed(2) || '?'}%</span>
              </div>
            `).join('')}
            ${longLiqs.slice(0, 2).map(l => `
              <div class="liq-metric" style="border-left:2px solid var(--color-green);">
                <span class="w-label">Long Liq Magnet</span>
                <span class="w-val" style="color:var(--color-green);">${formatPriceText(l.price)}</span>
                <span style="font-size:0.65rem; color:var(--color-text-muted);">$${formatVolume(l.liq_usd)} · -${l.distance_pct?.toFixed(2) || '?'}%</span>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      // OI block
      let oiHtml = '';
      const oiKey = Object.keys(d).find(k => k.toLowerCase().includes('open interest'));
      if (oiKey) {
        const oi = d[oiKey];
        const oiCurrent = oi.current_open_interest;
        const oi1h = oi.rolling_changes?.oi_change_1h_abs || 0;
        const oi1d = oi.rolling_changes?.oi_change_1d_abs || 0;
        const oi1hColor = oi1h >= 0 ? 'var(--color-green)' : 'var(--color-red)';
        const oi1dColor = oi1d >= 0 ? 'var(--color-green)' : 'var(--color-red)';
        
        oiHtml = `
          <div class="liq-metrics-grid" style="margin-top:0.5rem;">
            <div class="liq-metric">
              <span class="w-label">Open Interest</span>
              <span class="w-val" style="color:#fff;">$${formatVolume(oiCurrent)}</span>
            </div>
            <div class="liq-metric">
              <span class="w-label">OI Δ (1h / 24h)</span>
              <span class="w-val" style="font-size:0.85rem;"><span style="color:${oi1hColor};">${oi1h >= 0 ? '+' : ''}$${formatVolume(Math.abs(oi1h))}</span> / <span style="color:${oi1dColor};">${oi1d >= 0 ? '+' : ''}$${formatVolume(Math.abs(oi1d))}</span></span>
            </div>
          </div>
        `;
      }
      
      html += `
        <div class="insight-block">
          <div class="insight-block-title">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z"/></svg>
            Derivatives & Liquidation Map
            <span class="mcp-status-pill live">LIVE</span>
          </div>
          ${fundingHtml}
          ${oiHtml}
          ${liqHtml}
        </div>
      `;
    }
  }
  
  // ─── 3. Whale Smart Money (Nansen-style) ───
  if (whaleData && whaleData.smart_money) {
    const sm = whaleData.smart_money;
    const sentiment = sm.sentiment || 'NEUTRAL';
    const sentimentColor = sentiment === 'BULLISH' ? 'var(--color-green)' : (sentiment === 'BEARISH' ? 'var(--color-red)' : 'var(--color-blue)');
    const sentimentBg = sentiment === 'BULLISH' ? 'rgba(0,230,118,0.08)' : (sentiment === 'BEARISH' ? 'rgba(255,61,0,0.08)' : 'rgba(0,176,255,0.08)');
    const sentimentIcon = sentiment === 'BULLISH' ? '🐂' : (sentiment === 'BEARISH' ? '🐻' : '⚖️');
    
    const lsRatio = sm.long_short_ratio || 0;
    const longPct = lsRatio > 0 ? (lsRatio / (lsRatio + 1) * 100) : 50;
    
    const agg = sm.aggregated_position || {};
    const longPos = agg.long_position || 0;
    const shortPos = agg.short_position || 0;
    const netPos = agg.net_position || 0;
    
    const topWallets = (sm.top_wallets || []).slice(0, 5);
    let walletsHtml = topWallets.map(w => {
      const dirColor = w.direction === 'LONG' ? 'var(--color-green)' : 'var(--color-red)';
      const pnlColor = w.pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)';
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.02); font-size:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span style="color:${dirColor}; font-weight:700; font-size:0.65rem;">${w.direction}</span>
            <span style="color:var(--color-text-muted); font-family:monospace; font-size:0.65rem;">${w.wallet || w.wallet_address?.slice(0, 10) + '...'}</span>
          </div>
          <div style="display:flex; gap:0.6rem; align-items:center;">
            <span style="color:#fff; font-weight:600;">$${formatVolume(Math.abs(w.value || 0))}</span>
            <span style="color:${pnlColor}; font-size:0.65rem;">${w.pnl >= 0 ? '+' : ''}$${formatVolume(Math.abs(w.pnl || 0))}</span>
            <span style="color:var(--color-text-muted); font-size:0.6rem;">${w.leverage || '?'}x</span>
          </div>
        </div>
      `;
    }).join('');
    
    html += `
      <div class="insight-block" style="border-color:${sentimentColor.replace('var(', '').replace(')', '')}22;">
        <div class="insight-block-title">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z"/></svg>
          Whale Smart Money Flow (Hyperliquid)
          <span class="mcp-status-pill live">LIVE</span>
        </div>
        
        <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.3rem;">
          <span style="font-size:1.3rem;">${sentimentIcon}</span>
          <span class="sentiment-badge" style="background:${sentimentBg}; color:${sentimentColor}; font-weight:700; font-size:0.85rem; padding:0.2rem 0.6rem;">
            ${sentiment}
          </span>
          <span style="font-size:0.75rem; color:var(--color-text-muted);">L/S Ratio: <span style="color:#fff; font-weight:600;">${lsRatio.toFixed(2)}</span></span>
        </div>
        
        <div class="whale-metrics-grid">
          <div class="whale-metric">
            <span class="w-label">Long Position</span>
            <span class="w-val" style="color:var(--color-green);">$${formatVolume(longPos)}</span>
          </div>
          <div class="whale-metric">
            <span class="w-label">Short Position</span>
            <span class="w-val" style="color:var(--color-red);">$${formatVolume(shortPos)}</span>
          </div>
        </div>
        
        <div>
          <div class="whale-ratio-bar-wrapper">
            <div class="whale-ratio-bar-fill" style="width:${longPct.toFixed(1)}%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-top:0.15rem;">
            <span style="color:var(--color-green);">Longs ${longPct.toFixed(0)}%</span>
            <span style="color:var(--color-text-muted);">Net: <span style="color:${netPos >= 0 ? 'var(--color-green)' : 'var(--color-red)'}; font-weight:600;">${netPos >= 0 ? '+' : ''}$${formatVolume(Math.abs(netPos))}</span></span>
            <span style="color:var(--color-red);">Shorts ${(100 - longPct).toFixed(0)}%</span>
          </div>
        </div>
        
        <div style="margin-top:0.3rem;">
          <div style="font-size:0.7rem; color:var(--color-text-muted); margin-bottom:0.3rem; font-weight:600;">Top Whale Positions:</div>
          ${walletsHtml || '<div style="font-size:0.75rem; color:var(--color-text-muted);">Мэдээлэл олдсонгүй.</div>'}
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  
  // Final check
  const finalCheck = document.getElementById(`mcp-deep-insights-${symbol}`);
  if (finalCheck) {
    if (html === '<div class="mcp-insights-container"></div>') {
      finalCheck.innerHTML = '<div style="font-size:0.8rem; color:var(--color-text-muted); text-align:center; padding:1rem;">TrueNorth мэдээлэл татахад алдаа гарлаа. Дахин оролдоно уу.</div>';
    } else {
      finalCheck.innerHTML = html;
    }
  }
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
function renderTrueNorthIndicator(coin, dir, isLive = false, taData = null) {
  const indicator = document.getElementById("symbol-live-indicator");
  if (!indicator || !coin) return;
  
  const formattedPrice = formatPriceText(coin.price);
  const fundingPercent = (coin.funding * 100).toFixed(4);
  
  let fibVal = null;
  let vwapVal = null;
  let slVal = null;
  
  let high = coin.high || coin.price * 1.03;
  let low = coin.low || coin.price * 0.97;
  
  if (taData) {
    if (taData.support_resistance) {
      if (taData.support_resistance.vwap && taData.support_resistance.vwap.cumulative) {
        vwapVal = taData.support_resistance.vwap.cumulative.value;
      }
      if (taData.support_resistance.recent_high_low && taData.support_resistance.recent_high_low.calendar) {
        high = taData.support_resistance.recent_high_low.calendar.high_24h || high;
        low = taData.support_resistance.recent_high_low.calendar.low_24h || low;
      }
      if (taData.support_resistance['support and resistance channel']) {
        const channels = [...(taData.support_resistance['support and resistance channel'].channels || [])];
        const currentPrice = taData.current_price || coin.price;
        channels.sort((a, b) => b.strength - a.strength);
        if (dir === "LONG") {
          const support = channels.find(c => c.hi <= currentPrice);
          if (support) fibVal = (support.hi + support.lo) / 2;
        } else {
          const resistance = channels.find(c => c.lo >= currentPrice);
          if (resistance) fibVal = (resistance.hi + resistance.lo) / 2;
        }
      }
    }
  }
  
  const priceDecimals = coin.price < 1 ? 6 : (coin.price < 10 ? 4 : 2);
  if (!fibVal) fibVal = dir === "LONG" ? (high - (high - low) * 0.618) : (high - (high - low) * 0.382);
  if (!vwapVal) vwapVal = (high + low + coin.price) / 3;
  if (!slVal) slVal = dir === "LONG" ? (low * 0.99) : (high * 1.01);
  
  const fibStr = parseFloat(fibVal).toFixed(priceDecimals);
  const vwapStr = parseFloat(vwapVal).toFixed(priceDecimals);
  const slStr = parseFloat(slVal).toFixed(priceDecimals);
  
  const badgeTitle = isLive ? "TrueNorth Live Level" : "Estimated Level";
  const badgeStyle = isLive ? "border-style: solid; box-shadow: 0 0 6px rgba(139, 92, 246, 0.2);" : "border-style: dashed; opacity: 0.85;";
  
  // Direction badge
  const dirColor = dir === 'LONG' ? 'var(--color-green)' : 'var(--color-red)';
  const dirBg = dir === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,61,0,0.1)';
  const dirBorder = dir === 'LONG' ? 'rgba(0,230,118,0.35)' : 'rgba(255,61,0,0.35)';
  const dirIcon = dir === 'LONG' ? '▲' : '▼';
  const dirLabel = isLive ? `Auto: ${dir}` : `Est: ${dir}`;
  
  // Update the hidden direction state so saveCustomPlan can read it
  const hiddenDir = document.getElementById('plan-direction-auto');
  if (hiddenDir) hiddenDir.value = dir;
  
  indicator.innerHTML = `
    <div style="margin-bottom:0.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
      <div style="font-size:0.75rem;">Live: <span style="color:#fff;">${formattedPrice}</span> | 24h: <span class="${coin.change >= 0 ? 'change-up' : 'change-down'}">${coin.change >= 0 ? '+' : ''}${coin.change.toFixed(2)}%</span> | Funding: <span style="color:#fff;">${fundingPercent}%</span></div>
      <div style="display:flex; gap:0.35rem; align-items:center;">
        <span style="font-size:0.7rem; font-weight:700; padding:0.15rem 0.55rem; border-radius:5px; background:${dirBg}; color:${dirColor}; border:1px solid ${dirBorder}; letter-spacing:0.05em;">${dirIcon} ${dirLabel}</span>
        <span class="mcp-status-pill ${isLive ? 'live' : 'loading'}">${isLive ? 'TrueNorth Live' : 'Calculating...'}</span>
      </div>
    </div>
    <div style="font-size:0.7rem; color:var(--color-text-muted); display:flex; gap:0.3rem; flex-wrap:wrap; margin-top:0.35rem; align-items:center;">
      <span style="font-weight:600; color:#9ca3af;">Execution Zones:</span>
      <span class="suggest-level-badge" data-target="entry" data-value="${fibStr}" style="background: rgba(255,215,0,0.08); border: 1px solid rgba(255,215,0,0.25); color:#ffd700; padding:0.05rem 0.25rem; border-radius:4px; cursor:pointer; ${badgeStyle}" title="${badgeTitle} (Click to fill Entry)">Entry (Fib): $${fibStr}</span>
      <span class="suggest-level-badge" data-target="tp" data-value="${vwapStr}" style="background: rgba(0,176,255,0.08); border: 1px solid rgba(0,176,255,0.25); color:var(--color-blue); padding:0.05rem 0.25rem; border-radius:4px; cursor:pointer; ${badgeStyle}" title="${badgeTitle} (Click to fill TP)">TP (VWAP): $${vwapStr}</span>
      <span class="suggest-level-badge" data-target="sl" data-value="${slStr}" style="background: rgba(255,61,0,0.08); border: 1px solid rgba(255,61,0,0.25); color:var(--color-red); padding:0.05rem 0.25rem; border-radius:4px; cursor:pointer; ${badgeStyle}" title="${badgeTitle} (Click to fill SL)">SL (Wick): $${slStr}</span>
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
    if (indicator) indicator.innerHTML = '<span style="color:var(--color-text-muted); font-size:0.8rem;">Symbol оруулна уу...</span>';
    return;
  }
  
  const coin = getScannedCoin(symbol);
  if (coin) {
    // 1. Quick estimate with available coin data (no TrueNorth yet)
    const quickDir = detectAutoDirection(coin);
    renderTrueNorthIndicator(coin, quickDir, false);
    repopulateSlAndTp(coin.price, quickDir);
    
    // 2. Query TrueNorth live for better signal
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

// Repopulate SL/TP based on entry price and auto-detected direction
function repopulateSlAndTp(price, dir) {
  const entryEl = document.getElementById("plan-entry");
  const slEl = document.getElementById("plan-sl");
  const tpEl = document.getElementById("plan-tp");
  
  if (!entryEl || !slEl || !tpEl) return;
  
  // Use provided dir or read from hidden field
  if (!dir) {
    const hiddenDir = document.getElementById('plan-direction-auto');
    dir = hiddenDir ? hiddenDir.value : 'LONG';
  }
  
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
  const entryEl = document.getElementById("plan-entry");
  const slEl = document.getElementById("plan-sl");
  const tpEl = document.getElementById("plan-tp");
  const riskPctEl = document.getElementById("plan-risk-pct");
  const accountSizeEl = document.getElementById("plan-account-size");
  const hiddenDirEl = document.getElementById("plan-direction-auto");
  
  if (!symbolEl || !entryEl || !slEl || !tpEl) return;
  
  const symbol = symbolEl.value.toUpperCase().trim();
  const entry = parseFloat(entryEl.value) || 0;
  const sl = parseFloat(slEl.value) || 0;
  const tp = parseFloat(tpEl.value) || 0;
  const riskPct = parseFloat(riskPctEl?.value) || 2;
  const accountSize = parseFloat(accountSizeEl?.value) || 10000;
  
  // Auto-detect direction from price logic (entry/sl/tp relationship)
  let direction;
  if (sl < entry && tp > entry) {
    direction = 'LONG';
  } else if (sl > entry && tp < entry) {
    direction = 'SHORT';
  } else {
    // Fallback: read from hidden field (set by renderTrueNorthIndicator)
    direction = hiddenDirEl ? hiddenDirEl.value : 'LONG';
  }
  
  if (!symbol) {
    alert("Symbol оруулна уу.");
    return;
  }
  if (entry <= 0 || sl <= 0 || tp <= 0) {
    alert("Бүх үнэ эерэг тоо байх ёстой.");
    return;
  }
  
  if (direction === "LONG") {
    if (sl >= entry) {
      alert("LONG арилжааны Stop Loss нь Entry-ийн ДООР байх ёстой.");
      return;
    }
    if (tp <= entry) {
      alert("LONG арилжааны Take Profit нь Entry-ийн ДЭЭР байх ёстой.");
      return;
    }
  } else {
    if (sl <= entry) {
      alert("SHORT арилжааны Stop Loss нь Entry-ийн ДЭЭР байх ёстой.");
      return;
    }
    if (tp >= entry) {
      alert("SHORT арилжааны Take Profit нь Entry-ийн ДООР байх ёстой.");
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
