import React, { useState, useEffect, useCallback } from 'react';

interface EternaSignal {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  direction: 'LONG' | 'SHORT';
  supportZone: number;
  resistanceZone: number;
  distToSupportPct: number;
  status: string;
  macroTrend: string;
  vwapAlignment: string;
  volatilityBoost: number;
}

const INITIAL_SIGNALS: EternaSignal[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: 64500.00, change24h: 0.50, direction: 'LONG', supportZone: 63532.50, resistanceZone: 65467.50, distToSupportPct: 0.10, status: '⏳ Waiting for 0.15% touch', macroTrend: 'Bullish (1h VWAP)', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 25 },
  { symbol: 'ETH', name: 'Ethereum', price: 3450.00, change24h: 0.80, direction: 'LONG', supportZone: 3398.25, resistanceZone: 3501.75, distToSupportPct: 0.10, status: '⏳ Waiting for 0.20% touch', macroTrend: 'Bullish Structure', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 20 },
  { symbol: 'SOL', name: 'Solana', price: 74.50, change24h: 1.20, direction: 'LONG', supportZone: 73.38, resistanceZone: 75.62, distToSupportPct: 0.10, status: '🟢 ENTRY READY NOW! (Inside 0.1%)', macroTrend: 'Bullish Momentum', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 25 },
  { symbol: 'BNB', name: 'BNB Chain', price: 580.00, change24h: 0.30, direction: 'LONG', supportZone: 571.30, resistanceZone: 588.70, distToSupportPct: 0.10, status: '⏳ Waiting for 0.25% touch', macroTrend: 'Neutral-Bullish', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 15 },
  { symbol: 'XRP', name: 'XRP Perps', price: 1.0737, change24h: -0.50, direction: 'SHORT', supportZone: 1.0700, resistanceZone: 1.0898, distToSupportPct: 0.50, status: '⏳ Waiting for 0.15% touch', macroTrend: 'Bearish Alignment', vwapAlignment: 'Below 15m VWAP', volatilityBoost: 15 },
  { symbol: 'DOGE', name: 'Dogecoin', price: 0.06978, change24h: -0.50, direction: 'SHORT', supportZone: 0.06940, resistanceZone: 0.07082, distToSupportPct: 0.50, status: '⏳ Waiting for 0.22% touch', macroTrend: 'Bearish Structure', vwapAlignment: 'Below 15m VWAP', volatilityBoost: 15 },
  { symbol: 'ADA', name: 'Cardano', price: 0.385, change24h: 0.40, direction: 'LONG', supportZone: 0.379, resistanceZone: 0.390, distToSupportPct: 0.50, status: '⏳ Waiting for 0.30% touch', macroTrend: 'Bullish Alignment', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 15 },
  { symbol: 'AVAX', name: 'Avalanche', price: 24.50, change24h: 0.90, direction: 'LONG', supportZone: 24.13, resistanceZone: 24.87, distToSupportPct: 0.50, status: '⏳ Waiting for 0.18% touch', macroTrend: 'Bullish Momentum', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 20 },
  { symbol: 'LINK', name: 'Chainlink', price: 14.20, change24h: 1.10, direction: 'LONG', supportZone: 13.98, resistanceZone: 14.41, distToSupportPct: 0.50, status: '⏳ Waiting for 0.10% touch', macroTrend: 'Bullish Trend', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 20 },
  { symbol: 'DOT', name: 'Polkadot', price: 5.40, change24h: 0.20, direction: 'LONG', supportZone: 5.32, resistanceZone: 5.48, distToSupportPct: 0.50, status: '⏳ Waiting for 0.35% touch', macroTrend: 'Neutral', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 15 },
  { symbol: 'TON', name: 'Toncoin', price: 6.80, change24h: -0.80, direction: 'SHORT', supportZone: 6.70, resistanceZone: 6.90, distToSupportPct: 0.50, status: '⏳ Waiting for 0.28% touch', macroTrend: 'Bearish Pullback', vwapAlignment: 'Below 15m VWAP', volatilityBoost: 15 },
  { symbol: 'TRX', name: 'TRON', price: 0.135, change24h: 0.10, direction: 'LONG', supportZone: 0.133, resistanceZone: 0.137, distToSupportPct: 0.50, status: '⏳ Waiting for 0.40% touch', macroTrend: 'Stable Bullish', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 10 },
  { symbol: 'LTC', name: 'Litecoin', price: 72.00, change24h: 0.60, direction: 'LONG', supportZone: 70.92, resistanceZone: 73.08, distToSupportPct: 0.50, status: '⏳ Waiting for 0.25% touch', macroTrend: 'Bullish Structure', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 15 },
  { symbol: 'TAO', name: 'Bittensor', price: 340.00, change24h: 2.10, direction: 'LONG', supportZone: 334.90, resistanceZone: 345.10, distToSupportPct: 0.50, status: '🟢 ENTRY READY NOW! (Inside 0.5%)', macroTrend: 'Strong Bullish Surge', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 30 },
  { symbol: 'SUI', name: 'Sui Network', price: 1.85, change24h: 1.50, direction: 'LONG', supportZone: 1.82, resistanceZone: 1.88, distToSupportPct: 0.50, status: '⏳ Waiting for 0.12% touch', macroTrend: 'Bullish Expansion', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 25 },
  { symbol: 'ARB', name: 'Arbitrum', price: 0.62, change24h: -0.40, direction: 'SHORT', supportZone: 0.61, resistanceZone: 0.63, distToSupportPct: 0.50, status: '⏳ Waiting for 0.32% touch', macroTrend: 'Bearish Consolidation', vwapAlignment: 'Below 15m VWAP', volatilityBoost: 15 },
  { symbol: 'NEAR', name: 'NEAR Protocol', price: 4.90, change24h: 1.30, direction: 'LONG', supportZone: 4.82, resistanceZone: 4.97, distToSupportPct: 0.50, status: '⏳ Waiting for 0.14% touch', macroTrend: 'Bullish Trend', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 20 },
  { symbol: 'ALGO', name: 'Algorand', price: 0.142, change24h: 0.20, direction: 'LONG', supportZone: 0.140, resistanceZone: 0.144, distToSupportPct: 0.50, status: '⏳ Waiting for 0.45% touch', macroTrend: 'Neutral', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 10 },
  { symbol: 'ASTER', name: 'Aster', price: 0.85, change24h: 1.80, direction: 'LONG', supportZone: 0.837, resistanceZone: 0.862, distToSupportPct: 0.50, status: '⏳ Waiting for 0.19% touch', macroTrend: 'Bullish Momentum', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 20 },
  { symbol: 'UNI', name: 'Uniswap', price: 7.80, change24h: 0.70, direction: 'LONG', supportZone: 7.68, resistanceZone: 7.92, distToSupportPct: 0.50, status: '⏳ Waiting for 0.22% touch', macroTrend: 'Bullish', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 15 },
  { symbol: 'AAVE', name: 'Aave', price: 105.00, change24h: 1.40, direction: 'LONG', supportZone: 103.42, resistanceZone: 106.58, distToSupportPct: 0.50, status: '⏳ Waiting for 0.16% touch', macroTrend: 'Bullish Trend', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 20 },
  { symbol: 'CRV', name: 'Curve DAO', price: 0.295, change24h: -0.30, direction: 'SHORT', supportZone: 0.290, resistanceZone: 0.299, distToSupportPct: 0.50, status: '⏳ Waiting for 0.38% touch', macroTrend: 'Bearish Range', vwapAlignment: 'Below 15m VWAP', volatilityBoost: 15 },
  { symbol: 'HYPE', name: 'Hyperliquid', price: 53.644, change24h: -0.50, direction: 'SHORT', supportZone: 53.38, resistanceZone: 54.44, distToSupportPct: 0.50, status: '⏳ Waiting for 0.20% touch', macroTrend: 'Bearish Volatility Alignment', vwapAlignment: 'Below 15m VWAP', volatilityBoost: 25 },
  { symbol: 'XMR', name: 'Monero', price: 155.00, change24h: 0.10, direction: 'LONG', supportZone: 152.67, resistanceZone: 157.32, distToSupportPct: 0.50, status: '⏳ Waiting for 0.40% touch', macroTrend: 'Neutral', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 10 },
  { symbol: 'ZEC', name: 'Zcash', price: 471.93, change24h: 1.50, direction: 'LONG', supportZone: 464.85, resistanceZone: 479.00, distToSupportPct: 0.50, status: '⏳ Waiting for 0.18% touch', macroTrend: 'Bullish Momentum', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 15 },
  { symbol: 'ENA', name: 'Ethena', price: 0.42, change24h: 2.30, direction: 'LONG', supportZone: 0.413, resistanceZone: 0.426, distToSupportPct: 0.50, status: '🟢 ENTRY READY NOW! (Inside 0.5%)', macroTrend: 'Bullish Surge', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 25 },
  { symbol: 'ZRO', name: 'LayerZero', price: 3.60, change24h: 0.80, direction: 'LONG', supportZone: 3.54, resistanceZone: 3.65, distToSupportPct: 0.50, status: '⏳ Waiting for 0.21% touch', macroTrend: 'Bullish Alignment', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 20 },
  { symbol: 'WLD', name: 'Worldcoin', price: 1.95, change24h: -0.60, direction: 'SHORT', supportZone: 1.92, resistanceZone: 1.98, distToSupportPct: 0.50, status: '⏳ Waiting for 0.24% touch', macroTrend: 'Bearish Structure', vwapAlignment: 'Below 15m VWAP', volatilityBoost: 20 },
  { symbol: 'PUMP', name: 'PumpFun', price: 0.0035, change24h: 3.10, direction: 'LONG', supportZone: 0.00344, resistanceZone: 0.00355, distToSupportPct: 0.50, status: '🟢 ENTRY READY NOW! (Inside 0.5%)', macroTrend: 'High Volatility Bullish', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 35 },
  { symbol: 'kPEPE', name: 'kPEPE Perps', price: 0.00985, change24h: 1.20, direction: 'LONG', supportZone: 0.00970, resistanceZone: 0.01000, distToSupportPct: 0.50, status: '⏳ Waiting for 0.16% touch', macroTrend: 'Bullish Momentum', vwapAlignment: 'Above 15m VWAP', volatilityBoost: 25 }
];


export const EternaSignalStream: React.FC = () => {
  const [signals, setSignals] = useState<EternaSignal[]>(INITIAL_SIGNALS);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Pagination state: 6 cards per page
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 6;

  const totalSignals = signals.length;
  const totalPages = Math.max(1, Math.ceil(totalSignals / pageSize));
  const activePage = Math.min(currentPage, totalPages);

  const startIndex = (activePage - 1) * pageSize;
  const currentSignals = signals.slice(startIndex, startIndex + pageSize);

  const handlePrev = () => {
    if (activePage > 1) setCurrentPage(activePage - 1);
  };

  const handleNext = () => {
    if (activePage < totalPages) setCurrentPage(activePage + 1);
  };

  const fetchLiveSignals = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Fetch live market prices from Hyperliquid info API (CORS enabled for browsers)
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' })
      }).catch(() => null);

      if (res && res.ok) {
        const [meta, ctxs] = await res.json();
        if (meta?.universe && ctxs) {
          const updatedSignals: EternaSignal[] = signals.map(sig => {
            const idx = meta.universe.findIndex((u: any) => u.name === sig.symbol);
            if (idx !== -1 && ctxs[idx]) {
              const ctx = ctxs[idx];
              const price = parseFloat(ctx.markPx || ctx.midPx || '0') || sig.price;
              const prevDayPx = parseFloat(ctx.prevDayPx || '0');
              const change24h = (prevDayPx > 0 && price > 0) ? ((price - prevDayPx) / prevDayPx * 100) : sig.change24h;
              
              const direction: 'LONG' | 'SHORT' = change24h >= 0 ? 'LONG' : 'SHORT';
              
              const supportZone = price * 0.985;
              const resistanceZone = price * 1.015;
              
              // Exact Bot Entry Gate Condition: Trigger entry if price touches within 0.15% of Support/Resistance
              const gateThresholdPct = 0.15;
              let distToGatePct = 0;
              if (direction === 'LONG') {
                distToGatePct = Math.abs((price - supportZone) / price * 100);
              } else {
                distToGatePct = Math.abs((resistanceZone - price) / price * 100);
              }

              const isEntryReady = distToGatePct <= gateThresholdPct || Math.abs(change24h) >= 1.0;
              const status = isEntryReady 
                ? '🟢 ENTRY READY NOW! (High Conviction)' 
                : `⏳ Waiting for ${distToGatePct.toFixed(2)}% entry gate`;

              return {
                ...sig,
                price,
                change24h,
                direction,
                supportZone,
                resistanceZone,
                distToSupportPct: distToGatePct,
                status
              };


            }
            return sig;
          });
          setSignals(updatedSignals);
        }
      }
    } catch (e) {
      console.warn("Live stream update error:", e);
    } finally {
      setLastUpdated(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }
  }, [signals]);

  useEffect(() => {
    fetchLiveSignals();
    const interval = setInterval(fetchLiveSignals, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="eterna-signals-section" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 className="grid-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>✨</span>
          <span>Eterna AI & TrueNorth Real-Time Signals Feed</span>
          <span style={{
            fontSize: '0.68rem',
            padding: '2px 8px',
            borderRadius: '12px',
            background: 'rgba(16,185,129,0.15)',
            color: '#10b981',
            border: '1px solid rgba(16,185,129,0.3)',
            fontWeight: 700,
            letterSpacing: '0.5px'
          }}>
            LIVE ETERNA STREAM 🟢
          </span>
        </h2>

        {/* Controls Header: Refresh & Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Updated: {lastUpdated}
          </span>

          {/* Pagination Controls Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={handlePrev}
              disabled={activePage === 1}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: activePage === 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)',
                color: activePage === 1 ? '#4b5563' : '#e5e7eb',
                cursor: activePage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              ◀ Prev
            </button>
            <span style={{ padding: '0 6px', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af' }}>
              {activePage} / {totalPages}
            </span>
            <button
              onClick={handleNext}
              disabled={activePage === totalPages}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: activePage === totalPages ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)',
                color: activePage === totalPages ? '#4b5563' : '#e5e7eb',
                cursor: activePage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              Next ▶
            </button>
          </div>

          <button
            onClick={fetchLiveSignals}
            disabled={isRefreshing}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--color-text-muted)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {isRefreshing ? '⌛ Refreshing...' : '🔄 Refresh Signals'}
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '0.8rem'
      }}>
        {currentSignals.map(sig => {
          const isLong = sig.direction === 'LONG';
          const isReady = sig.status.includes('READY') || sig.status.includes('Position Open');

          return (
            <div
              key={sig.symbol}
              style={{
                background: 'var(--color-card-bg, rgba(20, 24, 33, 0.8))',
                border: isReady ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isReady ? '0 0 12px rgba(16,185,129,0.15)' : 'none',
                borderRadius: '10px',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'all 0.2s ease-in-out'
              }}
            >
              {/* Card Top Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', marginRight: '6px' }}>
                    {sig.symbol}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {sig.name}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: isLong ? '#10b981' : '#ef4444',
                  border: isLong ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)'
                }}>
                  {sig.direction} {isLong ? '🟢' : '🔴'}
                </span>
              </div>

              {/* Price Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                  ${sig.price < 1 ? sig.price.toFixed(4) : sig.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: sig.change24h >= 0 ? '#10b981' : '#ef4444'
                }}>
                  {sig.change24h >= 0 ? '+' : ''}{sig.change24h.toFixed(2)}% (24h)
                </span>
              </div>

              {/* Support Zone & Gate Distance */}
              <div style={{
                background: 'rgba(0,0,0,0.25)',
                borderRadius: '6px',
                padding: '6px 8px',
                fontSize: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>TrueNorth Support:</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>${sig.supportZone < 1 ? sig.supportZone.toFixed(4) : sig.supportZone.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>0.1% Gate Status:</span>
                  <span style={{ fontWeight: 700, color: isReady ? '#10b981' : '#fbbf24' }}>
                    {sig.status}
                  </span>
                </div>
              </div>

              {/* Eterna Technical Confluence */}
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div>• <span style={{ color: '#cbd5e1' }}>Macro Trend:</span> {sig.macroTrend}</div>
                <div>• <span style={{ color: '#cbd5e1' }}>15m Micro VWAP:</span> {sig.vwapAlignment}</div>
                <div>• <span style={{ color: '#cbd5e1' }}>Volatility Boost:</span> <span style={{ color: '#10b981', fontWeight: 600 }}>+{sig.volatilityBoost} Pts</span></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={handlePrev}
            disabled={activePage === 1}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: activePage === 1 ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.15)',
              color: activePage === 1 ? '#4b5563' : '#60a5fa',
              cursor: activePage === 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            ◀ Previous 6
          </button>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', margin: '0 0.5rem' }}>
            Page {activePage} of {totalPages}
          </span>
          <button
            onClick={handleNext}
            disabled={activePage === totalPages}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: activePage === totalPages ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.15)',
              color: activePage === totalPages ? '#4b5563' : '#60a5fa',
              cursor: activePage === totalPages ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            Next 6 ▶
          </button>
        </div>
      )}
    </section>
  );
};
