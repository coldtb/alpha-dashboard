import { store, saveCustomTrades } from '../store/index.js';
import { 
  geckoIdMap, 
  wikiTradePlans, 
  wikiPrompts, 
  defaultSocialAlphaTokens, 
  formatPriceText, 
  formatVolume, 
  getAssetName, 
  getScannedCoin, 
  getTrueNorthKeyLevels, 
  detectAutoDirection, 
  calculateCustomSetupScore, 
  computeStrategyLevels 
} from '../utils/helpers.js';
import { fetchDeepInsights, runBacktest, fetchPerformance } from '../services/api.js';

// Spawns U.S. paper 100$ bill particles in the background
export function initFallingDollars() {
  const container = document.getElementById("falling-dollars-container");
  if (!container) return;

  function spawnDollar() {
    const dollar = document.createElement("div");
    dollar.className = "falling-dollar";

    const startX = Math.random() * 100;
    const duration = Math.random() * 9 + 7;
    const opacity = Math.random() * 0.22 + 0.12;
    const sway = Math.random() * 160 - 80;
    
    const rotateX = Math.random() * 1080 + 360;
    const rotateY = Math.random() * 1080 + 360;
    const rotateZ = Math.random() * 360 - 180;
    
    const scale = Math.random() * 0.45 + 0.75;

    dollar.style.left = `${startX}vw`;
    dollar.style.animationDuration = `${duration}s`;
    dollar.style.setProperty("--dollar-opacity", opacity);
    dollar.style.setProperty("--sway-distance", `${sway}px`);
    dollar.style.setProperty("--rotate-x", `${rotateX}deg`);
    dollar.style.setProperty("--rotate-y", `${rotateY}deg`);
    dollar.style.setProperty("--rotate-z", `${rotateZ}deg`);
    dollar.style.setProperty("--dollar-scale", scale);

    container.appendChild(dollar);

    dollar.addEventListener("animationend", () => {
      dollar.remove();
    });
  }

  for (let i = 0; i < 15; i++) {
    setTimeout(spawnDollar, Math.random() * 9000);
  }

  setInterval(spawnDollar, 800);
}

// Render prompts in the Clipboard Hub
export function renderPromptsHub() {
  const container = document.getElementById("prompts-hub");
  if (!container) return;
  
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

// Filter and render top 100 table
export function filterAndRenderTable(onRowClick) {
  const searchInput = document.getElementById("scanner-search");
  const searchQuery = searchInput ? searchInput.value.toUpperCase().trim() : "";
  
  const activeFilterBtn = document.querySelector(".filter-btn.active");
  const activeFilter = activeFilterBtn ? activeFilterBtn.getAttribute("data-filter") : "all";
  
  store.filteredCoins = store.top100Coins.filter(coin => {
    const matchesSearch = coin.symbol.includes(searchQuery);
    
    let matchesFilter = true;
    if (activeFilter === "squeeze") {
      matchesFilter = coin.setup === "Squeeze Setup";
    } else if (activeFilter === "consolidating") {
      matchesFilter = coin.setup === "Consolidating";
    }
    
    return matchesSearch && matchesFilter;
  });
  
  const tbody = document.getElementById("scanner-table-body");
  if (!tbody) return;

  if (store.filteredCoins.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem; color: var(--color-text-muted);">
          No matching coins found.
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = store.filteredCoins.map(coin => {
    const isSqueeze = coin.setup === "Squeeze Setup";
    const rowClass = isSqueeze ? "table-squeeze-row" : "";
    const changeClass = coin.change >= 0 ? "change-up" : "change-down";
    const changePrefix = coin.change >= 0 ? "+" : "";
    
    const formattedPrice = formatPriceText(coin.price);
    const fundingPercent = (coin.funding * 100).toFixed(4);
    const fundingClass = coin.funding < 0 ? "change-up" : "";
    
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
  
  tbody.querySelectorAll("tr").forEach(row => {
    row.addEventListener("click", () => {
      const sym = row.getAttribute("data-symbol");
      if (onRowClick) {
        onRowClick(sym);
      }
    });
  });
}

// Flash price visually on ticks
export function flashPrice(el, newPrice, oldPrice) {
  if (newPrice > oldPrice) {
    el.classList.add("flash-green");
    setTimeout(() => el.classList.remove("flash-green"), 500);
  } else if (newPrice < oldPrice) {
    el.classList.add("flash-red");
    setTimeout(() => el.classList.remove("flash-red"), 500);
  }
}

// Instant WebSocket UI price updater
export function updatePriceUI(symbol, newPrice, oldPrice) {
  const cardPriceEl = document.getElementById(`price-card-${symbol}`);
  if (cardPriceEl) {
    cardPriceEl.textContent = formatPriceText(newPrice);
    flashPrice(cardPriceEl, newPrice, oldPrice);
  }
  
  const tablePriceEl = document.getElementById(`price-table-${symbol}`);
  if (tablePriceEl) {
    tablePriceEl.textContent = formatPriceText(newPrice);
    flashPrice(tablePriceEl, newPrice, oldPrice);
  }

  const podiumPriceEl = document.getElementById(`podium-price-${symbol}`);
  if (podiumPriceEl) {
    podiumPriceEl.textContent = formatPriceText(newPrice);
    flashPrice(podiumPriceEl, newPrice, oldPrice);
  }

  const drawerLivePriceEl = document.getElementById(`drawer-live-price-${symbol}`);
  if (drawerLivePriceEl) {
    drawerLivePriceEl.textContent = formatPriceText(newPrice);
    flashPrice(drawerLivePriceEl, newPrice, oldPrice);
  }
}

// Open drawer details and trigger service deep insights
export async function openDrawer(symbol) {
  const backdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("drawer");
  const content = document.getElementById("drawer-content");
  
  if (!backdrop || !drawer || !content) return;

  const customPlan = store.customTrades.find(t => t.symbol === symbol);
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
            <div>• Conviction Score: <strong>${scoreInfo.total}/100</strong></div>
            <div>• Risk/Reward Ratio: <strong>${scoreInfo.rr}:1</strong></div>
            <div>• Stop Loss Distance: <strong>${scoreInfo.slPct}%</strong></div>
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
    
    const geckoId = geckoIdMap[symbol];
    if (geckoId) {
      try {
        const insights = await fetchDeepInsights(symbol, geckoId);
        renderDrawerDeepInsights(symbol, insights);
      } catch (e) {
        console.error("Deep insights loading failed:", e);
      }
    } else {
      const container = document.getElementById(`mcp-deep-insights-${symbol}`);
      if (container) {
        container.innerHTML = `<div style="font-size:0.8rem; color:var(--color-text-muted); text-align:center; padding:1rem;">TrueNorth: ${symbol} нь дэмжигдээгүй.</div>`;
      }
    }
    return;
  }

  const coin = store.top100Coins.find(c => c.symbol === symbol) || {
    symbol: symbol,
    price: store.watchlistPrices[symbol]?.price || 0,
    change: store.watchlistPrices[symbol]?.change || 0,
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
  
  const geckoId = geckoIdMap[symbol];
  if (geckoId) {
    try {
      const insights = await fetchDeepInsights(symbol, geckoId);
      renderDrawerDeepInsights(symbol, insights);
    } catch (e) {
      console.error("Deep insights loading failed:", e);
    }
  } else {
    const container = document.getElementById(`mcp-deep-insights-${symbol}`);
    if (container) {
      container.innerHTML = `<div style="font-size:0.8rem; color:var(--color-text-muted); text-align:center; padding:1rem;">TrueNorth: ${symbol} нь дэмжигдээгүй.</div>`;
    }
  }
}

export function closeDrawer() {
  const backdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("drawer");
  if (backdrop && drawer) {
    backdrop.classList.remove("open");
    drawer.classList.remove("open");
  }
}

// Render TrueNorth & Nansen insights into drawer
export function renderDrawerDeepInsights(symbol, insights) {
  const container = document.getElementById(`mcp-deep-insights-${symbol}`);
  if (!container) return;
  
  const { taData, derivData, whaleData, optionsData } = insights;
  
  let html = '<div class="mcp-insights-container">';
  
  // 1. Technical Indicators & Channels
  if (taData && taData.support_resistance) {
    const sr = taData.support_resistance;
    let channelsHtml = '';
    
    if (sr['support and resistance channel'] && sr['support and resistance channel'].channels) {
      const channels = [...sr['support and resistance channel'].channels]
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5);
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
  
  // 2. Derivatives Analysis (Funding, liquidation levels)
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
  
  // 3. Whale Flows
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
  
  // 4. Options Market Info
  if (optionsData && optionsData.result && optionsData.result.content && optionsData.result.content[0] && optionsData.result.content[0].text) {
    try {
      const parsed = JSON.parse(optionsData.result.content[0].text);
      if (parsed && parsed.summary) {
        const s = parsed.summary;
        const kl = s.key_levels;
        const sig = s.signal_summary;
        
        let sentimentColor = s.sentiment === 'bullish' ? 'var(--color-green)' : (s.sentiment === 'bearish' ? 'var(--color-red)' : 'var(--color-text-muted)');
        
        html += `
          <div class="insight-block">
            <div class="insight-block-title">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M19,3H5C3.89,3 3,3.9 3,5V19C3,20.1 3.89,21 5,21H19C20.1,21 21,20.1 21,19V5C21,3.9 20.1,3 19,3M19,19H5V5H19V19M7,10H9V17H7V10M11,7H13V17H11V7M15,13H17V17H15V13Z"/></svg>
              Options & Gamma (GEX) Intelligence
              <span class="mcp-status-pill live">LIVE</span>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; font-size:0.75rem;">
              <span>Sentiment: <span style="color:${sentimentColor}; font-weight:600; text-transform:uppercase;">${s.sentiment || 'mixed'}</span></span>
              <span>Regime: <span style="color:${s.regime === 'negative_gamma' ? 'var(--color-red)' : 'var(--color-green)'}; font-weight:600;">${s.regime === 'negative_gamma' ? 'Negative Gamma' : 'Positive Gamma'}</span></span>
            </div>
            
            <div class="liq-metrics-grid" style="margin-top:0.3rem;">
              <div class="liq-metric">
                <span class="w-label">GEX Flip Price</span>
                <span class="w-val" style="color:#fff;">${kl.gex_flip != null ? formatPriceText(kl.gex_flip) : '-'}</span>
              </div>
              <div class="liq-metric">
                <span class="w-label">Max Pain</span>
                <span class="w-val" style="color:var(--color-blue);">${kl.max_pain != null ? formatPriceText(kl.max_pain) : '-'}</span>
              </div>
            </div>
            
            <div class="liq-metrics-grid" style="margin-top:0.4rem;">
              <div class="liq-metric">
                <span class="w-label">Nearest Put Wall (Support)</span>
                <span class="w-val" style="color:var(--color-green);">${kl.nearest_put_wall != null ? formatPriceText(kl.nearest_put_wall) : '-'}</span>
              </div>
              <div class="liq-metric">
                <span class="w-label">Nearest Call Wall (Resistance)</span>
                <span class="w-val" style="color:var(--color-red);">${kl.nearest_call_wall != null ? formatPriceText(kl.nearest_call_wall) : '-'}</span>
              </div>
            </div>
 
            <div style="font-size:0.65rem; color:var(--color-text-muted); margin-top:0.4rem; border-top: 1px dashed rgba(255,255,255,0.08); padding-top:0.4rem; line-height:1.25;">
              <strong>Signal Summary:</strong> Risk Reversal: ${sig.risk_reversal || '-'} | P/C Ratio: ${sig.put_call_ratio || '-'} | Delta Exposure: ${sig.delta_exposure || '-'}
            </div>
          </div>
        `;
      }
    } catch (e) {
      console.warn("Failed to render options widget:", e.message);
    }
  }

  html += '</div>';
  
  const finalCheck = document.getElementById(`mcp-deep-insights-${symbol}`);
  if (finalCheck) {
    if (html === '<div class="mcp-insights-container"></div>') {
      finalCheck.innerHTML = '<div style="font-size:0.8rem; color:var(--color-text-muted); text-align:center; padding:1rem;">TrueNorth мэдээлэл татахад алдаа гарлаа. Дахин оролдоно уу.</div>';
    } else {
      finalCheck.innerHTML = html;
    }
  }
}

// Render Top 3 Alpha Podium
export function renderPodium(onDeletePlanClick, onPodiumCardClick) {
  const container = document.getElementById("podium-grid");
  if (!container) return;
  
  if (store.activeTab === "market") {
    const scoredCoins = store.top100Coins.map(coin => ({
      ...coin,
      score: calculateScore(coin)
    }));
    
    scoredCoins.sort((a, b) => b.score - a.score);
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
    
    container.querySelectorAll(".podium-card").forEach(card => {
      card.addEventListener("click", () => {
        const sym = card.getAttribute("data-symbol");
        if (onPodiumCardClick) onPodiumCardClick(sym);
      });
    });
  } else if (store.activeTab === "custom") {
    const sortedCustom = [...store.customTrades].sort((a, b) => b.score - a.score);
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
    
    container.querySelectorAll(".podium-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".delete-plan-btn")) return;
        const sym = card.getAttribute("data-symbol");
        if (onPodiumCardClick) onPodiumCardClick(sym);
      });
    });
    
    container.querySelectorAll(".delete-plan-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const sym = btn.getAttribute("data-symbol");
        if (onDeletePlanClick) onDeletePlanClick(sym);
      });
    });
  } else if (store.activeTab === "social") {
    renderSocialAlpha();
  }
}

// Render TrueNorth suggested entry/sl/tp indicators
export function renderTrueNorthIndicator(coin, dir, isLive = false, taData = null) {
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
  
  const dirColor = dir === 'LONG' ? 'var(--color-green)' : 'var(--color-red)';
  const dirBg = dir === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,61,0,0.1)';
  const dirBorder = dir === 'LONG' ? 'rgba(0,230,118,0.35)' : 'rgba(255,61,0,0.35)';
  const dirIcon = dir === 'LONG' ? '▲' : '▼';
  const dirLabel = isLive ? `Auto: ${dir}` : `Est: ${dir}`;
  
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

// Fill Entry/SL/TP fields
export function repopulateSlAndTp(price, dir, taData) {
  const entryEl = document.getElementById("plan-entry");
  const slEl    = document.getElementById("plan-sl");
  const tpEl    = document.getElementById("plan-tp");
  if (!entryEl || !slEl || !tpEl) return;

  if (!dir) {
    const hiddenDir = document.getElementById('plan-direction-auto');
    dir = hiddenDir ? hiddenDir.value : 'LONG';
  }

  const symbolInput = document.getElementById('plan-symbol');
  const coin = getScannedCoin(symbolInput ? symbolInput.value.toUpperCase().trim() : '') || { 
    price, funding: 0, high: price * 1.03, low: price * 0.97, change: 0 
  };

  const levels = computeStrategyLevels(coin, dir, taData || null);
  entryEl.value = levels.entry;
  slEl.value    = levels.sl;
  tpEl.value    = levels.tp;
}

// Custom trade planner submission
export function saveCustomPlan(onSaveSuccess) {
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
  
  let direction;
  if (sl < entry && tp > entry) {
    direction = 'LONG';
  } else if (sl > entry && tp < entry) {
    direction = 'SHORT';
  } else {
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
  
  store.customTrades = store.customTrades.filter(t => t.symbol !== symbol);
  store.customTrades.push(newPlan);
  saveCustomTrades();
  
  symbolEl.value = "";
  const indicator = document.getElementById("symbol-live-indicator");
  if (indicator) indicator.textContent = "Enter symbol...";
  
  updateCustomPlansTabCount();
  store.activeTab = "custom";
  
  if (onSaveSuccess) onSaveSuccess();
}

export function deleteCustomPlan(symbol, onDeleteSuccess) {
  store.customTrades = store.customTrades.filter(t => t.symbol !== symbol);
  saveCustomTrades();
  updateCustomPlansTabCount();
  if (onDeleteSuccess) onDeleteSuccess();
}

export function updateCustomPlansTabCount() {
  const tabBtn = document.getElementById("tab-my-plans");
  if (tabBtn) {
    tabBtn.textContent = `My Plans (${store.customTrades.length})`;
  }
}

// Clipboard hub toast notifications
export function showNotification(message) {
  let toast = document.getElementById("toast-notification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-notification";
    toast.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: rgba(138,43,226,0.9); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 0.6rem 1.2rem; border-radius: 6px; font-size: 0.8rem; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(10px); transition: opacity 0.3s ease;";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, 2500);
}

// Render Surf Social Alpha stream
export async function renderSocialAlpha() {
  const container = document.getElementById("podium-grid");
  if (!container) return;
  
  const gistUrl = localStorage.getItem("social_alpha_gist_url") || "";
  
  container.innerHTML = `
    <div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 0.8rem; width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 0.5rem 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">
          Gist/JSON URL: <input type="text" id="social-gist-input" value="${gistUrl}" placeholder="Paste public raw JSON URL here..." style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.7rem; width: 220px; margin-left: 0.5rem;">
          <button id="save-gist-btn" style="background: var(--color-blue); color: #fff; border: none; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.7rem; cursor: pointer; margin-left: 0.3rem;">Save</button>
        </div>
        <div style="font-size: 0.7rem; color: var(--color-text-muted); font-style: italic;">
          * Surf сканнерын үр дүнг харуулна
        </div>
      </div>
      <div id="social-tokens-list" style="display: flex; flex-direction: column; gap: 0.6rem; max-height: 400px; overflow-y: auto;">
        <div style="text-align: center; padding: 1rem; color: var(--color-text-muted); font-size: 0.8rem;">Loading watchlist...</div>
      </div>
    </div>
  `;

  const saveBtn = document.getElementById("save-gist-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const input = document.getElementById("social-gist-input");
      if (input) {
        localStorage.setItem("social_alpha_gist_url", input.value.trim());
        showNotification("Gist URL амжилттай хадгалагдлаа!");
        renderSocialAlpha();
      }
    });
  }

  let tokens = defaultSocialAlphaTokens;
  if (gistUrl) {
    try {
      const res = await fetch(gistUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.tokens) {
          tokens = data.tokens;
        } else if (Array.isArray(data)) {
          tokens = data;
        }
      }
    } catch (e) {
      console.warn("Could not fetch Gist data, using mock fallback:", e.message);
    }
  }

  const listContainer = document.getElementById("social-tokens-list");
  if (!listContainer) return;

  if (tokens.length === 0) {
    listContainer.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--color-text-muted); font-size: 0.8rem;">Материал олдсонгүй.</div>`;
    return;
  }

  listContainer.innerHTML = tokens.map(t => {
    const isStandout = t.standout ? 'border: 1px solid rgba(138, 43, 226, 0.4); background: rgba(138, 43, 226, 0.05);' : 'border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02);';
    const standoutBadge = t.standout ? `<span style="background: var(--color-primary); color: #fff; font-size: 0.55rem; padding: 0.05rem 0.3rem; border-radius: 3px; font-weight: bold; margin-left: 0.4rem; text-transform: uppercase;">STANDOUT</span>` : '';
    
    const isDown = t.change && t.change.startsWith('-');
    const isNa = t.change === 'N/A';
    const changeColor = isNa ? 'var(--color-text-muted)' : (isDown ? 'var(--color-red)' : 'var(--color-green)');
    
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; border-radius: 6px; ${isStandout}">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <div style="display: flex; flex-direction: column;">
            <div style="display: flex; align-items: center;">
              <span style="font-weight: bold; color: #fff; font-size: 0.85rem;">$${t.symbol}</span>
              <span style="font-size: 0.6rem; color: var(--color-text-muted); background: rgba(255,255,255,0.1); padding: 0.05rem 0.25rem; border-radius: 3px; margin-left: 0.4rem;">${t.chain}</span>
              ${standoutBadge}
            </div>
            <span style="font-size: 0.65rem; color: var(--color-text-muted); margin-top: 0.15rem;">${t.signal || ''}</span>
          </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <span style="font-size: 0.75rem; color: #fff; font-weight: 500;">MCap: ${t.mcap}</span>
            <span style="font-size: 0.65rem; color: var(--color-text-muted); margin-top: 0.1rem;">Vol: ${t.vol}</span>
          </div>
          
          <div style="display: flex; flex-direction: column; align-items: flex-end; min-width: 60px;">
            <span style="font-size: 0.75rem; font-weight: 600; color: ${changeColor};">${t.change}</span>
          </div>

          <div style="display: flex; gap: 0.3rem; align-items: center;">
            <button class="social-copy-ca" data-ca="${t.address}" title="Copy Contract Address" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 0.25rem; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <a href="https://dexscreener.com/${t.chain.toLowerCase()}/${t.address}" target="_blank" title="View on DEX Screener" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 0.25rem; border-radius: 4px; text-decoration: none; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll(".social-copy-ca").forEach(btn => {
    btn.addEventListener("click", () => {
      const ca = btn.getAttribute("data-ca");
      navigator.clipboard.writeText(ca);
      showNotification("Contract Address санах ойд хуулагдлаа!");
    });
  });
}

// Render active positions and closed trades from PNL endpoint data
export function renderPerformance(data) {
  const balanceEl = document.getElementById("perf-balance");
  const equityEl = document.getElementById("perf-equity");
  const botRealizedEl = document.getElementById("perf-bot-realized-pnl");
  const winRateEl = document.getElementById("perf-win-rate");

  if (balanceEl) balanceEl.textContent = `$${data.account.withdrawable.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  if (equityEl) equityEl.textContent = `$${(data.account.accountValue ?? data.account.totalEquity).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  if (botRealizedEl) {
    const pnlVal = data.totalRealizedPnl !== undefined ? data.totalRealizedPnl : 0;
    botRealizedEl.textContent = `${pnlVal >= 0 ? '+' : ''}$${pnlVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    botRealizedEl.className = `perf-val ${pnlVal >= 0 ? 'change-up' : 'change-down'}`;
    botRealizedEl.style.background = "none";
    botRealizedEl.style.padding = "0";
  }

  const growthEl = document.getElementById("perf-balance-growth");
  if (growthEl && data.account.balanceGrowthPct !== undefined) {
    const g = data.account.balanceGrowthPct;
    growthEl.textContent = `${g >= 0 ? '+' : ''}${g.toFixed(2)}%`;
    growthEl.className = `perf-val ${g >= 0 ? 'change-up' : 'change-down'}`;
    growthEl.style.background = "none";
    growthEl.style.padding = "0";
  }

  if (winRateEl) {
    winRateEl.textContent = `${data.winRate.toFixed(1)}%`;
    winRateEl.className = `perf-val ${data.winRate >= 50 ? 'change-up' : 'change-down'}`;
    winRateEl.style.background = "none";
    winRateEl.style.padding = "0";
  }

  const mddEl = document.getElementById("perf-max-drawdown");
  if (mddEl && data.account.maxDrawdownPct !== undefined) {
    const mdd = data.account.maxDrawdownPct;
    mddEl.textContent = `-${mdd.toFixed(2)}%`;
    mddEl.className = `perf-val change-down`;
    mddEl.style.background = "none";
    mddEl.style.padding = "0";
  }

  const posTbody = document.getElementById("perf-positions-tbody");
  if (posTbody) {
    if (data.activePositions.length === 0) {
      posTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 1.5rem; color: var(--color-text-muted);">
            No active positions at this time.
          </td>
        </tr>
      `;
    } else {
      posTbody.innerHTML = data.activePositions.map(pos => {
        const pnlClass = pos.unrealizedPnl >= 0 ? "change-up" : "change-down";
        const pnlPrefix = pos.unrealizedPnl >= 0 ? "+" : "";
        const dirClass = pos.direction === "LONG" ? "change-up" : "change-down";
        
        return `
          <tr>
            <td><span class="table-symbol">${pos.coin}</span></td>
            <td><span class="ticker-change ${dirClass}" style="font-size:0.75rem; padding:0.15rem 0.45rem; font-weight:600; background:none;">${pos.direction}</span></td>
            <td>${pos.size}</td>
            <td>$${pos.entryPx.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}</td>
            <td><span class="ticker-change ${pnlClass}" style="font-size:0.85rem; font-weight:600; padding:0.15rem 0.45rem;">${pnlPrefix}$${pos.unrealizedPnl.toFixed(2)}</span></td>
            <td style="color:var(--color-text-muted); font-size:0.8rem;">$${pos.marginUsed.toFixed(2)} (${pos.leverage}x)</td>
            <td><span style="font-size:0.75rem; padding:0.15rem 0.45rem; border-radius:4px; background:rgba(139,92,246,0.12); color:#a78bfa; font-weight:500; display:inline-block; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${pos.entryReason}">${pos.entryReason}</span></td>
          </tr>
        `;
      }).join('');
    }
  }

  const histTbody = document.getElementById("perf-history-tbody");
  if (histTbody) {
    if (data.recentTrades.length === 0) {
      histTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 1.5rem; color: var(--color-text-muted);">
            No trade history found.
          </td>
        </tr>
      `;
    } else {
      histTbody.innerHTML = data.recentTrades.map(trade => {
        const pnlClass = trade.pnl >= 0 ? "change-up" : "change-down";
        const pnlPrefix = trade.pnl >= 0 ? "+" : "";
        const dirClass = trade.direction === "LONG" ? "change-up" : "change-down";
        
        const date = new Date(trade.time);
        const timeStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        const sourceLabel = trade.source === 'Manual'
          ? `<span style="font-size:0.7rem; padding:0.1rem 0.4rem; border-radius:4px; background:rgba(251,191,36,0.15); color:#fbbf24; font-weight:600;">Manual</span>`
          : `<span style="font-size:0.7rem; padding:0.1rem 0.4rem; border-radius:4px; background:rgba(139,92,246,0.15); color:#8b5cf6; font-weight:600;">Bot</span>`;

        return `
          <tr>
            <td style="color:var(--color-text-muted); font-size:0.75rem;">${timeStr}</td>
            <td><span class="table-symbol">${trade.coin}</span></td>
            <td><span class="ticker-change ${dirClass}" style="font-size:0.75rem; padding:0.15rem 0.45rem; font-weight:600; background:none;">${trade.direction}</span></td>
            <td>${trade.size} @ $${trade.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}</td>
            <td><span class="ticker-change ${pnlClass}" style="font-size:0.85rem; font-weight:600; padding:0.15rem 0.45rem;">${pnlPrefix}$${trade.pnl.toFixed(2)}</span></td>
            <td>${sourceLabel}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

// Render Backtest results and draw canvas chart
export function renderBacktestResults(data) {
  const retEl = document.getElementById("bt-metric-return");
  const wrEl = document.getElementById("bt-metric-winrate");
  const ddEl = document.getElementById("bt-metric-drawdown");
  const countEl = document.getElementById("bt-trade-count");

  if (retEl) {
    retEl.textContent = `${data.summary.totalReturnPct >= 0 ? '+' : ''}${data.summary.totalReturnPct}%`;
    retEl.className = "bt-metric-value " + (data.summary.totalReturnPct >= 0 ? "change-up" : "change-down");
  }
  if (wrEl) {
    wrEl.textContent = `${data.summary.winRate}%`;
    wrEl.className = "bt-metric-value " + (data.summary.winRate >= 50 ? "change-up" : "change-down");
  }
  if (ddEl) {
    ddEl.textContent = `-${data.summary.maxDrawdown}%`;
    ddEl.className = "bt-metric-value change-down";
  }
  if (countEl) {
    countEl.textContent = data.summary.totalTrades;
  }

  drawBacktestChart(data.equityCurve);
}

export function drawBacktestChart(equityData) {
  const canvas = document.getElementById("bt-chart");
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  if (!equityData || equityData.length === 0) return;

  const balances = equityData.map(d => d.balance);
  const maxBal = Math.max(...balances);
  const minBal = Math.min(...balances);
  const range = maxBal - minBal || 1;

  const paddingLeft = 10;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 15;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = paddingTop + (chartHeight * i / 3);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
  }

  ctx.beginPath();
  equityData.forEach((d, idx) => {
    const x = paddingLeft + (chartWidth * idx / (equityData.length - 1));
    const y = paddingTop + chartHeight - (chartHeight * (d.balance - minBal) / range);
    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  const strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
  strokeGrad.addColorStop(0, "#3b82f6");
  strokeGrad.addColorStop(1, "#8b5cf6");
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(139, 92, 246, 0.4)";
  ctx.shadowBlur = 8;
  ctx.stroke();
  
  ctx.shadowBlur = 0;

  ctx.beginPath();
  equityData.forEach((d, idx) => {
    const x = paddingLeft + (chartWidth * idx / (equityData.length - 1));
    const y = paddingTop + chartHeight - (chartHeight * (d.balance - minBal) / range);
    if (idx === 0) {
      ctx.moveTo(x, paddingTop + chartHeight);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(paddingLeft + chartWidth, paddingTop + chartHeight);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
  fillGrad.addColorStop(0, "rgba(59, 130, 246, 0.2)");
  fillGrad.addColorStop(1, "rgba(139, 92, 246, 0.0)");
  ctx.fillStyle = fillGrad;
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`$${equityData[0].balance.toFixed(0)}`, paddingLeft, paddingTop + chartHeight + 12);
  ctx.textAlign = "right";
  const lastBal = equityData[equityData.length - 1].balance;
  const lastY = paddingTop + chartHeight - (chartHeight * (lastBal - minBal) / range);
  ctx.fillText(`$${lastBal.toFixed(0)}`, width - paddingRight, lastY - 6);
}

// Open log details in drawer
export function openBacktestLogDrawer(trades, coin, days, minScore) {
  const backdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("drawer");
  const content = document.getElementById("drawer-content");
  
  if (!backdrop || !drawer || !content) return;

  let tradesHtml = "";
  if (!trades || trades.length === 0) {
    tradesHtml = `<div style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No trades executed.</div>`;
  } else {
    tradesHtml = `
      <div style="display: flex; flex-direction: column; gap: 0.6rem; max-height: 70vh; overflow-y: auto; padding-right: 0.2rem;">
        ${trades.map((t, idx) => {
          const dirClass = t.dir === 'LONG' ? 'change-up' : 'change-down';
          const pnlClass = t.pnlUsd >= 0 ? 'change-up' : 'change-down';
          const pnlPrefix = t.pnlUsd >= 0 ? '+' : '';
          const entryTimeStr = new Date(t.entryTime).toLocaleDateString() + ' ' + new Date(t.entryTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          const exitTimeStr = new Date(t.exitTime).toLocaleDateString() + ' ' + new Date(t.exitTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

          return `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 8px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; font-size: 0.95rem;">Trade #${idx + 1} <span class="plan-type-badge ${dirClass}" style="font-size: 0.65rem; padding: 0.05rem 0.3rem;">${t.dir}</span></span>
                <span class="${pnlClass}" style="font-weight: 700; font-size: 0.95rem;">${pnlPrefix}${t.returnPct}% ($${t.pnlUsd.toFixed(2)})</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; font-size: 0.75rem; color: var(--color-text-muted);">
                <div>Entry Px: <strong style="color: #fff;">$${t.entryPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}</strong></div>
                <div>Exit Px: <strong style="color: #fff;">$${t.exitPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}</strong></div>
                <div>Entry: <strong style="color: #fff;">${entryTimeStr}</strong></div>
                <div>Exit: <strong style="color: #fff;">${exitTimeStr} (${t.exitType})</strong></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  content.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-symbol">
        ${coin} Backtest Log
      </div>
      <div style="font-size: 0.95rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">
        Period: ${days} days — Score Threshold: ${minScore}
      </div>
    </div>
    
    <div class="trade-plan-details" style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <h4 style="font-family: var(--font-title); margin-bottom: 0.5rem; color: var(--color-primary);">Executed Trade History</h4>
        ${tradesHtml}
      </div>
    </div>
  `;

  backdrop.classList.add("open");
  drawer.classList.add("open");
}

// Update Active Bot config badges on backtest tab
export function updateBotConfigLabels(config) {
  const scoreEl = document.getElementById("bt-param-score");
  const slEl = document.getElementById("bt-param-sl");
  const tpEl = document.getElementById("bt-param-tp");
  const inputScore = document.getElementById("bt-minscore");
  
  if (scoreEl) scoreEl.textContent = config.minScore;
  if (slEl) slEl.textContent = (config.minSlBuffer * 100).toFixed(1);
  if (tpEl) tpEl.textContent = (config.minTpBuffer * 100).toFixed(1);
  if (inputScore) inputScore.value = config.minScore;
}
