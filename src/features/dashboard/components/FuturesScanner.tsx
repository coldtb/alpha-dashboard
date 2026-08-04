import React, { useState } from 'react';
import { useStore } from '../../../store';
import { formatPriceText, formatVolume } from '../../../utils/helpers';

export const FuturesScanner: React.FC = () => {
  const { top100Coins, openDrawer } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'squeeze' | 'consolidating'>('all');

  const filteredCoins = top100Coins.filter(coin => {
    const matchesSearch = coin.symbol.toUpperCase().includes(searchQuery.toUpperCase().trim());
    let matchesFilter = true;
    if (activeFilter === 'squeeze') {
      matchesFilter = coin.setup === 'Squeeze Setup';
    } else if (activeFilter === 'consolidating') {
      matchesFilter = coin.setup === 'Consolidating';
    }
    return matchesSearch && matchesFilter;
  });

  return (
    <section>
      <h2 className="grid-section-title">
        <svg width="20" height="20" fill="var(--color-blue)" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
          <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
        </svg>
        Top 100 Futures Scanner
      </h2>

      {/* Controls */}
      <div className="scanner-controls">
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" style={{ width: '16px', height: '16px' }}>
            <path fill="currentColor" d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by symbol (e.g. BTC, HYPE)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <button
            className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All Markets
          </button>
          <button
            className={`filter-btn ${activeFilter === 'squeeze' ? 'active' : ''}`}
            onClick={() => setActiveFilter('squeeze')}
          >
            Squeeze Setup
          </button>
          <button
            className={`filter-btn ${activeFilter === 'consolidating' ? 'active' : ''}`}
            onClick={() => setActiveFilter('consolidating')}
          >
            Consolidating
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="scanner-table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Rank</th>
              <th>Asset</th>
              <th>Live Price</th>
              <th>24h Change</th>
              <th>24h Volume</th>
              <th>Funding Rate</th>
              <th style={{ textAlign: 'right' }}>Signal Setup</th>
            </tr>
          </thead>
          <tbody>
            {filteredCoins.length > 0 ? (
              filteredCoins.map((coin) => {
                const isSqueeze = coin.setup === 'Squeeze Setup';
                const rowClass = isSqueeze ? 'table-squeeze-row' : '';
                const changeClass = coin.change >= 0 ? 'change-up' : 'change-down';
                const changePrefix = coin.change >= 0 ? '+' : '';
                const fundingPercent = (coin.funding * 100).toFixed(4);
                const fundingClass = coin.funding < 0 ? 'change-up' : '';

                let setupBadge = (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {coin.setup || 'Neutral'}
                  </span>
                );
                if (isSqueeze) {
                  setupBadge = <span className="badge-squeeze">SQUEEZE SETUP</span>;
                } else if (coin.setup === 'Consolidating') {
                  setupBadge = (
                    <span
                      className="badge-squeeze"
                      style={{
                        background: 'rgba(0, 176, 255, 0.1)',
                        color: 'var(--color-blue)',
                        border: '1px solid var(--color-blue)',
                      }}
                    >
                      CONSOLIDATING
                    </span>
                  );
                }

                return (
                  <tr
                    key={coin.symbol}
                    className={rowClass}
                    onClick={() => openDrawer(coin)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        #{coin.rank || (coin.symbol === 'HYPE' ? '101' : '?')}
                      </span>
                    </td>
                    <td>
                      <span className="table-symbol">{coin.symbol}</span>
                    </td>
                    <td id={`price-table-${coin.symbol}`} className="ticker-price-cell">
                      {formatPriceText(coin.price)}
                    </td>
                    <td>
                      <span className={`ticker-change ${changeClass}`}>
                        {changePrefix}
                        {coin.change.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                      ${formatVolume(coin.volume)}
                    </td>
                    <td>
                      <span className={fundingClass} style={{ fontWeight: 500 }}>
                        {fundingPercent}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{setupBadge}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                  No matching coins found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
