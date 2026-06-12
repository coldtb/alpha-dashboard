import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

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
        leverage: 5
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

    const [userState, fills, spotState] = await Promise.all([
      info.clearinghouseState({ user: walletAddress }),
      info.userFills({ user: walletAddress }),
      info.spotClearinghouseState({ user: walletAddress }).catch(() => null)
    ]);

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
        
        return {
          coin: pos.coin,
          size: Math.abs(size),
          direction: size > 0 ? "LONG" : "SHORT",
          entryPx,
          unrealizedPnl,
          marginUsed,
          leverage
        };
      });

    // Calculate total unrealized PnL
    const totalUnrealizedPnl = activePositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const totalEquity = withdrawableUsd + totalUnrealizedPnl;

    // Process Trade History from Closed Fills
    const closedFills = fills.filter(f => parseFloat(f.closedPnl || "0") !== 0);
    
    // Filter closed fills that were executed by the bot (tagged with bot cloid prefix)
    const botClosedFills = closedFills.filter(f => f.cloid && f.cloid.startsWith("0x626f745f"));
    
    const recentTrades = botClosedFills.slice(0, 20).map(f => {
      const pnl = parseFloat(f.closedPnl);
      return {
        coin: f.coin,
        direction: f.side === "S" ? "LONG" : "SHORT", // selling closes LONG, buying closes SHORT
        price: parseFloat(f.px),
        size: parseFloat(f.sz),
        pnl,
        time: f.time
      };
    });

    const totalRealizedPnl = closedFills.reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);
    const botRealizedPnl = botClosedFills.reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);
    
    // Calculate Win Rate (for Bot trades only)
    const wins = botClosedFills.filter(f => parseFloat(f.closedPnl) > 0).length;
    const totalClosed = botClosedFills.length;
    const winRate = totalClosed > 0 ? parseFloat(((wins / totalClosed) * 100).toFixed(1)) : 0.0;

    return res.status(200).json({
      status: "success",
      mock: false,
      account: {
        withdrawable: withdrawableUsd,
        totalEquity
      },
      activePositions,
      recentTrades,
      totalRealizedPnl: parseFloat(totalRealizedPnl.toFixed(2)),
      botRealizedPnl: parseFloat(botRealizedPnl.toFixed(2)),
      winRate
    });

  } catch (error) {
    console.error("[api/pnl] Error retrieving Hyperliquid portfolio state:", error);
    return res.status(500).json({ error: error.message });
  }
}
