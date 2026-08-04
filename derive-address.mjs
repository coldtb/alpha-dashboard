// derive-address.mjs
// Reads HYPERLIQUID_PRIVATE_KEY from .env and prints the derived wallet address.
// Local only - no network. Used to fill HYPERLIQUID_WALLET_ADDRESS correctly.
import fs from 'fs';
import path from 'path';
import { privateKeyToAccount } from 'viem/accounts';

const p = path.join(process.cwd(), '.env');
if (!fs.existsSync(p)) {
  console.error('No .env found');
  process.exit(1);
}
const txt = fs.readFileSync(p, 'utf8');
let pk;
for (const line of txt.split(/\r?\n/)) {
  const m = line.match(/^HYPERLIQUID_PRIVATE_KEY=(.*)$/);
  if (m) { pk = m[1].trim(); break; }
}
if (!pk || pk.startsWith('__')) {
  console.error('HYPERLIQUID_PRIVATE_KEY not found or still placeholder');
  process.exit(1);
}
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
console.log(account.address);
