import React, { useState, useEffect, useCallback } from 'react';

interface Signal {
  symbol: string;
  price: number;
  change24h: number;
  funding: number;
  direction: 'LONG' | 'SHORT';
  rawScore: number;
  slPx: number;
  tpPx: number;
  entryGate: number;
  distToEntry: number;
  entryReady: boolean;
  statusText: string;
  volume: number;
}

interface WatchItem {
  symbol: string;
  price: number;
  change24h: number;
  funding: number;
  rawScore: number;
  direction: 'LONG' | 'SHORT';
  volume: number;
}

interface ScanResult {
  status: string;
  regime: string;
  regimeReason: string;
  minScore: number;
  totalScanned: number;
  candidateCount: number;
  readyCount: number;
  btcPrice: number;
  btcChange24h: number;
  avgFunding: number;
  signals: Signal[];
  watching: WatchItem[];
  timestamp: number;
  cached?: boolean;
  error?: string;
}

export const EternaSignalStream: React.FC = () => {
  const [data, setData] = useState<ScanResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState('Loading...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState<'candidates' | 'watching'>('candidates');
  const [filter, setFilter] = useState<'all' | 'ready' | 'long' | 'short'>('all');

  const fetchScan = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/scanner?t=${Date.now()}`);
      if (!res.ok) return;
      const json: ScanResult = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('[BotScanPanel] fetch error:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchScan();
    const interval = setInterval(fetchScan, 20000);
    return () => clearInterval(interval);
  }, [fetchScan]);

  const signals = data?.signals ?? [];
  const watching = data?.watching ?? [];

  const filteredSignals = signals.filter(s => {
    if (filter === 'ready') return s.entryReady;
    if (filter === 'long') return s.direction === 'LONG';
    if (filter === 'short') return s.direction === 'SHORT';
    return true;
  });

  const readyCount = signals.filter(s => s.entryReady).length;

  const fmt = (n: number, dec = 2) =>
    n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const fmtPrice = (n: number) => {
    if (n < 0.01) return n.toFixed(6);
    if (n < 1) return n.toFixed(5);
    if (n < 10) return n.toFixed(4);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <section className="eterna-signals-section" style={{ marginBottom: '1.5rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 className="grid-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🤖</span>
          <span>Alpha Bot — Live Scan Results</span>
          <span style={{
            fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, letterSpacing: '0.5px',
            background: readyCount > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.15)',
            color: readyCount > 0 ? '#10b981' : '#fbbf24',
            border: readyCount > 0 ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(251,191,36,0.3)'
          }}>
            {readyCount > 0 ? `🟢 ${readyCount} ENTRY READY` : '⏳ SCANNING...'}
          </span>
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            {data?.cached ? '📦 cached' : '🔄 live'} · {lastUpdated}
          </span>
          <button onClick={fetchScan} disabled={isRefreshing} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--color-text-muted)', borderRadius: '6px', padding: '4px 12px',
            fontSize: '0.72rem', cursor: isRefreshing ? 'not-allowed' : 'pointer'
          }}>
            {isRefreshing ? '⌛ Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* ── Regime Stats Bar ── */}
      <div style={{
        padding: '8px 14px', borderRadius: '8px', marginBottom: '0.8rem',
        background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
        display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.77rem'
      }}>
        <span style={{ color: '#6b7280' }}>
          BTC: <strong style={{ color: '#fff' }}>
            ${data ? fmtPrice(data.btcPrice) : '--'}
          </strong>{' '}
          <span style={{ color: (data?.btcChange24h ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
            {(data?.btcChange24h ?? 0) >= 0 ? '+' : ''}{fmt(data?.btcChange24h ?? 0)}%
          </span>
        </span>
        <span style={{ color: '#6b7280' }}>
          Avg Funding: <strong style={{ color: (data?.avgFunding ?? 0) > 0.0006 ? '#ef4444' : '#10b981' }}>
            {data ? ((data.avgFunding) * 100).toFixed(4) : '--'}%
          </strong>
        </span>
        <span style={{ color: '#6b7280' }}>
          Scanned: <strong style={{ color: '#e2e8f0' }}>{data?.totalScanned ?? '--'}</strong>
        </span>
        <span style={{ color: '#6b7280' }}>
          Min Score: <strong style={{ color: '#818cf8' }}>{data?.minScore ?? 85}</strong>
        </span>
        <span style={{ color: '#6b7280' }}>
          Candidates: <strong style={{ color: '#f59e0b' }}>{data?.candidateCount ?? '--'}</strong>
        </span>
        <span style={{ color: '#10b981', fontWeight: 600 }}>
          ✅ {data?.regimeReason ?? 'Connecting...'}
        </span>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {(['candidates', 'watching'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '4px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600,
            border: tab === t ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
            background: tab === t ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
            color: tab === t ? '#a5b4fc' : '#9ca3af'
          }}>
            {t === 'candidates' ? `🎯 Candidates (${signals.length})` : `👁 Watching (${watching.length})`}
          </button>
        ))}

        {tab === 'candidates' && (
          <div style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
            {(['all', 'ready', 'long', 'short'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.71rem', fontWeight: 600,
                border: filter === f ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.07)',
                background: filter === f ? 'rgba(251,191,36,0.1)' : 'transparent',
                color: filter === f ? '#fbbf24' : '#6b7280'
              }}>
                {f === 'all' ? `All (${signals.length})` :
                  f === 'ready' ? `🟢 Ready (${readyCount})` :
                  f === 'long' ? '▲ Long' : '▼ Short'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Candidates Grid ── */}
      {tab === 'candidates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))', gap: '0.7rem' }}>
          {filteredSignals.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              {isRefreshing ? '⌛ Scanning Hyperliquid markets...' : 'No candidates meet bot criteria (score ≥ 85)'}
            </div>
          )}
          {filteredSignals.map(sig => {
            const isLong = sig.direction === 'LONG';
            const ready = sig.entryReady;
            const scoreColor = sig.rawScore >= 5 ? '#10b981' : sig.rawScore >= 3 ? '#fbbf24' : '#9ca3af';

            return (
              <div key={sig.symbol} style={{
                background: 'var(--color-card-bg, rgba(20,24,33,0.85))',
                border: ready
                  ? '1px solid rgba(16,185,129,0.45)'
                  : '1px solid rgba(255,255,255,0.07)',
                boxShadow: ready ? '0 0 16px rgba(16,185,129,0.1)' : 'none',
                borderRadius: '10px', padding: '0.85rem',
                display: 'flex', flexDirection: 'column', gap: '7px',
                transition: 'all 0.2s ease'
              }}>
                {/* Symbol + Direction */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', letterSpacing: '0.5px' }}>
                    {sig.symbol}
                  </span>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                    background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: isLong ? '#10b981' : '#ef4444',
                    border: isLong ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)'
                  }}>
                    {sig.direction} {isLong ? '▲' : '▼'}
                  </span>
                </div>

                {/* Price + 24h */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    ${fmtPrice(sig.price)}
                  </span>
                  <span style={{ fontSize: '0.77rem', fontWeight: 600, color: sig.change24h >= 0 ? '#10b981' : '#ef4444' }}>
                    {sig.change24h >= 0 ? '+' : ''}{fmt(sig.change24h)}%
                  </span>
                </div>

                {/* SL / TP / Funding */}
                <div style={{
                  background: 'rgba(0,0,0,0.22)', borderRadius: '6px', padding: '6px 8px',
                  fontSize: '0.73rem', display: 'flex', flexDirection: 'column', gap: '3px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Entry Gate:</span>
                    <span style={{ fontWeight: 600, color: '#e2e8f0' }}>${fmtPrice(sig.entryGate)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>SL / TP:</span>
                    <span style={{ fontWeight: 600 }}>
                      <span style={{ color: '#ef4444' }}>${fmtPrice(sig.slPx)}</span>
                      {' / '}
                      <span style={{ color: '#10b981' }}>${fmtPrice(sig.tpPx)}</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Funding (daily):</span>
                    <span style={{ fontWeight: 600, color: sig.funding < 0 ? '#10b981' : sig.funding > 0.0015 ? '#ef4444' : '#fbbf24' }}>
                      {(sig.funding * 100).toFixed(4)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Vol 24h:</span>
                    <span style={{ color: '#9ca3af' }}>
                      ${sig.volume >= 1e9 ? (sig.volume / 1e9).toFixed(1) + 'B' : sig.volume >= 1e6 ? (sig.volume / 1e6).toFixed(1) + 'M' : sig.volume.toFixed(0)}
                    </span>
                  </div>
                </div>

                {/* Score bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.68rem', color: '#6b7280', minWidth: '38px' }}>Score:</span>
                  <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '2px', width: `${Math.min(100, Math.max(0, ((sig.rawScore + 6) / 12) * 100))}%`,
                      background: scoreColor, transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: '0.71rem', fontWeight: 700, color: scoreColor, minWidth: '20px' }}>
                    {sig.rawScore > 0 ? `+${sig.rawScore}` : sig.rawScore}
                  </span>
                </div>

                {/* Status */}
                <div style={{
                  fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', padding: '4px 6px',
                  borderRadius: '5px',
                  background: ready ? 'rgba(16,185,129,0.1)' : 'rgba(251,191,36,0.06)',
                  color: ready ? '#10b981' : '#fbbf24'
                }}>
                  {sig.statusText}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Watching Table ── */}
      {tab === 'watching' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', textAlign: 'left' }}>
                {['Symbol', 'Price', '24h %', 'Dir', 'Score', 'Funding (daily)', 'Volume'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {watching.map((w, i) => {
                const isLong = w.direction === 'LONG';
                return (
                  <tr key={w.symbol} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                  }}>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#e2e8f0' }}>{w.symbol}</td>
                    <td style={{ padding: '6px 10px', color: '#fff' }}>${fmtPrice(w.price)}</td>
                    <td style={{ padding: '6px 10px', color: w.change24h >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {w.change24h >= 0 ? '+' : ''}{fmt(w.change24h)}%
                    </td>
                    <td style={{ padding: '6px 10px', color: isLong ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                      {w.direction} {isLong ? '▲' : '▼'}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#9ca3af', fontWeight: 600 }}>
                      {w.rawScore > 0 ? `+${w.rawScore}` : w.rawScore}
                    </td>
                    <td style={{ padding: '6px 10px', color: w.funding < 0 ? '#10b981' : '#fbbf24' }}>
                      {(w.funding * 100).toFixed(4)}%
                    </td>
                    <td style={{ padding: '6px 10px', color: '#6b7280' }}>
                      ${w.volume >= 1e9 ? (w.volume / 1e9).toFixed(1) + 'B' : w.volume >= 1e6 ? (w.volume / 1e6).toFixed(1) + 'M' : '—'}
                    </td>
                  </tr>
                );
              })}
              {watching.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
                  {isRefreshing ? 'Loading...' : 'No data'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
