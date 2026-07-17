import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

async function main() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const endTime = Date.now();
  const startTime = endTime - 90 * 24 * 60 * 60 * 1000; // 90 days

  console.log("Fetching HYPE funding history...");
  const fundingHistory = [];
  const chunkMs = 30 * 24 * 60 * 60 * 1000;
  let currentStart = startTime;

  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + chunkMs, endTime);
    const chunk = await info.fundingHistory({
      coin: "HYPE",
      startTime: currentStart,
      endTime: currentEnd
    });
    if (chunk && chunk.length > 0) {
      fundingHistory.push(...chunk);
    }
    currentStart += chunkMs;
  }

  console.log(`Successfully fetched ${fundingHistory.length} funding rate entries.`);

  let positiveHours = 0;
  let negativeHours = 0;
  let totalFunding = 0;
  let maxPositive = 0;
  let maxNegative = 0;

  let aboveThresholdCount = 0; // > 0.0001 (standard positive bias)
  let extremelyPositiveCount = 0; // > 0.0003

  fundingHistory.forEach(item => {
    const rate = parseFloat(item.fundingRate);
    totalFunding += rate;

    if (rate > 0) {
      positiveHours++;
      if (rate > maxPositive) maxPositive = rate;
    } else if (rate < 0) {
      negativeHours++;
      if (rate < maxNegative) maxNegative = rate;
    }

    if (rate > 0.0001) aboveThresholdCount++;
    if (rate > 0.0003) extremelyPositiveCount++;
  });

  const avgFunding = totalFunding / fundingHistory.length;
  const positivePct = (positiveHours / fundingHistory.length) * 100;
  const negativePct = (negativeHours / fundingHistory.length) * 100;

  console.log("\n=== HYPE FUNDING RATE ANALYSIS (90 DAYS) ===");
  console.log(`Average Funding Rate (Hourly): ${(avgFunding * 100).toFixed(5)}%`);
  console.log(`Average Funding Rate (8h Equivalent): ${(avgFunding * 8 * 100).toFixed(4)}%`);
  console.log(`Positive Funding Hours: ${positiveHours} (${positivePct.toFixed(1)}%)`);
  console.log(`Negative Funding Hours: ${negativeHours} (${negativePct.toFixed(1)}%)`);
  console.log(`Max Positive Funding (Hourly): ${(maxPositive * 100).toFixed(4)}%`);
  console.log(`Max Negative Funding (Hourly): ${(maxNegative * 100).toFixed(4)}%`);
  console.log(`Hours with Funding > 0.0001 (Standard Bias threshold): ${aboveThresholdCount} (${((aboveThresholdCount / fundingHistory.length) * 100).toFixed(1)}%)`);
  console.log(`Hours with Funding > 0.0003 (Extreme Bias threshold): ${extremelyPositiveCount} (${((extremelyPositiveCount / fundingHistory.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
