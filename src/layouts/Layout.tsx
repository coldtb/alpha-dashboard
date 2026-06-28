import React from 'react';
import { useStore } from '../store';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { wsStatus } = useStore();

  return (
    <div className="app-layout">
      {/* Glowing Neon Aura Orbs */}
      <div className="bg-glow-orb-container">
        <div className="bg-glow-orb bg-glow-orb-1"></div>
        <div className="bg-glow-orb bg-glow-orb-2"></div>
        <div className="bg-glow-orb bg-glow-orb-3"></div>
      </div>

      {/* Header Section */}
      <header>
        <div className="logo-container">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24">
              <path d="M12,2L2,22H22L12,2M12,6L18.8,18H5.2L12,6M11,10V14H13V10H11M11,16V18H13V16H11Z"/>
            </svg>
          </div>
          <div>
            <h1>Antigravity Alpha Dashboard</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Real-Time Derivatives & Volatility Scanner
            </p>
          </div>
        </div>
        
        <div className="status-badge">
          <div className={`pulse-dot ${wsStatus === 'Connected' ? 'active' : 'reconnecting'}`} />
          <span>WebSocket: {wsStatus}</span>
        </div>
      </header>

      {/* Main Container */}
      <main>
        {children}
      </main>
    </div>
  );
};
