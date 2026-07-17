/**
 * scratch/run-trigger.js
 * Parses environment variables from .env.production and runs the coin triggers.
 */

import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.production');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      let val = parts.slice(1).join('=').trim();
      // Remove enclosing quotes if any
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

process.env.DRY_RUN = 'true';
process.env.NODE_ENV = 'development';

// Add dummy credentials for local dry-run testing if not provided
if (!process.env.HYPERLIQUID_PRIVATE_KEY) {
  process.env.HYPERLIQUID_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
}
if (!process.env.HYPERLIQUID_WALLET_ADDRESS) {
  process.env.HYPERLIQUID_WALLET_ADDRESS = '0x7E5F995C977F91D30107d6d52f6f4B478c9E6D59';
}

console.log("Environment variables loaded. Triggering bot...");
import('./trigger-each-coin-local.js');
