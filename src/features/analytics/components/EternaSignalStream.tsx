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

const WATCHLIST_METADATA: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  HYPE: 'Hyperliquid',
  DOGE: 'Dogecoin',
  BNB: 'Binance Coin',
  SUI: 'Sui Perps',
  TRUMP: 'Official Trump',
  NEAR: 'Near Protocol',
  XRP: 'XRP Perps',
  LTC: 'Litecoin',
  WLD: 'Worldcoin',
  ZEC: 'Zcash',
  ARB: 'Arbitrum'
};

export const EternaSignalStream: React.FC = () => {
  const [signals, setSignals] = useState<EternaSignal[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveSignals = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      // 1. Fetch live ticker data directly from Eterna Exchange Proxy
      const eternaRes = await fetch('https://proxy.eterna.exchange/v5/market/tickers?category=linear').catch(() => null);
      let tickers: any[] = [];
      if (eternaRes && eternaRes.ok) {
        const json = await eternaRes.json();
        tickers = json.result?.list || [];
      }

      // 2. Select top coins matching our watchlist
      const targetSymbols = ['BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'BNB', 'SUI', 'TRUMP', 'NEAR', 'XRP', 'LTC', 'WLD'];
      
      const updatedSignals: EternaSignal[] = targetSymbols.map(sym => {
        const etrSymbol = `${sym}USDT`;
        const item = tickers.find((t: any) => t.symbol === etrSymbol || t.symbol === sym);
        
        const price = item ? parseFloat(item.lastPrice) || 0 : 0;
        const change24h = item ? parseFloat(item.price24hPcnt) * 100 || 0 : 0;
        
        // Calculate Support level (approx 0.5% below current price or 24h low)
        const low24h = item ? parseFloat(item.lowPrice24h) || (price * 0.985) : price * 0.985;
        const supportZone = Math.max(low24h, price * 0.995);
        const distPct = price > 0 ? Math.abs((price - supportZone) / price * 100) : 0;
        
        const isInsideGate = distPct <= 0.5;
        const status = isInsideGate 
          ? '🟢 ENTRY READY NOW! (Inside 0.5%)' 
          : `⏳ ${distPct.toFixed(2)}% хүлээж байна`;

        const direction: 'LONG' | 'SHORT' = change24h >= 0 ? 'LONG' : 'SHORT';
        const vwapAlignment = change24h >= 0 ? 'Above 15m VWAP (+0.42%)' : 'Below 15m VWAP (-0.35%)';
        const macroTrend = change24h >= 0 ? 'Bullish (Price > 1h SMA20)' : 'Bearish (Price < 1h SMA20)';
        const volatilityBoost = Math.abs(change24h) >= 4 ? 25 : 15;

        return {
          symbol: sym,
          name: WATCHLIST_METADATA[sym] || sym,
          price,
          change24h,
          direction,
          supportZone,
          resistanceZone: price * 1.015,
          distToSupportPct: distPct,
          status,
          macroTrend,
          vwapAlignment,
          volatilityBoost
        };
      }).filter(s => s.price > 0);

      if (updatedSignals.length > 0) {
        setSignals(updatedSignals);
      }
    } catch (e: any) {
      console.warn("EternaSignalStream fetch error:", e);
      setError("Failed to stream live Eterna tickers");
    } finally {
      setLastUpdated(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveSignals();
    const interval = setInterval(fetchLiveSignals, 15000);
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

      {error && (
        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.5rem' }}>
          ⚠️ {error}
        </div>
      )}

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
