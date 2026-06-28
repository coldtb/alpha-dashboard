import React from 'react';
import { useStore } from '../../../store';
import { formatPriceText } from '../../../utils/helpers';
import { defaultSocialAlphaTokens } from '../../../utils/helpers';
import { Button } from '../../../components/ui/Button';
import { Backtester } from '../../backtest/components/Backtester';

interface OpportunityPodiumProps {
  onApplyPlan: (symbol: string, entry: number, sl: number, tp: number) => void;
}

export const OpportunityPodium: React.FC<OpportunityPodiumProps> = ({ onApplyPlan }) => {
  const { 
    top100Coins, 
    customTrades, 
    activeTab, 
    setActiveTab, 
    removeCustomTrade, 
    openDrawer 
  } = useStore();

  // Get Top 3 candidates for Podium
  const topCandidates = top100Coins.slice(0, 3);

  // Copy address helper
  const handleCopyAddress = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    alert(`Contract address copied: ${address}`);
  };

  return (
    <section className="signals-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header Tabs */}
      <div className="signals-header-tabs">
        <Button variant="tab" active={activeTab === 'market'} onClick={() => setActiveTab('market')}>
          Market Alpha
        </Button>
        <Button variant="tab" active={activeTab === 'custom'} onClick={() => setActiveTab('custom')}>
          My Plans ({customTrades.length})
        </Button>
        <Button variant="tab" active={activeTab === 'social'} onClick={() => setActiveTab('social')}>
          Social Alpha
        </Button>
        <Button variant="tab" active={activeTab === 'backtest'} onClick={() => setActiveTab('backtest')}>
          Backtest
        </Button>
      </div>

      {/* Tab Contents */}
      <div className="podium-container" style={{ flex: 1, marginTop: '0.8rem' }}>
        
        {/* 1. Market Alpha Tab */}
        {activeTab === 'market' && (
          <div className="podium-grid-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
            {topCandidates.length > 0 ? (
              topCandidates.map((coin, index) => {
                const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : 'rank-3';
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                
                // Strategy levels
                const sl = coin.price * 0.97;
                const tp = coin.price * 1.05;

                return (
                  <div 
                    key={coin.symbol} 
                    className={`ticker-card ${rankClass}`} 
                    onClick={() => openDrawer(coin)}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.8rem', position: 'relative' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.2rem' }}>{medal} {coin.symbol}</span>
                      <span className="ticker-score" style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>
                        Score: {coin.score}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{formatPriceText(coin.price)}</span>
                      <span className={coin.change >= 0 ? 'change-up' : 'change-down'} style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {coin.change >= 0 ? '+' : ''}{coin.change.toFixed(2)}%
                      </span>
                    </div>

                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                      <span>Setup: </span>
                      <span style={{ color: coin.setup?.includes('Squeeze') ? 'var(--color-primary)' : 'var(--color-text)' }}>{coin.setup}</span>
                    </div>

                    <Button 
                      variant="primary" 
                      style={{ marginTop: '0.6rem', padding: '0.3rem 0.5rem', fontSize: '0.75rem', width: '100%' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyPlan(coin.symbol, coin.price, sl, tp);
                      }}
                    >
                      Apply Setup to Planner
                    </Button>
                  </div>
                );
              })
            ) : (
              <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                No opportunities loaded. Wait for scanner...
              </div>
            )}
          </div>
        )}

        {/* 2. My Plans Tab */}
        {activeTab === 'custom' && (
          <div className="custom-plans-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '250px', overflowY: 'auto' }}>
            {customTrades.length > 0 ? (
              customTrades.map((plan) => (
                <div 
                  key={plan.id} 
                  className="ticker-card" 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{plan.symbol}</span>
                      <span className={plan.direction === 'LONG' ? 'change-up' : 'change-down'} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 4px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}>
                        {plan.direction}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Score: {plan.score}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Entry: <span style={{ color: '#fff' }}>${plan.entry.toFixed(2)}</span> | SL: <span style={{ color: 'var(--color-red)' }}>${plan.sl.toFixed(2)}</span> | TP: <span style={{ color: 'var(--color-green)' }}>${plan.tp.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button 
                    variant="danger" 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    onClick={() => removeCustomTrade(plan.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                No custom trade plans saved. Use the Alpha Planner on the left!
              </div>
            )}
          </div>
        )}

        {/* 3. Social Alpha Tab */}
        {activeTab === 'social' && (
          <div className="social-tokens-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '250px', overflowY: 'auto' }}>
            {defaultSocialAlphaTokens.map((token) => (
              <div 
                key={token.symbol} 
                className={`ticker-card ${token.standout ? 'rank-3' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 700 }}>{token.symbol}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: '4px' }}>
                      {token.chain}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-green)' }}>{token.change}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Mcap: {token.mcap} | Vol: {token.vol} | <span style={{ color: '#fff' }}>{token.signal}</span>
                  </div>
                </div>

                <Button 
                  variant="secondary"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', textTransform: 'none' }}
                  onClick={(e) => handleCopyAddress(token.address, e)}
                >
                  Copy CA
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 4. Backtest Tab */}
        {activeTab === 'backtest' && (
          <Backtester />
        )}

      </div>
    </section>
  );
};
