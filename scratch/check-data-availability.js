// Check which coins have 365 days of data - fetch latest candles and earliest
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

async function checkDataAvailability() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  const coins = ['BTC', 'XRP', 'SUI', 'HYPE'];
  const endTime = Date.now();

  console.log('\n=== Checking data availability for each coin ===\n');
  for (const coin of coins) {
    try {
      // Fetch the last 30 days to confirm data exists
      const recent = await info.candleSnapshot({
        coin,
        interval: '1d',
        startTime: endTime - 400 * 24 * 60 * 60 * 1000,
        endTime: endTime
      });
      
      if (!recent || recent.length === 0) {
        console.log(`${coin}: No data found`);
        continue;
      }

      const firstTs = recent[0].t;
      const lastTs  = recent[recent.length - 1].t;
      const daysAvail = Math.floor((lastTs - firstTs) / (24 * 60 * 60 * 1000));
      const firstDate = new Date(firstTs).toISOString().slice(0, 10);
      const lastDate  = new Date(lastTs).toISOString().slice(0, 10);
      console.log(`${coin}: ${firstDate} → ${lastDate} (${daysAvail} days, ${recent.length} daily candles)`);
    } catch (e) {
      console.log(`${coin}: ERROR - ${e.message}`);
    }
  }
}

checkDataAvailability().catch(console.error);
