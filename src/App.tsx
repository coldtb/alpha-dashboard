import React, { useEffect } from 'react';
import { StoreProvider, useStore } from './store';
import { Layout } from './layouts/Layout';
import { ActivePositions } from './features/trading/components/ActivePositions';
import { ClosedTrades } from './features/trading/components/ClosedTrades';
import { FuturesScanner } from './features/dashboard/components/FuturesScanner';
import { DeepInsightsDrawer } from './features/analytics/components/DeepInsightsDrawer';
import { EternaSignalStream } from './features/analytics/components/EternaSignalStream';
import { FallingDollarsRain } from './components/ui/FallingDollarsRain';

const DashboardContent: React.FC = () => {
  const {
    refreshScanner,
    refreshPerformance,
    balance,
    equity,
    botRealizedPnl,
    balanceGrowth,
    winRate,
    maxDrawdown,
  } = useStore();

  // Set up 45-second pollers for scanner and performance PnL (prevents Hyperliquid rate limits)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshScanner();
      refreshPerformance();
    }, 45000);
    return () => clearInterval(interval);
  }, [refreshScanner, refreshPerformance]);

  return (
    <Layout>
      {/* Falling Dollars Particle Rain Background Effect */}
      <FallingDollarsRain />

      {/* Live TrueNorth Signal Stream */}
      <EternaSignalStream />

      {/* Bot Performance & Active Positions Section */}
      <section className="performance-section">
        <h2 className="grid-section-title">
          <svg width="20" height="20" fill="var(--color-green)" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
            <path fill="currentColor" d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z" />
          </svg>
          Hyperliquid Mainnet Bot — Performance &amp; Active Positions
        </h2>

        {/* Performance Summary Cards */}
        <div className="perf-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.8rem' }}>
          <div className="perf-stat-card">
            <span className="perf-label">Available Balance</span>
            <span className="perf-val" id="perf-balance">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Total Equity</span>
            <span className="perf-val" id="perf-equity">
              ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Session PnL</span>
            <span className={`perf-val ${botRealizedPnl >= 0 ? 'change-up' : 'change-down'}`} id="perf-bot-realized-pnl" style={{ background: 'none', padding: 0 }}>
              {botRealizedPnl >= 0 ? '+' : ''}${botRealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Balance Growth</span>
            <span className={`perf-val ${balanceGrowth >= 0 ? 'change-up' : 'change-down'}`} id="perf-balance-growth" style={{ background: 'none', padding: 0 }}>
              {balanceGrowth >= 0 ? '+' : ''}{balanceGrowth.toFixed(2)}%
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Win Rate</span>
            <span className={`perf-val ${winRate >= 50 ? 'change-up' : 'change-down'}`} id="perf-win-rate" style={{ background: 'none', padding: 0 }}>
              {winRate.toFixed(1)}%
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Max Drawdown</span>
            <span className="perf-val change-down" id="perf-max-drawdown" style={{ background: 'none', padding: 0 }}>
              -{maxDrawdown.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Active Positions & Closed Trades */}
        <div className="perf-details-grid">
          <ActivePositions />
          <ClosedTrades />
        </div>
      </section>

      {/* Hyperliquid 30 Crypto Perps Live Scanner */}
      <FuturesScanner />

      {/* Side Deep Insights Drawer */}
      <DeepInsightsDrawer />
    </Layout>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  error: string;
}

class DashboardErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error: error.message || 'Unknown Dashboard Error' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Dashboard Error Boundary Caught Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#090a0f',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            padding: '2.5rem',
            maxWidth: '500px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>⚠️ Dashboard Component Render Warning</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              {this.state.error}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.75rem 1.75rem',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.95rem',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
              }}
            >
              Refresh Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <DashboardErrorBoundary>
      <StoreProvider>
        <DashboardContent />
      </StoreProvider>
    </DashboardErrorBoundary>
  );
}
