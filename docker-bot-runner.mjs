/**
 * docker-bot-runner.mjs
 * Runs the bot handler every 5 minutes inside Docker (no Vercel cron needed)
 * Simulates the HTTP handler with a minimal req/res mock
 */

import handler from './api/bot.js';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const mockReq = {
  query: {},
  headers: {
    authorization: `Bearer ${process.env.CRON_SECRET || ''}`
  }
};

const mockRes = {
  status(code) {
    return {
      json(data) {
        console.log(`[Runner] Response ${code}:`, JSON.stringify(data).slice(0, 200));
      }
    };
  }
};

async function runOnce() {
  const start = Date.now();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[Runner] Bot cycle started at ${new Date().toISOString()}`);
  try {
    await handler(mockReq, mockRes);
  } catch (err) {
    console.error(`[Runner] Unhandled error in bot cycle:`, err.message);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Runner] Cycle completed in ${elapsed}s`);
}

// Run immediately on startup, then every 5 minutes
console.log(`[Runner] Alpha Bot starting. Interval: ${INTERVAL_MS / 60000} minutes`);
runOnce();
setInterval(runOnce, INTERVAL_MS);
