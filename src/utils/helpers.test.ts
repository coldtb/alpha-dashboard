import { describe, it, expect } from 'vitest';
import { 
  formatVolume, 
  formatPriceText, 
  detectAutoDirection, 
  calculateScore, 
  computeStrategyLevels 
} from './helpers';
import { Ticker } from '../types';

describe('Helpers unit tests', () => {
  describe('formatVolume', () => {
    it('should format billions correctly', () => {
      expect(formatVolume(1500000000)).toBe('1.50B');
    });

    it('should format millions correctly', () => {
      expect(formatVolume(2540000)).toBe('2.54M');
    });

    it('should format thousands correctly', () => {
      expect(formatVolume(34500)).toBe('34.50K');
    });

    it('should leave small numbers formatted to 2 decimals', () => {
      expect(formatVolume(123.456)).toBe('123.46');
    });
  });

  describe('formatPriceText', () => {
    it('should format zero as dash', () => {
      expect(formatPriceText(0)).toBe('-');
    });

    it('should format small decimals under 1 with 6 decimals', () => {
      expect(formatPriceText(0.1234567)).toBe('$0.123457');
    });

    it('should format decimals under 10 with 4 decimals', () => {
      expect(formatPriceText(5.67891)).toBe('$5.6789');
    });

    it('should format larger numbers with commas and 2 decimals', () => {
      expect(formatPriceText(12345.678)).toBe('$12,345.68');
    });
  });

  describe('detectAutoDirection', () => {
    const baseCoin: Ticker = {
      symbol: 'BTC',
      price: 60000,
      change: 0,
      volume: 100000000,
      funding: 0.0, // neutral funding
      high: 61000,
      low: 59000,
      score: 80,
      assetIndex: 0
    };

    it('should default to LONG for neutral metrics', () => {
      expect(detectAutoDirection(baseCoin)).toBe('LONG');
    });

    it('should detect LONG for negative funding rates', () => {
      const negativeFundingCoin = { ...baseCoin, funding: -0.0002 };
      expect(detectAutoDirection(negativeFundingCoin)).toBe('LONG');
    });

    it('should detect SHORT for positive funding rates', () => {
      const highFundingCoin = { ...baseCoin, funding: 0.0006 };
      expect(detectAutoDirection(highFundingCoin)).toBe('SHORT');
    });
  });

  describe('calculateScore', () => {
    it('should calculate low volatility and high volume squeeze score correctly', () => {
      const coin = {
        symbol: 'BTC',
        change: 1.2, // low volatility (+10 score +30 score)
        funding: -0.0003, // negative funding (+20 score +10 bonus)
        volume: 150000000, // high volume (+20 score)
      };
      
      const score = calculateScore(coin);
      // Base score should be: change <= 1.5 (+40) + absFunding > 0 (+20) + absFunding >= 0.0002 (+10) + volume > 100M (+20) + watchlist BTC (+15)
      // Total = 40 + 20 + 10 + 20 + 15 = 105 (capped at 100)
      expect(score).toBe(100);
    });

    it('should calculate score for high volatility and low volume altcoin correctly', () => {
      const coin = {
        symbol: 'DOGE',
        change: 8.5, // high change (0 score)
        funding: 0.0001, // low funding (+20 score)
        volume: 5000000, // low volume (0 score)
      };
      
      const score = calculateScore(coin);
      // Total = 0 + 20 + 0 = 20
      expect(score).toBe(20);
    });
  });

  describe('computeStrategyLevels', () => {
    const coin = {
      symbol: 'BTC',
      price: 60000,
      high: 61000,
      low: 59000,
      funding: 0.0001
    };

    it('should compute LONG strategy levels correctly', () => {
      const levels = computeStrategyLevels(coin, 'LONG', null);
      expect(levels.entry).toBe(60000);
      expect(levels.sl).toBe(58800); // capped at -2% (60000 * 0.98 = 58800)
      expect(levels.tp).toBe(63770); // entry + (entry - sl_calculated) * 2 = 60000 + 1885 * 2 = 63770
    });

    it('should compute SHORT strategy levels correctly', () => {
      const levels = computeStrategyLevels(coin, 'SHORT', null);
      expect(levels.entry).toBe(60000);
      expect(levels.sl).toBe(61200); // capped at +2% (60000 * 1.02 = 61200)
      expect(levels.tp).toBe(56170); // entry - (sl_calculated - entry) * 2 = 60000 - 1915 * 2 = 56170
    });
  });
});
