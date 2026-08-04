import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

export default async function handler(req, res) {
  const walletAddress = "0x2453DEa35d5d83896304649d9389dB2E4bC4c0e7";
  let uniqueCoins = [];
  let wldMatches = [];
  let totalFills = 0;
  let errorMsg = null;

  try {
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const fills = await info.userFills({ user: walletAddress });
    
    totalFills = fills.length;
    const coinsMap = {};
    fills.forEach(f => {
      coinsMap[f.coin] = (coinsMap[f.coin] || 0) + 1;
      if (f.coin.toLowerCase().includes("wld")) {
        wldMatches.push(f);
      }
    });
    uniqueCoins = Object.entries(coinsMap).map(([coin, count]) => ({ coin, count }));
  } catch (e) {
    errorMsg = e.message;
  }
  
  res.status(200).json({
    walletAddress,
    totalFills,
    uniqueCoins,
    wldMatchesCount: wldMatches.length,
    wldMatchesSample: wldMatches.slice(0, 5),
    error: errorMsg
  });
}
