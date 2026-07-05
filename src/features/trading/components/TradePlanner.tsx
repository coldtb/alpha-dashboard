import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../../store';
import { detectAutoDirection, computeStrategyLevels, getScannedCoin, formatPriceText, geckoIdMap } from '../../../utils/helpers';
import { callMcpTool, fetchCandles } from '../../../services/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

interface TradePlannerProps {
  initialValues: { symbol: string; entry: number; sl: number; tp: number } | null;
  clearInitialValues: () => void;
}

export const TradePlanner: React.FC<TradePlannerProps> = ({ initialValues, clearInitialValues }) => {
  const { top100Coins, watchlistPrices, addCustomTrade, setActiveTab, activeBotConfig } = useStore();

  const [symbol, setSymbol] = useState('');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [riskPct, setRiskPct] = useState('2');
  const [accountSize, setAccountSize] = useState('10000');
  
  const [autoDir, setAutoDir] = useState<'LONG' | 'SHORT'>('LONG');
  const [isSkipped, setIsSkipped] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [indicatorState, setIndicatorState] = useState<{
    coin: any;
    isLive: boolean;
    taData: any;
    levels: { entry: string; sl: string; tp: string } | null;
  } | null>(null);
  
  const [loadingLive, setLoadingLive] = useState(false);
  const debounceTimer = useRef<any>(null);
  const mcpCache = useRef<Record<string, any>>({});

  // Handle applied setups from Podium
  useEffect(() => {
    if (initialValues) {
      setSymbol(initialValues.symbol);
      setEntry(initialValues.entry.toString());
      setSl(initialValues.sl.toString());
      setTp(initialValues.tp.toString());
      clearInitialValues();
    }
  }, [initialValues, clearInitialValues]);

  // Handle symbol input and trigger auto direction + TrueNorth levels
  useEffect(() => {
    const sym = symbol.toUpperCase().trim();
    if (!sym) {
      setIndicatorState(null);
      setAutoDir('LONG');
      return;
    }

    const coin = getScannedCoin(sym, top100Coins, watchlistPrices);
    if (coin) {
      const dir = detectAutoDirection(coin) as 'LONG' | 'SHORT';
      setAutoDir(dir);
      setIsSkipped(false);
      setSkipReason('');
      
      // Calculate immediate fallback levels
      const fallbackLevels = computeStrategyLevels(coin, dir, null);
      const dec = coin.price < 1 ? 6 : (coin.price < 10 ? 4 : 2);
      
      setIndicatorState({
        coin,
        isLive: false,
        taData: null,
        levels: {
          entry: parseFloat(fallbackLevels.entry.toString()).toFixed(dec),
          sl: parseFloat(fallbackLevels.sl.toString()).toFixed(dec),
          tp: parseFloat(fallbackLevels.tp.toString()).toFixed(dec),
        }
      });

      // Auto-fill fallback levels initially if fields are empty
      if (!entry) setEntry(fallbackLevels.entry.toString());
      if (!sl) setSl(fallbackLevels.sl.toString());
      if (!tp) setTp(fallbackLevels.tp.toString());

      // Debounce TrueNorth Live Level Fetch
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      
      setLoadingLive(true);
      debounceTimer.current = setTimeout(async () => {
        const geckoId = geckoIdMap[sym];
        if (!geckoId) {
          setLoadingLive(false);
          return;
        }

        try {
          let data = mcpCache.current[sym];
          if (!data) {
            data = await callMcpTool('technical_analysis', { token_address: geckoId, timeframe: '1h' });
            if (data) {
              mcpCache.current[sym] = data;
            }
          }

          // Fetch candles to calculate 24h SMA
          const candles = await fetchCandles(sym);
          let sma24: number | null = null;
          if (candles && candles.length >= 25) {
            const last25 = candles.slice(-25);
            const sumClose = last25.reduce((sum, c: any) => sum + parseFloat(c.c || c[4] || 0), 0);
            sma24 = sumClose / 25;
          }

          if (data) {
            const rawDir = detectAutoDirection(coin, data, null) as 'LONG' | 'SHORT';
            const maxDist = activeBotConfig?.maxDistancePct !== undefined ? activeBotConfig.maxDistancePct : 1.5;
            const liveDir = detectAutoDirection(coin, data, sma24, maxDist);

            setAutoDir(rawDir);
            
            if (liveDir === 'SKIP') {
              setIsSkipped(true);
              if (sma24 !== null) {
                const diffPct = ((coin.price - sma24) / sma24) * 100;
                if (rawDir === 'LONG') {
                  if (coin.price < sma24) setSkipReason(`Price is below 24h SMA ($${sma24.toFixed(4)}) - Counter-trend LONG`);
                  else if (diffPct > maxDist) setSkipReason(`LONG is overextended (Diff ${diffPct.toFixed(2)}% > ${maxDist}%)`);
                } else {
                  if (coin.price > sma24) setSkipReason(`Price is above 24h SMA ($${sma24.toFixed(4)}) - Counter-trend SHORT`);
                  else if (Math.abs(diffPct) > maxDist) setSkipReason(`SHORT is overextended (Diff ${Math.abs(diffPct).toFixed(2)}% > ${maxDist}%)`);
                }
              }
            } else {
              setIsSkipped(false);
              setSkipReason('');
            }

            const liveLevels = computeStrategyLevels(coin, rawDir, data);
            
            setIndicatorState({
              coin,
              isLive: true,
              taData: data,
              levels: {
                entry: parseFloat(liveLevels.entry.toString()).toFixed(dec),
                sl: parseFloat(liveLevels.sl.toString()).toFixed(dec),
                tp: parseFloat(liveLevels.tp.toString()).toFixed(dec),
              }
            });

            // Automatically repopulate with Live Levels
            setEntry(liveLevels.entry.toString());
            setSl(liveLevels.sl.toString());
            setTp(liveLevels.tp.toString());
          }
        } catch (e) {
          console.warn('Failed to fetch TrueNorth technical analysis:', e);
        } finally {
          setLoadingLive(false);
        }
      }, 500);

    } else {
      setIndicatorState(null);
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [symbol, top100Coins, watchlistPrices, activeBotConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !entry || !sl || !tp) return;

    const entryVal = parseFloat(entry);
    const slVal = parseFloat(sl);
    const tpVal = parseFloat(tp);
    const riskPctVal = parseFloat(riskPct) || 2;
    const accountSizeVal = parseFloat(accountSize) || 10000;

    // Detect actual direction from levels if possible
    let direction = autoDir;
    if (slVal < entryVal && tpVal > entryVal) {
      direction = 'LONG';
    } else if (slVal > entryVal && tpVal < entryVal) {
      direction = 'SHORT';
    }

    addCustomTrade({
      symbol: symbol.toUpperCase().trim(),
      entry: entryVal,
      sl: slVal,
      tp: tpVal,
      riskPct: riskPctVal,
      accountSize: accountSizeVal,
      direction
    });

    // Reset planner symbol form
    setSymbol('');
    setEntry('');
    setSl('');
    setTp('');
    setActiveTab('custom');
  };

  const fillLevel = (target: 'entry' | 'sl' | 'tp', value: string) => {
    if (target === 'entry') setEntry(value);
    if (target === 'sl') setSl(value);
    if (target === 'tp') setTp(value);
  };

  return (
    <section className="planner-section">
      <h2 className="grid-section-title">
        <svg width="20" height="20" fill="var(--color-blue)" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
          <path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3M7,7H17V5H19V19H5V5H7V7Z"/>
        </svg>
        Alpha Trade Planner
      </h2>
      <div className="planner-card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="plan-symbol">Symbol</label>
              <Input
                type="text"
                id="plan-symbol"
                placeholder="e.g. BTC, SOL"
                required
                autoComplete="off"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
              <div id="symbol-live-indicator" className="live-indicator-text">
                {indicatorState ? (
                  <div>
                    <div style={{ marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                      <div style={{ fontSize: '0.75rem' }}>
                        Live: <span style={{ color: '#fff' }}>{formatPriceText(indicatorState.coin.price)}</span> | 
                        24h: <span className={indicatorState.coin.change >= 0 ? 'change-up' : 'change-down'}>
                          {indicatorState.coin.change >= 0 ? '+' : ''}{indicatorState.coin.change.toFixed(2)}%
                        </span> | 
                        Funding: <span style={{ color: '#fff' }}>{(indicatorState.coin.funding * 100).toFixed(4)}%</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        {isSkipped && (
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.55rem',
                            borderRadius: '5px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem'
                          }} title={skipReason}>
                            ⚠️ Skip: {skipReason.split('-')[0].trim()}
                          </span>
                        )}
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '5px',
                          background: autoDir === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,61,0,0.1)',
                          color: autoDir === 'LONG' ? 'var(--color-green)' : 'var(--color-red)',
                          border: `1px solid ${autoDir === 'LONG' ? 'rgba(0,230,118,0.35)' : 'rgba(255,61,0,0.35)'}`,
                          letterSpacing: '0.05em'
                        }}>
                          {autoDir === 'LONG' ? '▲' : '▼'} {indicatorState.isLive ? `Auto: ${autoDir}` : `Est: ${autoDir}`}
                        </span>
                        <span className={`mcp-status-pill ${indicatorState.isLive ? 'live' : 'loading'}`}>
                          {indicatorState.isLive ? 'TrueNorth Live' : 'Calculating...'}
                        </span>
                      </div>
                    </div>
                    {indicatorState.levels && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.35rem', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#9ca3af' }}>Execution Zones:</span>
                        <span
                          className="suggest-level-badge"
                          style={{
                            background: 'rgba(255,215,0,0.08)',
                            border: '1px solid rgba(255,215,0,0.25)',
                            color: '#ffd700',
                            padding: '0.05rem 0.25rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            borderStyle: indicatorState.isLive ? 'solid' : 'dashed',
                            boxShadow: indicatorState.isLive ? '0 0 6px rgba(139, 92, 246, 0.2)' : 'none'
                          }}
                          onClick={() => fillLevel('entry', indicatorState.levels!.entry)}
                          title={`${indicatorState.isLive ? 'TrueNorth Live Level' : 'Estimated Level'} (Click to fill Entry)`}
                        >
                          Entry (Fib): ${indicatorState.levels.entry}
                        </span>
                        <span
                          className="suggest-level-badge"
                          style={{
                            background: 'rgba(0,176,255,0.08)',
                            border: '1px solid rgba(0,176,255,0.25)',
                            color: 'var(--color-blue)',
                            padding: '0.05rem 0.25rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            borderStyle: indicatorState.isLive ? 'solid' : 'dashed',
                            boxShadow: indicatorState.isLive ? '0 0 6px rgba(139, 92, 246, 0.2)' : 'none'
                          }}
                          onClick={() => fillLevel('tp', indicatorState.levels!.tp)}
                          title={`${indicatorState.isLive ? 'TrueNorth Live Level' : 'Estimated Level'} (Click to fill TP)`}
                        >
                          TP (VWAP): ${indicatorState.levels.tp}
                        </span>
                        <span
                          className="suggest-level-badge"
                          style={{
                            background: 'rgba(255,61,0,0.08)',
                            border: '1px solid rgba(255,61,0,0.25)',
                            color: 'var(--color-red)',
                            padding: '0.05rem 0.25rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            borderStyle: indicatorState.isLive ? 'solid' : 'dashed',
                            boxShadow: indicatorState.isLive ? '0 0 6px rgba(139, 92, 246, 0.2)' : 'none'
                          }}
                          onClick={() => fillLevel('sl', indicatorState.levels!.sl)}
                          title={`${indicatorState.isLive ? 'TrueNorth Live Level' : 'Estimated Level'} (Click to fill SL)`}
                        >
                          SL (Wick): ${indicatorState.levels.sl}
                        </span>
                      </div>
                    )}
                  </div>
                ) : symbol ? (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                    {loadingLive ? 'Checking TrueNorth...' : 'Custom asset — утгуудыг гараар оруулна уу.'}
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Symbol оруулна уу...</span>
                )}
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="plan-entry">Entry Price ($)</label>
              <Input
                type="number"
                id="plan-entry"
                placeholder="0.00"
                step="any"
                required
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="plan-sl">Stop Loss (SL) ($)</label>
              <Input
                type="number"
                id="plan-sl"
                placeholder="0.00"
                step="any"
                required
                value={sl}
                onChange={(e) => setSl(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="plan-tp">Take Profit (TP) ($)</label>
              <Input
                type="number"
                id="plan-tp"
                placeholder="0.00"
                step="any"
                required
                value={tp}
                onChange={(e) => setTp(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="plan-risk-pct">Risk per Trade (%)</label>
              <Input
                type="number"
                id="plan-risk-pct"
                min="0.1"
                max="100"
                step="any"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="plan-account-size">Account Size ($)</label>
              <Input
                type="number"
                id="plan-account-size"
                min="10"
                step="any"
                value={accountSize}
                onChange={(e) => setAccountSize(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" variant="primary" style={{ width: '100%', marginTop: '0.8rem' }} className="planner-submit-btn">
            Analyze & Save Setup
          </Button>
        </form>
      </div>
    </section>
  );
};
