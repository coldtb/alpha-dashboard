const WALLET = "0x2453DEa35f5d83896304649d9389dB2E4bC4c0e7";

async function hl(body) {
  const r = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function run() {
  const now = Date.now();
  const since24h = now - 24 * 3600 * 1000;

  // 1. Account state
  const state = await hl({ type: "clearinghouseState", user: WALLET });
  const margin = state.marginSummary;
  const positions = state.assetPositions;
  const withdrawable = parseFloat(state.withdrawable);

  console.log("=== ACCOUNT STATE ===");
  console.log(`  Account Value:    $${parseFloat(margin.accountValue).toFixed(4)}`);
  console.log(`  Withdrawable:     $${withdrawable.toFixed(4)}`);
  console.log(`  Total Margin Used:$${parseFloat(margin.totalMarginUsed).toFixed(4)}`);
  console.log(`  Open Positions:   ${positions.length}`);

  if (positions.length > 0) {
    console.log("\n  Active Positions:");
    for (const p of positions) {
      const pos = p.position;
      const pnl = parseFloat(pos.unrealizedPnl);
      console.log(`    ${pos.coin}: ${parseFloat(pos.szi) > 0 ? 'LONG' : 'SHORT'} | Size=${pos.szi} | Entry=$${parseFloat(pos.entryPx).toFixed(5)} | uPnL=${pnl >= 0 ? '+' : ''}$${pnl.toFixed(4)}`);
    }
  }

  // 2. Open orders
  const orders = await hl({ type: "openOrders", user: WALLET });
  console.log(`\n=== OPEN ORDERS (${orders.length}) ===`);
  for (const o of orders) {
    const side = o.side === 'B' ? 'BUY' : 'SELL';
    const isBot = o.cloid && o.cloid.startsWith('0x626f74') ? '[BOT]' : '[manual]';
    console.log(`  ${o.coin} ${side} ${o.sz} @ $${o.limitPx} | OID=${o.oid} | ${isBot}`);
  }

  // 3. Recent fills (last 24h)
  const allFills = await hl({ type: "userFills", user: WALLET });
  const recent = allFills.filter(f => f.time >= since24h).sort((a,b) => a.time - b.time);
  console.log(`\n=== RECENT FILLS (last 24h, ${recent.length}) ===`);
  for (const f of recent) {
    const t = new Date(f.time).toISOString().replace('T',' ').slice(0,19);
    const pnl = parseFloat(f.closedPnl);
    const pnlStr = pnl !== 0 ? (pnl >= 0 ? `✅+$${pnl.toFixed(4)}` : `❌-$${Math.abs(pnl).toFixed(4)}`) : '';
    const isBot = f.cloid && f.cloid.startsWith('0x626f74') ? '[BOT]' : '[manual]';
    console.log(`  [${t}] ${f.coin} ${f.dir.padEnd(14)} | ${f.sz} @ $${parseFloat(f.px).toFixed(5)} | ${pnlStr} ${isBot}`);
  }
  if (recent.length === 0) console.log("  (no fills in last 24h)");

  // 4. Spot balance (USDC)
  const spot = await hl({ type: "spotClearinghouseState", user: WALLET });
  const usdc = spot.balances.find(b => b.coin === 'USDC');
  console.log(`\n=== SPOT BALANCE ===`);
  console.log(`  USDC: ${usdc ? usdc.total : '0'}`);

  // 5. Summary
  console.log(`\n=== HEALTH CHECK ===`);
  const totalUsd = withdrawable + parseFloat(margin.totalMarginUsed) + parseFloat(margin.accountValue === '0.0' && usdc ? usdc.total : 0);
  if (withdrawable > 0 || positions.length > 0 || orders.length > 0) {
    console.log(`  ✅ Bot wallet is ACTIVE`);
  } else {
    console.log(`  ⚠️  No perp balance — check if bot ran out of funds or withdrew`);
  }
  if (positions.length > 0) console.log(`  ✅ ${positions.length} position(s) currently open`);
  if (orders.length > 0) console.log(`  ✅ ${orders.length} limit order(s) pending`);
  if (recent.length > 0) console.log(`  ✅ ${recent.length} fill(s) in last 24h — bot is trading`);
  else console.log(`  ℹ️  No fills in last 24h`);

  // USDC spot info
  if (usdc) console.log(`  💰 Spot USDC balance: ${usdc.total}`);
}

run().catch(console.error);
