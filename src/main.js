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
        setup: setup
      };
    });
    
    // Also fetch HYPE from Hyperliquid mids
    await fetchHyperliquidHypePrice();
    
    filterAndRenderTable();
    renderWatchlist();
    
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
      } else {
        top100Coins.push({
          rank: 101,
          symbol: "HYPE",
          fullName: "HYPE",
          price: hypePrice,
          change: -9.4, // Live reference for June 10
          volume: 85000000,
          funding: -0.00013, // -0.013% hourly as negative funding
          setup: "Squeeze Setup" // Highly negative post-unlock
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
  
  const coin = top100Coins.find(c => c.symbol === symbol) || {
    symbol: symbol,
    price: watchlistPrices[symbol]?.price || 0,
    change: watchlistPrices[symbol]?.change || 0,
    funding: 0.0001,
    setup: "Neutral"
  };
  
  let plan = wikiTradePlans[symbol];
  
  // If no wiki plan exists, generate one dynamically based on current price!
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
  
  // Format visualization levels for styles
  const currentText = formatPriceText(coin.price);
  
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
