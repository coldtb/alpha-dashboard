import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

async function run() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  console.log("Testing historical data fetching...");
  
  try {
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000;
    
    console.log("Fetching candles for BTC...");
    const candles = await info.candleSnapshot({
      coin: "BTC",
      interval: "1h",
      startTime: startTime,
      endTime: endTime
    });
    
    console.log(`Successfully fetched ${candles.length} candles.`);
    if (candles.length > 0) {
      console.log("Sample candle:", JSON.stringify(candles[0]));
    }
    
    console.log("Fetching funding history for BTC...");
    const funding = await info.fundingHistory({
      coin: "BTC",
      startTime: startTime,
      endTime: endTime
    });
    console.log(`Successfully fetched ${funding.length} funding history records.`);
    if (funding.length > 0) {
      console.log("Sample funding:", JSON.stringify(funding[0]));
    }

    console.log("\nFetching historical methods list...");
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(info));
    console.log("Available InfoClient methods:", methods.filter(m => m.toLowerCase().includes("funding") || m.toLowerCase().includes("candle") || m.toLowerCase().includes("history")));

  } catch (e) {
    console.error("Error fetching historical data:", e.message);
  }
}

run();
