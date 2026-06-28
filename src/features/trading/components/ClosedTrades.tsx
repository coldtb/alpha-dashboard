import React from 'react';
import { useStore } from '../../../store';

export const ClosedTrades: React.FC = () => {
  const { closedTrades } = useStore();

  return (
    <div className="perf-panel">
      <h3 className="panel-title">Recent Closed Trades</h3>
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
            {closedTrades && closedTrades.length > 0 ? (
              closedTrades.map((trade: any, idx) => {
                const pnlNum = typeof trade.pnl === 'string' ? parseFloat(trade.pnl) : (trade.pnl || 0);
                const pnlClass = pnlNum >= 0 ? 'change-up' : 'change-down';
                const pnlPrefix = pnlNum >= 0 ? '+' : '';
                
                const direction = trade.direction || trade.dir || (trade.side === 'B' ? 'LONG' : 'SHORT');
                const dirClass = direction === 'LONG' ? 'change-up' : 'change-down';
                
                const size = trade.size || trade.sz || '0';
                const price = trade.price || trade.px || 0;
                const priceNum = typeof price === 'string' ? parseFloat(price) : price;

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
                        {pnlPrefix}${pnlNum.toFixed(2)}
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
    </div>
  );
};
