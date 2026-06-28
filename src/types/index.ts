export interface Ticker {
  symbol: string;
  price: number;
  change: number;
  volume: number;
  funding: number;
  high: number;
  low: number;
  score: number;
  assetIndex: number;
  rank?: number;
  setup?: string;
  assetInfo?: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
  };
  tnVwap?: number;
  nansenSmartMoney?: number;
  nansenWhale?: number;
  nansenExchange?: number;
}

export interface DeepInsights {
  taData: any;
  derivData: any;
  whaleData: any;
  optionsData: any;
}

export interface Position {
  coin: string;
  szi: string; // token size (positive for long, negative for short)
  entryPx: string;
  leverage: string;
  marginUsed: string;
  unrealizedPnl: string;
  direction: 'LONG' | 'SHORT';
  justification?: string;
}

export interface Order {
  coin: string;
  oid: number;
  px: string;
  sz: string;
  side: 'B' | 'S';
  isTrigger: boolean;
  triggerPx?: string;
  tpsl?: 'tp' | 'sl';
}

export interface TradePlan {
  id: string;
  symbol: string;
  entry: number;
  sl: number;
  tp: number;
  riskPct: number;
  accountSize: number;
  direction: 'LONG' | 'SHORT';
  score: number;
  time: number;
}

export interface BacktestMetric {
  returnPct: number;
  winRate: number;
  maxDrawdown: number;
  tradesCount: number;
  equityCurve: { time: number; equity: number }[];
}

export interface ClosedTrade {
  time: number;
  coin: string;
  side: 'B' | 'S';
  sz: string;
  px: string;
  pnl: string;
  dir: string;
  hash?: string;
}

export interface BotConfig {
  minScore: number;
  minSlBuffer: number;
  minTpBuffer: number;
  entryShiftThreshold: number;
  replacementScoreDiff: number;
  nansenBuilderAddress: string;
  nansenBuilderFeeRate: number;
  dryRun: boolean;
  blacklist: string[];
  enableSupportRebound: boolean;
  minSupportDropPct: number;
  supportMinStrength: number;
  enableResistanceRebound: boolean;
  minResistanceRisePct: number;
  resistanceMinStrength: number;
  entryBufferPct: number;
  maxReboundDistancePct: number;
  enableNansenScoring: boolean;
  cooldownHours: number;
  minFillValueUsd: number;
  watchlist: string[];
  watchlistBonus: number;
  binanceVolumeThresholds: number[];
  hyperliquidVolumeThresholds: number[];
  maxTpPct: number;
}
