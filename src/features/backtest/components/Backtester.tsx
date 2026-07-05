import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store';
import { runBacktest } from '../../../services/api';
import { BacktestChart } from './BacktestChart';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

export const Backtester: React.FC = () => {
  const { activeBotConfig, lastBacktestData, setLastBacktestData, top100Coins } = useStore();

  const [coin, setCoin] = useState('BTC');
  const [days, setDays] = useState('30');
  const [minScore, setMinScore] = useState('85');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [loading, setLoading] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);

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
    } catch (err: any) {
      alert("Backtest failed: " + err.message);
    } finally {
      setLoading(false);
    }
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
                <option key={symbol} value={symbol}>{symbol}</option>
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
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="30">30 Days</option>
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
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
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
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Running...' : 'Run Backtest'}
          </Button>
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
            View Detailed Trade Log ({lastBacktestData.summary.totalTrades})
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
