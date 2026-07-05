import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

function decodeCloid(cloidStr) {
  if (!cloidStr || !cloidStr.startsWith("0x626f745f")) return "Manual / Unknown";
  try {
    const hex = cloidStr.substring(10); // skip 0x626f745f
    const buf = Buffer.from(hex, "hex");
    if (buf.length < 6) return "Bot Entry (Format Error)";
    
    const score = buf.readUInt8(0);
    const nansenSmartMoneyVal = buf.readUInt8(1);
    const nansenWhaleVal = buf.readUInt8(2);
    const nansenExchangeVal = buf.readUInt8(3);
    const tnVwapVal = buf.readUInt8(4);
    const dirVal = buf.readUInt8(5);
    
    // Validate if this is a structured cloid or a legacy random cloid
    if (score > 100 || nansenSmartMoneyVal > 2 || nansenWhaleVal > 2 || nansenExchangeVal > 2 || tnVwapVal > 2 || (dirVal !== 1 && dirVal !== 2)) {
      return "Legacy Bot Order";
    }
    
    const reasons = [];
    reasons.push(`Score: ${score}`);
    
    if (nansenSmartMoneyVal === 1) reasons.push("Nansen Smart Money Inflow");
    else if (nansenSmartMoneyVal === 2) reasons.push("Nansen Smart Money Outflow");
    
    if (nansenWhaleVal === 1) reasons.push("Nansen Whale Inflow");
    else if (nansenWhaleVal === 2) reasons.push("Nansen Whale Outflow");
    
    if (nansenExchangeVal === 1) reasons.push("Nansen Exchange Inflow (Sell Pressure)");
    else if (nansenExchangeVal === 2) reasons.push("Nansen Exchange Outflow (Buy Pressure)");
    
    if (tnVwapVal === 1) reasons.push("TrueNorth VWAP Bullish");
    else if (tnVwapVal === 2) reasons.push("TrueNorth VWAP Bearish");
    
    return reasons.join(", ");
  } catch (e) {
    console.error("Failed to decode cloid:", e.message);
    return "Bot Entry (Decode Error)";
  }
}

export default async function handler(req, res) {
  const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;

  // 1. Local Mock Fallback if keys are not configured
  if (!walletAddress || walletAddress === "") {
    console.log("[api/pnl] No HYPERLIQUID_WALLET_ADDRESS found. Returning mock performance data for local UI testing.");
    
    const mockPositions = [
      {
        coin: "ZEC",
        size: 0.15,
        direction: "LONG",
        entryPx: 421.69,
        markPx: 429.71,
        unrealizedPnl: 1.20,
        marginUsed: 12.65,
        leverage: 5,
        entryReason: "Score: 95, Nansen Smart Money Inflow, TrueNorth VWAP Bullish"
      }
    ];

    const mockTrades = [
      {
        coin: "ETH",
        direction: "LONG",
        price: 1720.00,
        size: 2.50,
        pnl: 142.50,
        time: Date.now() - 3600000 * 2 // 2 hours ago
      },
      {
        coin: "SOL",
        direction: "SHORT",
        price: 18.50,
        size: 50.00,
        pnl: -25.00,
        time: Date.now() - 3600000 * 6 // 6 hours ago
      },
      {
        coin: "LINK",
        direction: "LONG",
        price: 13.10,
        size: 80.00,
        pnl: 72.00,
        time: Date.now() - 3600000 * 24 // 24 hours ago
      },
      {
        coin: "HYPE",
        direction: "LONG",
        price: 54.50,
        size: 10.00,
        pnl: 105.00,
        time: Date.now() - 3600000 * 48 // 2 days ago
      }
    ];

    return res.status(200).json({
      status: "success",
      mock: true,
      account: {
        withdrawable: 985.50,
        totalEquity: 986.70 // withdrawable + unrealized PnL ($1.20)
      },
      activePositions: mockPositions,
      recentTrades: mockTrades,
      totalRealizedPnl: 294.50,
      botRealizedPnl: 182.00,
      winRate: 75.0 // 3 wins out of 4 trades
    });
  }

  // 2. Production Real Data Fetching from Hyperliquid
  try {
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });

    console.log("[api/pnl] Querying Hyperliquid state for walletAddress:", walletAddress);
    const [userState, fills, spotState, openOrders] = await Promise.all([
      info.clearinghouseState({ user: walletAddress }),
      info.userFills({ user: walletAddress }),
      info.spotClearinghouseState({ user: walletAddress }).catch(() => null),
      info.frontendOpenOrders({ user: walletAddress }).catch(() => [])
    ]);
    console.log("[api/pnl] userState:", JSON.stringify(userState));
    console.log("[api/pnl] spotState:", JSON.stringify(spotState));
    console.log("[api/pnl] fills count:", fills ? fills.length : 0);
    if (fills) {
      console.log("[api/pnl] WLD Fills:", JSON.stringify(fills.filter(f => f.coin === "WLD")));
    }

    // Calculate withdrawable balance
    let withdrawableUsd = parseFloat(userState.withdrawable || "0");
    if (withdrawableUsd === 0 && spotState && spotState.balances) {
      const usdcBal = spotState.balances.find(b => b.coin === "USDC");
      if (usdcBal) {
        withdrawableUsd = parseFloat(usdcBal.total || "0") - parseFloat(usdcBal.hold || "0");
      }
    }

    // Process Active Positions
    const activePositions = userState.assetPositions
      .filter(p => parseFloat(p.position.szi || "0") !== 0)
      .map(p => {
        const pos = p.position;
        const size = parseFloat(pos.szi);
        const entryPx = parseFloat(pos.entryPx);
        const unrealizedPnl = parseFloat(pos.unrealizedPnl || "0");
        const marginUsed = parseFloat(pos.marginUsed || "0");
        const leverage = pos.leverage?.value || 5;
        
        // Find the opening fill for this position to decode its entry justification
        const entryFill = fills.find(f => f.coin === pos.coin && f.cloid && f.cloid.startsWith("0x626f745f"));
        const entryReason = entryFill ? decodeCloid(entryFill.cloid) : "Manual / Unknown";
        
        return {
          coin: pos.coin,
          size: Math.abs(size),
          direction: size > 0 ? "LONG" : "SHORT",
          entryPx,
          unrealizedPnl,
          marginUsed,
          leverage,
          entryReason
        };
      });

    // Calculate full account equity from Hyperliquid marginSummary or Spot/Perp withdrawable
    const accountValue = Math.max(
      parseFloat(userState.marginSummary?.accountValue || "0"),
      withdrawableUsd
    );

    // Calculate total unrealized PnL
    const totalUnrealizedPnl = activePositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const totalEquity = accountValue;

    // Process Trade History from Closed Fills
    // Show ALL trades (bot + manual) from July 5, 2026 onwards (Reset history to start fresh)
    const cutoffTime = new Date('2026-07-05T10:00:00Z').getTime();
    const closedFills = fills.filter(f => parseFloat(f.closedPnl || "0") !== 0);
    const recentFills = closedFills
      .filter(f => f.time >= cutoffTime)
      .sort((a, b) => b.time - a.time);

    const recentTrades = recentFills.slice(0, 50).map(f => {
      const pnl = parseFloat(f.closedPnl);
      const isBot = f.cloid && f.cloid.startsWith("0x626f745f");
      return {
        coin: f.coin,
        direction: f.side === "S" ? "LONG" : "SHORT", // selling closes LONG, buying closes SHORT
        price: parseFloat(f.px),
        size: parseFloat(f.sz),
        pnl,
        time: f.time,
        source: isBot ? "Bot" : "Manual"
      };
    });

    // All fills (ever) for total PnL
    const botClosedFills = closedFills.filter(f => f.cloid && f.cloid.startsWith("0x626f745f"));
    const totalRealizedPnl = recentFills.reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);
    const botRealizedPnl = botClosedFills
      .filter(f => f.time >= cutoffTime)
      .reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);

    // Win Rate from all trades since June 13
    const wins = recentFills.filter(f => parseFloat(f.closedPnl) > 0).length;
    const totalClosed = recentFills.length;
    const winRate = totalClosed > 0 ? parseFloat(((wins / totalClosed) * 100).toFixed(1)) : 0.0;

    // Starting balance on June 13: cash balance (equity excluding unrealized PnL) minus realized PnL since June 13
    const startBalance = Math.max(accountValue - totalUnrealizedPnl - totalRealizedPnl, 0.01);
    const balanceGrowthPct = parseFloat((((accountValue - startBalance) / startBalance) * 100).toFixed(2));

    // Calculate Max Drawdown since June 13
    const chronologicalFills = [...recentFills].reverse();
    let currentEquityRun = startBalance;
    let peak = startBalance;
    let maxDrawdownPct = 0;

    for (const fill of chronologicalFills) {
      const pnl = parseFloat(fill.closedPnl || "0");
      currentEquityRun += pnl;
      if (currentEquityRun > peak) {
        peak = currentEquityRun;
      }
      const dd = peak > 0 ? ((peak - currentEquityRun) / peak) * 100 : 0;
      if (dd > maxDrawdownPct) {
        maxDrawdownPct = dd;
      }
    }

    if (accountValue > peak) {
      peak = accountValue;
    }
    const finalDd = peak > 0 ? ((peak - accountValue) / peak) * 100 : 0;
    if (finalDd > maxDrawdownPct) {
      maxDrawdownPct = finalDd;
    }

    return res.status(200).json({
      status: "success",
      mock: false,
      account: {
        withdrawable: withdrawableUsd,
        totalEquity,
        accountValue: parseFloat(accountValue.toFixed(2)),
        startBalance: parseFloat(startBalance.toFixed(2)),
        balanceGrowthPct,
        maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2))
      },
      activePositions,
      recentTrades,
      openOrders,
      rawFills: fills.slice(0, 10),
      totalRealizedPnl: parseFloat(totalRealizedPnl.toFixed(2)),
      botRealizedPnl: parseFloat(botRealizedPnl.toFixed(2)),
      winRate
    });

  } catch (error) {
    console.error("[api/pnl] Error retrieving Hyperliquid portfolio state:", error);
    return res.status(500).json({ error: error.message });
  }
}
