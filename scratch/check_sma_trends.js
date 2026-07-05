import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

const transport = new HttpTransport();
const info = new InfoClient({ transport });

const coins = ["BTC", "HYPE", "LINK", "XRP", "INJ", "WLD"];

async function main() {
  console.log("=== CHECKING 24H SMA TRENDS FOR WATCHLIST COINS ===");
  const endTime = Date.now();
  const startTime = endTime - 30 * 60 * 60 * 1000; // 30h to ensure we get 25 candles

  const metaAndCtxs = await info.metaAndAssetCtxs();
  const [hlMeta, hlAssetCtxs] = metaAndCtxs;

  for (const coin of coins) {
    try {
      const assetIndex = hlMeta.universe.findIndex(a => a.name === coin);
      if (assetIndex === -1) {
        console.log(`Coin ${coin} not found in universe`);
        continue;
      }
      
      const ctx = hlAssetCtxs[assetIndex];
      const currentPrice = parseFloat(ctx?.markPx || ctx?.midPx || "0");

      const candles = await info.candleSnapshot({ coin, interval: "1h", startTime, endTime });
      if (!candles || candles.length < 25) {
        console.log(`Not enough candles for ${coin}`);
        continue;
      }

      const last25 = candles.slice(-25);
      const sumClose = last25.reduce((sum, c) => sum + parseFloat(c.c), 0);
      const sma24 = sumClose / 25;

      const diffPct = ((currentPrice - sma24) / sma24) * 100;
      const trend = currentPrice >= sma24 ? "BULLISH (LONG ONLY)" : "BEARISH (SHORT ONLY)";

      console.log(`\nCoin: ${coin}`);
      console.log(`- Current Price: ${currentPrice}`);
      console.log(`- 24h SMA: ${sma24.toFixed(4)}`);
      console.log(`- Difference: ${diffPct.toFixed(2)}%`);
      console.log(`- Trend Status: ${trend}`);
      
      const maxDistancePct = 1.5; // 1.5% from bot config
      if (currentPrice >= sma24) {
        if (diffPct > maxDistancePct) {
          console.log(`- Status: LONG will be SKIPPED (Overextended: ${diffPct.toFixed(2)}% > ${maxDistancePct}%)`);
        } else {
          console.log(`- Status: LONG is ALLOWED`);
        }
      } else {
        const absDiff = Math.abs(diffPct);
        if (absDiff > maxDistancePct) {
          console.log(`- Status: SHORT will be SKIPPED (Overextended: ${absDiff.toFixed(2)}% > ${maxDistancePct}%)`);
        } else {
          console.log(`- Status: SHORT is ALLOWED`);
        }
      }
    } catch (e) {
      console.error(`Failed to check ${coin}:`, e.message);
    }
  }
}

main().catch(console.error);
