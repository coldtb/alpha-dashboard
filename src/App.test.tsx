import { renderToString } from 'react-dom/server';
import App from './App';
import { vi, describe, it, expect } from 'vitest';

// Mock fetch globally
(globalThis as any).fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/config')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ minSlBuffer: 0.010, minTpBuffer: 0.005, maxTpPct: 0.10 }),
    });
  }
  if (url.includes('/api/pnl')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        status: "success",
        account: {
          withdrawable: 1000,
          totalEquity: 1050,
          balanceGrowthPct: 5.0,
          maxDrawdownPct: 2.0
        },
        activePositions: [],
        recentTrades: [],
        botRealizedPnl: 50.0,
        winRate: 80.0
      }),
    });
  }
  if (url.includes('binance.com')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  }
  if (url.includes('hyperliquid.xyz')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ HYPE: "15.5" }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

// Mock WebSocket
class MockWebSocket {
  onopen: any = null;
  onmessage: any = null;
  onerror: any = null;
  onclose: any = null;
  close = vi.fn();
}
(globalThis as any).WebSocket = MockWebSocket as any;

describe('App component', () => {
  it('renders without crashing', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Alpha Trade Planner');
    expect(html).toContain('Market Alpha');
  });
});
