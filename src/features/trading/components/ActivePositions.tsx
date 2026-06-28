import React from 'react';
import { useStore } from '../../../store';

export const ActivePositions: React.FC = () => {
  const { activePositions } = useStore();

  return (
    <div className="perf-panel">
      <h3 className="panel-title">Active Positions</h3>
      <div className="perf-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Direction</th>
              <th>Size</th>
              <th>Entry Price</th>
              <th>Unrealized PnL</th>
              <th>Margin (Lev)</th>
              <th>Entry Justification</th>
            </tr>
          </thead>
          <tbody>
            {activePositions && activePositions.length > 0 ? (
              activePositions.map((pos, idx) => {
                const pnlNum = typeof pos.unrealizedPnl === 'string' ? parseFloat(pos.unrealizedPnl) : pos.unrealizedPnl;
                const pnlClass = pnlNum >= 0 ? 'change-up' : 'change-down';
                const pnlPrefix = pnlNum >= 0 ? '+' : '';
                const dirClass = pos.direction === 'LONG' ? 'change-up' : 'change-down';
                
                // Leverage and entryPx representation
                const entryPxNum = typeof pos.entryPx === 'string' ? parseFloat(pos.entryPx) : pos.entryPx;
                const marginUsedNum = typeof pos.marginUsed === 'string' ? parseFloat(pos.marginUsed) : pos.marginUsed;
                
                return (
                  <tr key={`${pos.coin}-${idx}`}>
                    <td>
                      <span className="table-symbol">{pos.coin}</span>
                    </td>
                    <td>
                      <span className={`ticker-change ${dirClass}`} style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', fontWeight: 600, background: 'none' }}>
                        {pos.direction}
                      </span>
                    </td>
                    <td>{pos.szi || (pos as any).size}</td>
                    <td>
                      $
                      {entryPxNum.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                    </td>
                    <td>
                      <span className={`ticker-change ${pnlClass}`} style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0.15rem 0.45rem' }}>
                        {pnlPrefix}${pnlNum.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                      ${marginUsedNum.toFixed(2)} ({pos.leverage}x)
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: 'rgba(139, 92, 246, 0.12)',
                          color: '#a78bfa',
                          fontWeight: 500,
                          display: 'inline-block',
                          maxWidth: '250px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={pos.justification || (pos as any).entryReason}
                      >
                        {pos.justification || (pos as any).entryReason || 'No justification'}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                  No active positions at this time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
