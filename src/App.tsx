import React, { useState, useEffect } from 'react';
import { StoreProvider, useStore } from './store';
import { Layout } from './layouts/Layout';
import { TradePlanner } from './features/trading/components/TradePlanner';
import { OpportunityPodium } from './features/dashboard/components/OpportunityPodium';
import { ActivePositions } from './features/trading/components/ActivePositions';
import { ClosedTrades } from './features/trading/components/ClosedTrades';
import { FuturesScanner } from './features/dashboard/components/FuturesScanner';
import { PromptsHub } from './features/analytics/components/PromptsHub';
import { DeepInsightsDrawer } from './features/analytics/components/DeepInsightsDrawer';

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

  const [plannerDefaults, setPlannerDefaults] = useState<{ symbol: string; entry: number; sl: number; tp: number } | null>(null);

  // Set up 30-second pollers for scanner and performance PnL
  useEffect(() => {
    const interval = setInterval(() => {
      refreshScanner();
      refreshPerformance();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshScanner, refreshPerformance]);

  const handleApplyPlan = (symbol: string, entry: number, sl: number, tp: number) => {
    setPlannerDefaults({ symbol, entry, sl, tp });
    // Scroll planner into view if needed
    const plannerEl = document.querySelector('.planner-section');
    if (plannerEl) {
      plannerEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <Layout>
      {/* Falling Dollars Particle Layer - CSS only fallback or custom effect could go here */}
      <div id="falling-dollars-container" />

      {/* Trade Planner & Signals Row */}
      <div className="dashboard-top-row">
        <TradePlanner
          initialValues={plannerDefaults}
          clearInitialValues={() => setPlannerDefaults(null)}
        />
        <OpportunityPodium onApplyPlan={handleApplyPlan} />
      </div>

      {/* Bot Performance & Active Positions Section */}
      <section className="performance-section">
        <h2 className="grid-section-title">
          <svg width="20" height="20" fill="var(--color-green)" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
            <path fill="currentColor" d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z" />
          </svg>
          Bot Portfolio Performance & Active Positions
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
            <span className="perf-label">Total Account Equity</span>
            <span className="perf-val" id="perf-equity">
              ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Jun 13+ PnL (All)</span>
            <span className={`perf-val ${botRealizedPnl >= 0 ? 'change-up' : 'change-down'}`} id="perf-bot-realized-pnl" style={{ background: 'none', padding: 0 }}>
              {botRealizedPnl >= 0 ? '+' : ''}${botRealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Balance Growth (Jun 13)</span>
            <span className={`perf-val ${balanceGrowth >= 0 ? 'change-up' : 'change-down'}`} id="perf-balance-growth" style={{ background: 'none', padding: 0 }}>
              {balanceGrowth >= 0 ? '+' : ''}{balanceGrowth.toFixed(2)}%
            </span>
          </div>
          <div className="perf-stat-card">
            <span className="perf-label">Win Rate (Jun 13+)</span>
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

        {/* Active Positions & History Grid */}
        <div className="perf-details-grid">
          <ActivePositions />
          <ClosedTrades />
        </div>
      </section>

      {/* Top 100 Scanner */}
      <FuturesScanner />

      {/* Prompts Hub Section */}
      <PromptsHub />

      {/* Side Interactive Drawer & Backdrop */}
      <DeepInsightsDrawer />
    </Layout>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <DashboardContent />
    </StoreProvider>
  );
}
