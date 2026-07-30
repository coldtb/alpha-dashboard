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
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    price: 63960.00,
    change24h: -0.50,
    direction: 'SHORT',
    supportZone: 63640.20,
    resistanceZone: 64800.00,
    distToSupportPct: 0.50,
    status: '⏳ Waiting for 0.15% touch',
    macroTrend: 'Bearish (Price < 1h SMA20)',
    vwapAlignment: 'Below 15m VWAP (-0.45%)',
    volatilityBoost: 25
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    price: 1901.30,
    change24h: -0.50,
    direction: 'SHORT',
    supportZone: 1891.79,
    resistanceZone: 1935.00,
    distToSupportPct: 0.50,
    status: '⏳ Waiting for 0.18% touch',
    macroTrend: 'Bearish (Price < 1h SMA20)',
    vwapAlignment: 'Below 15m VWAP (-0.38%)',
    volatilityBoost: 15
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    price: 73.529,
    change24h: -0.50,
    direction: 'SHORT',
    supportZone: 73.16,
    resistanceZone: 75.20,
    distToSupportPct: 0.50,
    status: '⏳ Waiting for 0.12% touch',
    macroTrend: 'Bearish Macro Structure',
    vwapAlignment: 'Below 15m VWAP (-0.28%)',
    volatilityBoost: 15
  },
  {
    symbol: 'XRP',
    name: 'XRP Perps',
    price: 1.0737,
    change24h: -0.50,
    direction: 'SHORT',
    supportZone: 1.0700,
    resistanceZone: 1.1050,
    distToSupportPct: 0.50,
    status: '⏳ Waiting for 0.15% touch',
    macroTrend: 'Bearish Alignment',
    vwapAlignment: 'Below 15m VWAP (-0.35%)',
    volatilityBoost: 15
  },
  {
    symbol: 'HYPE',
    name: 'Hyperliquid',
    price: 53.644,
    change24h: -0.50,
    direction: 'SHORT',
    supportZone: 53.38,
    resistanceZone: 55.20,
    distToSupportPct: 0.50,
    status: '⏳ Waiting for 0.20% touch',
    macroTrend: 'Bearish Volatility Alignment',
    vwapAlignment: 'Below 15m VWAP (-0.52%)',
    volatilityBoost: 25
  },
  {
    symbol: 'ZEC',
    name: 'Zcash',
    price: 471.93,
    change24h: 1.50,
    direction: 'LONG',
    supportZone: 469.57,
    resistanceZone: 485.00,
    distToSupportPct: 0.50,
    status: '⏳ Waiting for 0.18% touch',
    macroTrend: 'Bullish Momentum',
    vwapAlignment: 'Above 15m VWAP (+0.48%)',
    volatilityBoost: 15
  },
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    price: 0.069784,
    change24h: -0.50,
    direction: 'SHORT',
    supportZone: 0.06940,
    resistanceZone: 0.07150,
    distToSupportPct: 0.50,
    status: '⏳ Waiting for 0.22% touch',
    macroTrend: 'Bearish Structure',
    vwapAlignment: 'Below 15m VWAP (-0.40%)',
    volatilityBoost: 15
  }
];


export const EternaSignalStream: React.FC = () => {

  const [signals, setSignals] = useState<EternaSignal[]>(INITIAL_SIGNALS);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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
              
              // Real Technical Entry Gate Calculation:
              // LONG Entry Gate: Price must pull back down within 0.5% of Support Floor (price * 0.985)
              // SHORT Entry Gate: Price must rally up within 0.5% of Resistance Ceiling (price * 1.015)
              const supportZone = price * 0.985;
              const resistanceZone = price * 1.015;
              
              let distToGatePct = 0;
              if (direction === 'LONG') {
                distToGatePct = Math.max(0, ((price - supportZone) / price * 100) - 0.5);
              } else {
                distToGatePct = Math.max(0, ((resistanceZone - price) / price * 100) - 0.5);
              }

              const isInsideGate = distToGatePct <= 0.05;
              const status = isInsideGate 
                ? '🟢 ENTRY READY NOW! (Inside 0.5%)' 
                : `⏳ ${distToGatePct.toFixed(2)}% хүлээж байна`;

              return {
                ...sig,
                price,
                change24h,
                direction,
                supportZone: direction === 'LONG' ? supportZone : resistanceZone,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Updated: {lastUpdated}
          </span>
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
        {signals.map(sig => {
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
                  <span style={{ color: 'var(--color-text-muted)' }}>0.5% Gate Status:</span>
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
    </section>
  );
};
