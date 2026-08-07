import React, { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────
interface ConfluenceLayer {
  id: number;
  name: string;
  detail: string;
  pass: boolean | null;
}

interface Signal {
  symbol: string;
  name: string;
  network: string;
  price: number;
  change24h: number;
  volume24h: number;
  mcap: number;
  liquidity: number;
  volMcapRatio: number;
  liquidityMcapRatio: number;
  tokenClass: string;
  slPct: number;
  slPx: number;
  tpPx: number;
  gatePass: boolean;
  gateReasons: string[];
  confluence: { layers: ConfluenceLayer[]; passedCount: number; isValid: boolean } | null;
  validSignal: boolean;
  source: string;
}

interface ScanData {
  status: string;
  regime: 'OPEN' | 'CAUTION' | 'BLOCKED' | 'ERROR';
  regimeReason: string;
  fearAndGreed: { value: number; label: string; ok: boolean | null };
  btcData: { fundingPct: number; markPx: number; change24h: number; ok: boolean | null };
  pipeline: { scouted: number; gateRejected: number; gatePassed: number; validSignals: number };
  signals: Signal[];
  watching: Signal[];
  rejected: Signal[];
  timestamp: number;
  cached?: boolean;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};
const fmtPx = (n: number) => {
  if (n < 0.000001) return n.toExponential(3);
  if (n < 0.001) return n.toFixed(7);
  if (n < 0.01) return n.toFixed(6);
  if (n < 1) return n.toFixed(5);
  if (n < 10) return n.toFixed(4);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ── Sub-components ────────────────────────────────────────────────
const LayerBadge = ({ layer }: { layer: ConfluenceLayer }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '0.7rem' }}>
    <span style={{ color: layer.pass === true ? '#10b981' : layer.pass === false ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
      {layer.pass === true ? '✅' : layer.pass === false ? '❌' : '⚪'} L{layer.id}: {layer.name}
    </span>
    <span style={{ color: '#6b7280', maxWidth: '160px', textAlign: 'right' }}>{layer.detail}</span>
  </div>
);

const SignalCard = ({ sig }: { sig: Signal }) => {
  const [expanded, setExpanded] = useState(false);
  const passed = sig.confluence?.passedCount ?? 0;
  const isNet = sig.network === 'solana' ? '◎' : '🔵';

  return (
    <div style={{
      background: 'rgba(20,24,33,0.9)',
      border: sig.validSignal ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(255,255,255,0.07)',
      boxShadow: sig.validSignal ? '0 0 18px rgba(16,185,129,0.12)' : 'none',
      borderRadius: '10px', padding: '0.85rem',
      display: 'flex', flexDirection: 'column', gap: '7px',
      cursor: 'pointer', transition: 'all 0.2s ease'
    }} onClick={() => setExpanded(e => !e)}>

      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>{sig.symbol}</span>
          <span style={{ fontSize: '0.68rem', color: '#6b7280', marginLeft: '6px' }}>{isNet} {sig.network}</span>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '1px' }}>{sig.name.slice(0, 24)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
          <span style={{
            fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
            background: sig.validSignal ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.12)',
            color: sig.validSignal ? '#10b981' : '#fbbf24',
            border: sig.validSignal ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(251,191,36,0.2)'
          }}>
            {sig.validSignal ? `✅ VALID (${passed}/5)` : `⏳ ${passed}/5 layers`}
          </span>
          <span style={{ fontSize: '0.66rem', color: sig.tokenClass === 'Class A' ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
            {sig.tokenClass}
          </span>
        </div>
      </div>

      {/* Price + change */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>${fmtPx(sig.price)}</span>
        <span style={{ fontSize: '0.77rem', fontWeight: 600, color: sig.change24h >= 0 ? '#10b981' : '#ef4444' }}>
          {sig.change24h >= 0 ? '+' : ''}{sig.change24h.toFixed(2)}%
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', fontSize: '0.68rem' }}>
        {[
          { label: 'MCap', val: fmtUsd(sig.mcap) },
          { label: 'Vol 24h', val: fmtUsd(sig.volume24h) },
          { label: 'Liquidity', val: fmtUsd(sig.liquidity) },
        ].map(item => (
          <div key={item.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '3px 5px' }}>
            <div style={{ color: '#6b7280' }}>{item.label}</div>
            <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Gatekeeper ratios */}
      <div style={{ display: 'flex', gap: '8px', fontSize: '0.68rem', color: '#9ca3af' }}>
        <span style={{ color: sig.volMcapRatio >= 0.15 ? '#10b981' : '#fbbf24' }}>
          Vol/MC: {(sig.volMcapRatio * 100).toFixed(1)}%
        </span>
        <span style={{ color: sig.liquidityMcapRatio >= 0.10 ? '#10b981' : '#ef4444' }}>
          L/MC: {(sig.liquidityMcapRatio * 100).toFixed(1)}%
        </span>
      </div>

      {/* TP / SL */}
      {sig.validSignal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.71rem', padding: '4px 6px', background: 'rgba(0,0,0,0.2)', borderRadius: '5px' }}>
          <span>SL: <span style={{ color: '#ef4444', fontWeight: 700 }}>${fmtPx(sig.slPx)}</span> ({(sig.slPct * 100).toFixed(1)}%)</span>
          <span>TP: <span style={{ color: '#10b981', fontWeight: 700 }}>${fmtPx(sig.tpPx)}</span> (R:R 3:1)</span>
        </div>
      )}

      {/* Confluence Layers (expanded) */}
      {expanded && sig.confluence && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', marginTop: '2px' }}>
          <div style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>5-LAYER CONFLUENCE</div>
          {sig.confluence.layers.map(l => <LayerBadge key={l.id} layer={l} />)}
        </div>
      )}

      <div style={{ fontSize: '0.65rem', color: '#4b5563', textAlign: 'right' }}>
        {expanded ? '▲ collapse' : '▼ show confluence layers'}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────
export const EternaSignalStream: React.FC = () => {
  const [data, setData] = useState<ScanData | null>(null);
  const [lastUpdated, setLastUpdated] = useState('Loading...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState<'signals' | 'watching' | 'rejected' | 'pipeline'>('signals');

  const fetchScan = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/scanner?t=${Date.now()}`);
      if (!res.ok) return;
      const json: ScanData = await res.json();
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

  const fg = data?.fearAndGreed;
  const btc = data?.btcData;
  const pipe = data?.pipeline;
  const fgColor = !fg ? '#6b7280' : fg.value >= 30 && fg.value <= 65 ? '#10b981' : fg.value < 30 ? '#ef4444' : '#f59e0b';
  const regimeColor = data?.regime === 'OPEN' ? '#10b981' : data?.regime === 'CAUTION' ? '#fbbf24' : '#ef4444';

  return (
    <section className="eterna-signals-section" style={{ marginBottom: '1.5rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 className="grid-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🤖</span>
          <span>Alpha Bot — 5-Stage Pipeline Scanner</span>
          <span style={{
            fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700,
            background: `rgba(${data?.regime === 'OPEN' ? '16,185,129' : '251,191,36'},0.15)`,
            color: regimeColor,
            border: `1px solid ${regimeColor}40`
          }}>
            {data?.regime === 'OPEN' ? '🟢 REGIME OPEN' : data?.regime === 'CAUTION' ? '🟡 CAUTION' : '⛔ BLOCKED'}
            {data?.pipeline ? ` · ${data.pipeline.validSignals} VALID` : ''}
          </span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            {data?.cached ? '📦' : '🔄'} {lastUpdated}
          </span>
          <button onClick={fetchScan} disabled={isRefreshing} style={{
            padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: '#9ca3af', cursor: 'pointer', fontSize: '0.72rem'
          }}>
            {isRefreshing ? '⌛' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* ── Regime Stats Bar ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '8px', marginBottom: '0.8rem'
      }}>
        {/* F&G */}
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${fgColor}30` }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' }}>Fear & Greed (L1)</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: fgColor }}>{fg?.value ?? '--'}</div>
          <div style={{ fontSize: '0.68rem', color: fgColor }}>{fg?.label ?? '...'} {fg?.ok ? '✅' : fg?.ok === false ? '❌' : '⚪'}</div>
        </div>
        {/* BTC Funding */}
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' }}>BTC Funding/day (L2)</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: btc && Math.abs(btc.fundingPct) < 0.1 ? '#10b981' : '#ef4444' }}>
            {btc ? `${btc.fundingPct.toFixed(4)}%` : '--'}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>|Funding| &lt; 0.1% ← OK {btc?.ok ? '✅' : btc?.ok === false ? '❌' : '⚪'}</div>
        </div>
        {/* BTC Price */}
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' }}>BTC Price</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
            {btc?.markPx ? `$${btc.markPx.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--'}
          </div>
          <div style={{ fontSize: '0.68rem', color: (btc?.change24h ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
            {(btc?.change24h ?? 0) >= 0 ? '+' : ''}{(btc?.change24h ?? 0).toFixed(2)}% 24h
          </div>
        </div>
        {/* Pipeline */}
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' }}>Pipeline</div>
          <div style={{ fontSize: '0.72rem', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>🔭 Scouted: <strong>{pipe?.scouted ?? '--'}</strong></span>
            <span>🛡 Gate pass: <strong style={{ color: '#10b981' }}>{pipe?.gatePassed ?? '--'}</strong></span>
            <span>✅ Valid: <strong style={{ color: '#10b981' }}>{pipe?.validSignals ?? '--'}</strong></span>
          </div>
        </div>
        {/* Next Cron */}
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(156,163,175,0.2)' }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' }}>⏰ Cron Schedule</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#9ca3af' }}>⏸ PAUSED</div>
          <div style={{ fontSize: '0.66rem', color: '#6b7280' }}>Manual mode active</div>
        </div>
        {/* Regime */}
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${regimeColor}30` }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' }}>Regime</div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: regimeColor }}>{data?.regime ?? '--'}</div>
          <div style={{ fontSize: '0.63rem', color: '#6b7280', marginTop: '2px' }}>{data?.regimeReason?.slice(0, 40) ?? '...'}</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
        {[
          { key: 'signals', label: `✅ Valid Signals (${data?.signals?.length ?? 0})` },
          { key: 'watching', label: `👁 Watching (${data?.watching?.length ?? 0})` },
          { key: 'rejected', label: `❌ Rejected (${data?.rejected?.length ?? 0})` },
          { key: 'pipeline', label: '📊 Pipeline Info' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{
            padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600,
            border: tab === t.key ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
            background: tab === t.key ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
            color: tab === t.key ? '#a5b4fc' : '#6b7280'
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Valid Signals Tab ── */}
      {tab === 'signals' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {!data && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: '#6b7280' }}>⌛ Connecting to pipeline...</div>}
          {data && data.signals.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.85rem' }}>
              No tokens passed all 5 stages right now. Market scanning active...
              <br /><span style={{ fontSize: '0.75rem', color: '#4b5563' }}>Gate passed: {pipe?.gatePassed ?? 0} · Valid: 0</span>
            </div>
          )}
          {data?.signals.map(sig => <SignalCard key={sig.symbol} sig={sig} />)}
        </div>
      )}

      {/* ── Watching Tab ── */}
      {tab === 'watching' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {data?.watching.map(sig => <SignalCard key={sig.symbol} sig={sig} />)}
          {!data?.watching?.length && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: '#6b7280' }}>No watching tokens</div>}
        </div>
      )}

      {/* ── Rejected Tab ── */}
      {tab === 'rejected' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', textAlign: 'left' }}>
                {['Token', 'Network', 'MCap', 'Vol/MC', 'L/MC', '24h %', 'Reject Reason'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rejected.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700, color: '#e2e8f0' }}>{r.symbol}</td>
                  <td style={{ padding: '5px 8px', color: '#6b7280' }}>{r.network}</td>
                  <td style={{ padding: '5px 8px', color: '#9ca3af' }}>{fmtUsd(r.mcap)}</td>
                  <td style={{ padding: '5px 8px', color: r.volMcapRatio >= 0.05 ? '#10b981' : '#ef4444' }}>{(r.volMcapRatio * 100).toFixed(1)}%</td>
                  <td style={{ padding: '5px 8px', color: r.liquidityMcapRatio >= 0.10 ? '#10b981' : '#ef4444' }}>{(r.liquidityMcapRatio * 100).toFixed(1)}%</td>
                  <td style={{ padding: '5px 8px', color: r.change24h >= 0 ? '#10b981' : '#ef4444' }}>{r.change24h.toFixed(1)}%</td>
                  <td style={{ padding: '5px 8px', color: '#ef4444', fontSize: '0.68rem' }}>{r.gateReasons.join(' · ')}</td>
                </tr>
              ))}
              {!data?.rejected?.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>No data</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pipeline Info Tab ── */}
      {tab === 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem' }}>
          {[
            { stage: '🔭 Stage 1 — Scout', desc: 'Hyperliquid Mainnet\nAll perp markets scanned', color: '#3b82f6', val: `${pipe?.scouted ?? '--'} markets scanned` },
            { stage: '🛡 Stage 2 — Filter & Audit', desc: 'Filtered to 30-coin\ncrypto-perps watchlist\nVolume & funding gates', color: '#10b981', val: `${pipe?.gatePassed ?? '--'} / ${pipe?.scouted ?? '--'} passed gate` },
            { stage: '📊 Stage 3 — Confluence', desc: '5-Layer check ≥ 3/5\nF&G · Funding · TA · Vol/MC · Stability', color: '#8b5cf6', val: `${pipe?.validSignals ?? '--'} valid signals` },
            { stage: '⚡ Stage 4 — Execution', desc: 'Max 1.5% risk · 3x leverage\nMax 3 positions · 5% DD ceiling\nR:R ≥ 3:1 · Scale-Out TP/SL', color: '#ef4444', val: 'Hyperliquid Mainnet' },
            { stage: '📡 Stage 5 — Monitoring', desc: 'Discord Alerts · Dashboard\nbot.log · bot_stats.json', color: '#06b6d4', val: 'Live · 5x/day cron' },
          ].map(s => (
            <div key={s.stage} style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${s.color}25` }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: s.color, marginBottom: '6px' }}>{s.stage}</div>
              <div style={{ fontSize: '0.71rem', color: '#9ca3af', whiteSpace: 'pre-line', marginBottom: '6px' }}>{s.desc}</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e2e8f0' }}>{s.val}</div>
            </div>
          ))}
          <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fbbf24', marginBottom: '6px' }}>⏰ Cron Schedule (ULAT)</div>
            {[['09:00', '🌅 Morning scan + Institutional analytics'],
              ['12:00', '🌞 Perp market scout (Hyperliquid)'],
              ['15:00', '🌇 Derivatives + GEX/Funding'],
              ['18:00', '🌆 Smart wallet flow'],
              ['21:00', '🌙 Liquidation map + Position audit']].map(([t, d]) => (
              <div key={t} style={{ display: 'flex', gap: '8px', fontSize: '0.7rem', marginBottom: '3px' }}>
                <span style={{ color: '#fbbf24', fontWeight: 700, minWidth: '38px' }}>{t}</span>
                <span style={{ color: '#6b7280' }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
