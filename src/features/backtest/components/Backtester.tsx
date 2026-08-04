import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store';
import { runBacktest } from '../../../services/api';
import { BacktestChart } from './BacktestChart';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

// Pre-computed backtest results (90 / 180 / 365 days)
const PRECOMPUTED: Record<string, { r90: string; dd90: string; r180: string; dd180: string; r365: string; dd365: string; wr365: string; trades365: number }> = {
  BTC: { r90: '+126.14%', dd90: '-15.62%', r180: '+519.66%', dd180: '-25.48%', r365: '+544.53%', dd365: '-25.58%', wr365: '57.3%', trades365: 89 },
  XRP: { r90: '+1.78%', dd90: '-32.71%', r180: '+230.21%', dd180: '-21.48%', r365: '+56.71%', dd365: '-35.48%', wr365: '56.47%', trades365: 85 },
  SUI: { r90: '+214.62%', dd90: '-23.44%', r180: '+234.57%', dd180: '-24.74%', r365: '+214.76%', dd365: '-38.64%', wr365: '57.5%', trades365: 80 },
  HYPE: { r90: '+186.8%', dd90: '-36.22%', r180: '+581.31%', dd180: '-40.66%', r365: '+226.62%', dd365: '-52.98%', wr365: '34.09%', trades365: 176 },
};

const WATCHLIST = ['BTC', 'XRP', 'SUI', 'HYPE'];

export const Backtester: React.FC = () => {
  const { activeBotConfig, lastBacktestData, setLastBacktestData, top100Coins } = useStore();

  const [coin, setCoin] = useState('BTC');
  const [days, setDays] = useState('365');
  const [minScore, setMinScore] = useState('85');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [showComparison, setShowComparison] = useState(true);
  const [liveResults, setLiveResults] = useState<Record<string, any>>({});

  // Sync minScore default from activeBotConfig
  useEffect(() => {
    if (activeBotConfig) {
      setMinScore(activeBotConfig.minScore.toString());
    }
  }, [activeBotConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await runBacktest(coin, parseInt(days), parseInt(minScore), parseFloat(initialBalance) || 10000);
      setLastBacktestData(data);
      setLiveResults(prev => ({ ...prev, [`${coin}-${days}`]: data }));
    } catch (err: any) {
      alert("Backtest failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAllCoins = async () => {
    setLoadingAll(true);
    const results: Record<string, any> = {};
    for (const c of WATCHLIST) {
      try {
        const data = await runBacktest(c, 365, parseInt(minScore), parseFloat(initialBalance) || 10000);
        results[c] = data;
        setLiveResults(prev => ({ ...prev, [`${c}-365`]: data }));
      } catch (err) {
        console.warn(`Backtest failed for ${c}:`, err);
      }
    }
    setLoadingAll(false);
  };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', height: '100%' }}>
      {/* Form controls */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="bt-coin" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Asset</label>
            <select
              id="bt-coin"
              value={coin}
              onChange={(e) => setCoin(e.target.value)}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                color: 'var(--color-text)',
                padding: '0.4rem',
                borderRadius: '0.5rem',
                outline: 'none',
                fontSize: '0.85rem'
              }}
            >
              {Array.from(new Set([
                'BTC', 'ETH', 'SOL', 'HYPE', 'LINK', 'XRP', 'INJ', 'WLD',
                ...(top100Coins || []).map(c => c.symbol)
              ])).map(symbol => (
                <option key={symbol} value={symbol} style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>{symbol}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="bt-days" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Period</label>
            <select
              id="bt-days"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                color: 'var(--color-text)',
                padding: '0.4rem',
                borderRadius: '0.5rem',
                outline: 'none',
                fontSize: '0.85rem'
              }}
            >
              <option value="7"   style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>7 Days</option>
              <option value="14"  style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>14 Days</option>
              <option value="30"  style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>30 Days</option>
              <option value="90"  style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>90 Days (3 Months)</option>
              <option value="180" style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>180 Days (6 Months)</option>
              <option value="365" style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>365 Days (1 Year) ★</option>
            </select>
          </div>
        </div>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group">
            <label htmlFor="bt-minscore" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Min Score</label>
            <input
              type="number"
              id="bt-minscore"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              min="50"
              max="100"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                color: 'var(--color-text)',
                padding: '0.4rem',
                borderRadius: '0.5rem',
                outline: 'none',
                fontSize: '0.85rem'
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="bt-initialbalance" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Start Balance ($)</label>
            <input
              type="number"
              id="bt-initialbalance"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              min="1"
              required
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                color: 'var(--color-text)',
                padding: '0.4rem',
                borderRadius: '0.5rem',
                outline: 'none',
                fontSize: '0.85rem',
                width: '100%'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || loadingAll}
              style={{
                background: 'linear-gradient(135deg, var(--color-blue), var(--color-primary))',
                color: 'white',
                border: 'none',
                padding: '0.45rem 1rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                height: '32px',
                transition: 'opacity 0.2s',
                opacity: (loading || loadingAll) ? 0.7 : 1
              }}
            >
              {loading ? 'Running...' : 'Run'}
            </Button>
            <button
              type="button"
              onClick={handleRunAllCoins}
              disabled={loading || loadingAll}
              title="Run 365-day backtest for all 4 watchlist coins"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: 'white',
                border: 'none',
                padding: '0.45rem 0.8rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.75rem',
                height: '32px',
                whiteSpace: 'nowrap',
                opacity: (loading || loadingAll) ? 0.7 : 1
              }}
            >
              {loadingAll ? '⏳ Running all...' : '⚡ All Coins 1Y'}
            </button>
          </div>
        </div>
      </form>

      {/* Active Bot Parameters Badge */}
      <div id="bt-active-params" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-0.2rem' }}>
        <span>Active Bot Config:</span>
        <span style={{ color: '#fff', fontWeight: 600 }}>
          Score: {activeBotConfig ? activeBotConfig.minScore : '--'} | 
          SL: {activeBotConfig ? (activeBotConfig.minSlBuffer * 100).toFixed(1) : '--'}% | 
          TP: {activeBotConfig ? (activeBotConfig.minTpBuffer * 100).toFixed(1) : '--'}%
        </span>
      </div>

      {/* ─── All-Coins Comparison Table ─── */}
      <div style={{ border: '1px solid var(--border-light)', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <button
          onClick={() => setShowComparison(v => !v)}
          style={{ width: '100%', background: 'rgba(124,58,237,0.12)', border: 'none', borderBottom: showComparison ? '1px solid var(--border-light)' : 'none', color: '#a78bfa', padding: '0.45rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '0.3px' }}
        >
          <span>📊 Watchlist Comparison — 90 / 180 / 365 days</span>
          <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{showComparison ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showComparison && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['Coin', '90d Return', '90d DD', '180d Return', '180d DD', '365d Return ★', '365d DD', 'WR 1Y', 'Trades'].map(h => (
                    <th key={h} style={{ padding: '0.4rem 0.5rem', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WATCHLIST.map(c => {
                  const pre = PRECOMPUTED[c];
                  const live365 = liveResults[`${c}-365`];
                  const r365 = live365 ? `+${live365.summary.totalReturnPct}%` : pre.r365;
                  const dd365 = live365 ? `-${live365.summary.maxDrawdown}%` : pre.dd365;
                  const wr365 = live365 ? `${live365.summary.winRate}%` : pre.wr365;
                  const t365 = live365 ? live365.summary.totalTrades : pre.trades365;
                  const isActive = c === coin;
                  return (
                    <tr
                      key={c}
                      onClick={() => setCoin(c)}
                      style={{ cursor: 'pointer', background: isActive ? 'rgba(124,58,237,0.1)' : 'transparent', transition: 'background 0.15s' }}
                    >
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: isActive ? '#a78bfa' : '#fff', textAlign: 'center' }}>{c}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#4ade80', textAlign: 'center' }}>{pre.r90}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#f87171', textAlign: 'center' }}>{pre.dd90}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#4ade80', textAlign: 'center' }}>{pre.r180}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#f87171', textAlign: 'center' }}>{pre.dd180}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: live365 ? '#facc15' : '#4ade80', fontWeight: 700, textAlign: 'center' }}>{r365}{live365 ? ' ⚡' : ''}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#f87171', textAlign: 'center' }}>{dd365}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8', textAlign: 'center' }}>{wr365}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8', textAlign: 'center' }}>{t365}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '0.35rem 0.6rem', fontSize: '0.65rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--border-light)' }}>
              ⚡ = Live result | Click a row to select coin | 365d data: Jul 2025 – Jul 2026
            </div>
          </div>
        )}
      </div>

      {/* Backtest Loading overlay */}
      {loading && (
        <div id="bt-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', padding: '2rem 1rem', textAlign: 'center' }}>
          <div className="bt-spinner" style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-blue)', borderRadius: '50%', animation: 'bt-spin 1s linear infinite' }}></div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Fetching history & running backtest...</span>
        </div>
      )}

      {/* Backtest results */}
      {!loading && lastBacktestData && (
        <div id="bt-results" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {/* Metrics Row */}
          <div className="bt-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <div className="bt-metric-card" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span className="bt-metric-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Return</span>
              <span className={`bt-metric-value ${lastBacktestData.summary.totalReturnPct >= 0 ? 'change-up' : 'change-down'}`} style={{ fontSize: '1rem', fontWeight: 700 }}>
                {lastBacktestData.summary.totalReturnPct >= 0 ? '+' : ''}{lastBacktestData.summary.totalReturnPct}%
              </span>
            </div>
            <div className="bt-metric-card" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span className="bt-metric-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Win Rate</span>
              <span className={`bt-metric-value ${lastBacktestData.summary.winRate >= 50 ? 'change-up' : 'change-down'}`} style={{ fontSize: '1rem', fontWeight: 700 }}>
                {lastBacktestData.summary.winRate}%
              </span>
            </div>
            <div className="bt-metric-card" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span className="bt-metric-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Max DD</span>
              <span className="bt-metric-value change-down" style={{ fontSize: '1rem', fontWeight: 700 }}>
                -{lastBacktestData.summary.maxDrawdown}%
              </span>
            </div>
          </div>
          
          {/* Detailed wins/losses summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', padding: '0 0.2rem', marginTop: '-0.3rem' }}>
            <span>Total: <strong style={{ color: '#fff' }}>{lastBacktestData.summary.totalTrades}</strong></span>
            <span>Wins: <strong className="change-up">{lastBacktestData.summary.wins}</strong></span>
            <span>Losses: <strong className="change-down">{lastBacktestData.summary.losses}</strong></span>
            <span>Profit Factor: <strong style={{ color: '#fff' }}>{lastBacktestData.summary.profitFactor}</strong></span>
          </div>

          {/* SVG Recharts Chart */}
          <div className="bt-chart-container" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: '0.75rem', padding: '0.4rem', position: 'relative', height: '150px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BacktestChart data={lastBacktestData.equityCurve} />
          </div>

          {/* Detailed Log Trigger */}
          <button
            onClick={() => setIsLogOpen(true)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-light)',
              color: 'var(--color-text)',
              padding: '0.5rem',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
            </svg>
            View Detailed Trade Log ({lastBacktestData.summary.totalTrades} | Win: {lastBacktestData.summary.wins} / Loss: {lastBacktestData.summary.losses})
          </button>
        </div>
      )}

      {/* Trade Log Drawer */}
      <Modal
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        title={`${lastBacktestData?.coin || coin} Backtest Log`}
      >
        <div style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', marginBottom: '1rem', marginTop: '-1rem' }}>
          Period: {lastBacktestData?.days || days} days — Score Threshold: {lastBacktestData?.minScore || minScore}
        </div>
        
        <div className="trade-plan-details" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h4 style={{ fontFamily: 'var(--font-title)', marginBottom: '0.8rem', color: 'var(--color-primary)', fontSize: '1rem' }}>
              Executed Trade History
            </h4>
            
            {!lastBacktestData?.trades || lastBacktestData.trades.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                No trades executed.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.2rem' }}>
                {lastBacktestData.trades.map((t: any, idx: number) => {
                  const dirClass = t.dir === 'LONG' ? 'change-up' : 'change-down';
                  const pnlClass = t.pnlUsd >= 0 ? 'change-up' : 'change-down';
                  const pnlPrefix = t.pnlUsd >= 0 ? '+' : '';
                  const entryTimeStr = new Date(t.entryTime).toLocaleDateString() + ' ' + new Date(t.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const exitTimeStr = new Date(t.exitTime).toLocaleDateString() + ' ' + new Date(t.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          Trade #{idx + 1}{' '}
                          <span className={`plan-type-badge ${dirClass}`} style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem', marginLeft: '0.4rem' }}>
                            {t.dir}
                          </span>
                        </span>
                        <span className={pnlClass} style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          {pnlPrefix}{t.returnPct}% (${t.pnlUsd.toFixed(2)})
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        <div>Entry Px: <strong style={{ color: '#fff' }}>${t.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong></div>
                        <div>Exit Px: <strong style={{ color: '#fff' }}>${t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong></div>
                        <div>Entry: <strong style={{ color: '#fff' }}>{entryTimeStr}</strong></div>
                        <div>Exit: <strong style={{ color: '#fff' }}>{exitTimeStr} ({t.exitType})</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
