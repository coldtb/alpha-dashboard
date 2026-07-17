/**
 * scratch/trigger-each-coin-local.js
 * Invokes the bot handler locally for each coin separately.
 */

import handler from '../api/bot.js';

const coins = ['BTC', 'XRP', 'SUI', 'HYPE'];

async function triggerAll() {
  console.log(`\n======================================================`);
  console.log(`🚀 TRIGGERING LOCAL BOT CYCLE FOR EACH COIN INDIVIDUALLY`);
  console.log(`======================================================`);

  for (const coin of coins) {
    console.log(`\n------------------------------------------------------`);
    console.log(`👉 Running Bot Cycle for coin: ${coin}`);
    console.log(`------------------------------------------------------`);
    
    const mockReq = {
      query: {
        coin: coin,
        dry_run: 'true', // Run in dry run mode for safety/verification
        smart_sl_tp: 'true'
      },
      headers: {}
    };

    const mockRes = {
      status(code) {
        return {
          json(data) {
            console.log(`[Response ${code} for ${coin}]:`, JSON.stringify(data, null, 2));
          }
        };
      }
    };

    try {
      await handler(mockReq, mockRes);
    } catch (err) {
      console.error(`[Error running bot for ${coin}]:`, err.message);
    }
  }
  
  console.log(`\n======================================================`);
  console.log(`✅ Completed triggering bot cycles for all coins.`);
  console.log(`======================================================\n`);
}

triggerAll();
