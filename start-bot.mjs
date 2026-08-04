// start-bot.mjs
// Loads .env (manual parser, no extra dependency), auto-derives the wallet
// address from the private key, then runs the Alpha bot.
// Mirrors docker-bot-runner.mjs but supports ONE_SHOT and reads secrets from .env
// so the private key never appears in your shell history or command line.
//
// Usage:
//   node start-bot.mjs                       # loop every 5 min
//   ONE_SHOT=true node start-bot.mjs         # run a single cycle then exit
//
// Safety: set DRY_RUN=true in .env to simulate (no real orders). Only set
// DRY_RUN=false when you are ready for live trading.

import fs from 'fs';
import path from 'path';

function loadEnv(file = '.env') {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) {
    console.warn(`[start-bot] No .env found at ${p}. Relying on existing environment variables.`);
    return;
  }
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
  console.log('[start-bot] Loaded .env');
}

loadEnv();

// Auto-derive wallet address from private key if not explicitly set.
if (!process.env.HYPERLIQUID_WALLET_ADDRESS || process.env.HYPERLIQUID_WALLET_ADDRESS.startsWith('__')) {
  try {
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (pk) {
      const { privateKeyToAccount } = await import('viem/accounts');
      const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
      process.env.HYPERLIQUID_WALLET_ADDRESS = account.address;
      console.log(`[start-bot] Derived HYPERLIQUID_WALLET_ADDRESS=${account.address}`);
    }
  } catch (e) {
    console.error('[start-bot] Failed to derive wallet address from private key:', e.message);
  }
}

const { default: handler } = await import('./api/bot.js');

const INTERVAL_MS = 5 * 60 * 1000;

const mockReq = {
  query: {},
  headers: {
    authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
  },
};

const mockRes = {
  status(code) {
    return {
      json(data) {
        console.log(`[Runner] Response ${code}:`, JSON.stringify(data).slice(0, 200));
      },
    };
  },
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

const isDryRun = process.env.DRY_RUN === 'true' || process.env.dryRun === 'true';
console.log(`[Runner] Alpha Bot starting. DRY_RUN=${isDryRun}`);

if (process.env.ONE_SHOT === 'true') {
  await runOnce();
  console.log('[Runner] ONE_SHOT complete. Exiting.');
  process.exit(0);
} else {
  runOnce();
  setInterval(runOnce, INTERVAL_MS);
}
