import React, { useState } from 'react';
import { useStore } from '../../../store';

export const ClosedTrades: React.FC = () => {
  const { closedTrades } = useStore();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Filter trades prior to July 26, 2026 if needed
  const filteredTrades = (closedTrades || []).filter((trade: any) => {
    const date = new Date(trade.time);
    return !isNaN(date.getTime()) && date.getTime() >= new Date("2026-07-26T00:00:00Z").getTime();
  });

  const totalTrades = filteredTrades.length;
  const totalPages = Math.max(1, Math.ceil(totalTrades / pageSize));

  // Ensure currentPage is within bounds when trade list changes
  const activePage = Math.min(currentPage, totalPages);

  const startIndex = (activePage - 1) * pageSize;
  const currentTrades = filteredTrades.slice(startIndex, startIndex + pageSize);

  const handlePrev = () => {
    if (activePage > 1) setCurrentPage(activePage - 1);
  };

  const handleNext = () => {
    if (activePage < totalPages) setCurrentPage(activePage + 1);
  };

  return (
    <div className="perf-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h3 className="panel-title" style={{ margin: 0 }}>Recent Closed Trades</h3>
          <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 600 }}>
            {totalTrades} Total
          </span>
        </div>

        {/* Pagination Controls Header */}
        {totalTrades > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            <span>
              {startIndex + 1} - {Math.min(startIndex + pageSize, totalTrades)} of {totalTrades}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={handlePrev}
                disabled={activePage === 1}
                style={{
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: activePage === 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)',
                  color: activePage === 1 ? '#4b5563' : '#e5e7eb',
                  cursor: activePage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  transition: 'all 0.2s ease'
                }}
              >
                ◀ Prev
              </button>
              <span style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af' }}>
                {activePage} / {totalPages}
              </span>
              <button
                onClick={handleNext}
                disabled={activePage === totalPages}
                style={{
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: activePage === totalPages ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)',
                  color: activePage === totalPages ? '#4b5563' : '#e5e7eb',
                  cursor: activePage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  transition: 'all 0.2s ease'
                }}
              >
                Next ▶
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="perf-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Asset</th>
              <th>Direction</th>
              <th>Size @ Price</th>
              <th>Realized PnL</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {currentTrades && currentTrades.length > 0 ? (
              currentTrades.map((trade: any, idx: number) => {
                const pnlNum = typeof trade.pnl === 'string' ? parseFloat(trade.pnl) : (trade.pnl || 0);
                const pnlClass = pnlNum >= 0 ? 'change-up' : 'change-down';
                const pnlPrefix = pnlNum >= 0 ? '+' : '';
                
                const direction = trade.direction || trade.dir || (trade.side === 'A' || trade.side === 'S' ? 'LONG' : (trade.side === 'B' ? 'SHORT' : 'LONG'));
                const dirClass = direction === 'LONG' ? 'change-up' : 'change-down';
                
                const size = trade.size || trade.sz || '0';
                const szNum = typeof size === 'string' ? parseFloat(size) : size;
                const price = trade.price || trade.px || 0;
                const priceNum = typeof price === 'string' ? parseFloat(price) : price;

                // 5x Leverage ROE % Calculation
                const initialMargin = (szNum * priceNum) / 5;
                const roeVal = trade.roePct !== undefined ? trade.roePct : (initialMargin > 0 ? (pnlNum / initialMargin) * 100 : 0);
                const roePrefix = roeVal >= 0 ? '+' : '';
                const roeText = `${roePrefix}${roeVal.toFixed(1)}% ROE`;

                const date = new Date(trade.time);
                const timeStr = isNaN(date.getTime()) ? '-' : `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

                const source = trade.source || (trade.hash ? 'Bot' : 'Manual');
                const sourceLabel = source === 'Manual'
                  ? <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 600 }}>Manual</span>
                  : <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', fontWeight: 600 }}>Bot</span>;

                return (
                  <tr key={`${trade.coin}-${trade.time}-${idx}`}>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{timeStr}</td>
                    <td>
                      <span className="table-symbol">{trade.coin}</span>
                    </td>
                    <td>
                      <span className={`ticker-change ${dirClass}`} style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', fontWeight: 600, background: 'none' }}>
                        {direction}
                      </span>
                    </td>
                    <td>
                      {size} @ ${priceNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </td>
                    <td>
                      <span className={`ticker-change ${pnlClass}`} style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0.15rem 0.45rem' }}>
                        {pnlPrefix}${pnlNum.toFixed(2)} <span style={{ fontSize: '0.75rem', opacity: 0.85, marginLeft: '4px' }}>({roeText})</span>
                      </span>
                    </td>
                    <td>{sourceLabel}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                  No trade history found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Pagination Bar */}
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
            ◀ Previous 10
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
            Next 10 ▶
          </button>
        </div>
      )}
    </div>
  );
};
