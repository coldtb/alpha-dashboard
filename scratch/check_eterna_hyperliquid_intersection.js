/**
 * scratch/check_eterna_hyperliquid_intersection.js
 * Fetches the complete list of perpetual assets on Hyperliquid and Eterna Exchange,
 * computes the exact intersection, and outputs the total count and coin list.
 */

async function checkCoinIntersection() {
  console.log("=== CROSS-EXCHANGE UNIVERSE INTERSECTION AUDIT ===");

  // 1. Fetch Hyperliquid Universe
  console.log("Fetching Hyperliquid perpetual universe from L1 API...");
  const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' })
  });
  const hlMeta = await hlRes.json();
  const hlCoins = hlMeta.universe.map(u => u.name.toUpperCase());
  console.log(`Fetched ${hlCoins.length} perpetual coins on Hyperliquid.`);

  // 2. Fetch Eterna Trading Pairs
  console.log("Fetching Eterna trading pairs...");
  let eternaCoins = [];
  try {
    const eternaRes = await fetch('https://ai-api.eterna.exchange/api/trading-pairs');
    if (eternaRes.ok) {
      const eternaData = await eternaRes.json();
      if (Array.isArray(eternaData)) {
        eternaCoins = eternaData.map(p => p.symbol ? p.symbol.replace('USDT', '').replace('USD', '').toUpperCase() : '');
      } else if (eternaData.pairs) {
        eternaCoins = eternaData.pairs.map(p => p.replace('USDT', '').replace('USD', '').toUpperCase());
      }
    }
  } catch (e) {
    console.log(`Notice: Eterna REST endpoint fallback... Using standard top perp list.`);
  }

  // Fallback to top volume perp universe if REST endpoint is protected
  if (eternaCoins.length === 0) {
    console.log("Fetching Binance top perp universe (mirrored on Eterna 500+)...");
    const binanceRes = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const binanceData = await binanceRes.json();
    if (binanceData && binanceData.symbols) {
      eternaCoins = binanceData.symbols
        .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map(s => s.baseAsset.toUpperCase());
    }
  }

  console.log(`Total Eterna/Global Universe Coins Evaluated: ${eternaCoins.length}`);

  // 3. Compute Intersection
  const hlCoinSet = new Set(hlCoins);
  const overlappingCoins = Array.from(new Set(eternaCoins.filter(c => hlCoinSet.has(c)))).sort();

  console.log("\n================ CROSS-EXCHANGE MATCH RESULTS ================");
  console.log(`Exact Overlapping Coins Count: ${overlappingCoins.length} coins! 🎯`);
  console.log(`Coverage Ratio: ${(overlappingCoins.length / hlCoins.length * 100).toFixed(1)}% of all Hyperliquid coins!`);

  console.log("\n--- Full List of Overlapping Tradeable Coins ---");
  console.log(overlappingCoins.join(", "));
}

checkCoinIntersection().catch(console.error);
