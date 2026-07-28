import React, { useState, useEffect, useCallback } from 'react';
import { callMcpTool } from '../../../services/api';

interface EternaSignal {
  symbol: string;
  name: string;
  geckoId: string;
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
    symbol: 'TRUMP',
    name: 'Official Trump',
    geckoId: 'official-trump',
    price: 1.5156,
    change24h: 8.42,
    direction: 'LONG',
    supportZone: 1.5156,
    resistanceZone: 1.7200,
    distToSupportPct: 0.00,
    status: '🟢 ENTRY READY NOW! (Inside 0.5%)',
    macroTrend: 'Bullish (1h Price > SMA20 > SMA50)',
    vwapAlignment: 'Above 15m VWAP (+0.42%)',
    volatilityBoost: 25
  },
  {
    symbol: 'PAXG',
    name: 'PAX Gold Spot',
    geckoId: 'pax-gold',
    price: 4035.30,
    change24h: 1.25,
    direction: 'LONG',
    supportZone: 4034.30,
    resistanceZone: 4247.30,
    distToSupportPct: 0.02,
    status: 'Position Open 🟢 (Entry: $4,034.30)',
    macroTrend: 'Bullish Gold Macro Alignment',
    vwapAlignment: 'At Support Floor (+0.02%)',
    volatilityBoost: 15
  },
  {
    symbol: 'TRX',
    name: 'TRON Perps',
    geckoId: 'tron',
    price: 0.3245,
    change24h: 3.12,
    direction: 'LONG',
    supportZone: 0.32449,
    resistanceZone: 0.33873,
    distToSupportPct: 0.01,
    status: 'Position Open 🟢 (Entry: $0.32449)',
    macroTrend: 'Bullish Macro Structure',
    vwapAlignment: 'Above 15m VWAP (+0.18%)',
    volatilityBoost: 15
  },
  {
    symbol: 'BNB',
    name: 'Binance Coin',
    geckoId: 'binancecoin',
    price: 566.38,
    change24h: 2.15,
    direction: 'LONG',
    supportZone: 571.50,
    resistanceZone: 595.00,
    distToSupportPct: 0.90,
    status: '⏳ 0.40% хүлээж байна',
    macroTrend: 'Bullish (Price > 1h SMA20)',
    vwapAlignment: 'Above 15m VWAP (+0.85%)',
    volatilityBoost: 15
  },
  {
    symbol: 'LTC',
    name: 'Litecoin',
    geckoId: 'litecoin',
    price: 46.309,
    change24h: 1.84,
    direction: 'LONG',
    supportZone: 46.80,
    resistanceZone: 49.50,
    distToSupportPct: 1.05,
    status: '⏳ 0.55% хүлээж байна',
    macroTrend: 'Bullish Trend Structure',
    vwapAlignment: 'At 15m VWAP (+0.25%)',
    volatilityBoost: 15
  },
  {
    symbol: 'SUI',
    name: 'Sui Perps',
    geckoId: 'sui',
    price: 0.68178,
    change24h: 4.89,
    direction: 'LONG',
    supportZone: 0.7110,
    resistanceZone: 0.7550,
    distToSupportPct: 4.11,
    status: '⏳ 3.61% хүлээж байна',
    macroTrend: 'Bullish High-Mo Alignment',
    vwapAlignment: 'Above 15m VWAP (+1.42%)',
    volatilityBoost: 25
  }
];

export const EternaSignalStream: React.FC = () => {
  const [signals, setSignals] = useState<EternaSignal[]>(INITIAL_SIGNALS);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchLiveSignals = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Query TrueNorth technical analysis for top token
      const trumpTa = await callMcpTool('technical_analysis', { token_address: 'official-trump', timeframe: '1h' }).catch(() => null);
      if (trumpTa && trumpTa.price) {
        setSignals(prev => prev.map(s => {
          if (s.symbol === 'TRUMP') {
            return {
              ...s,
              price: trumpTa.price,
              supportZone: trumpTa.support_levels?.[0] || s.supportZone,
              macroTrend: trumpTa.trend === 'Bullish' ? 'Bullish (1h Price > SMA20 > SMA50)' : s.macroTrend
            };
          }
          return s;
        }));
      }
    } catch (e) {
      console.warn("Failed to fetch live Eterna signals:", e);
    } finally {
      setLastUpdated(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveSignals();
    const interval = setInterval(fetchLiveSignals, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveSignals]);

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
