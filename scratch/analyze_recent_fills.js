// Wallet address from vercel logs
const WALLET = "0x2453DEa35f5d83896304649d9389dB2E4bC4c0e7";

async function run() {
  const resp = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "userFills", user: WALLET })
  });
  const allFills = await resp.json();
  console.log(`Total fills: ${allFills.length}`);

  // July 12, 2026 00:00:00 UTC = 1783814400000
  const SINCE = new Date("2026-07-12T00:00:00Z").getTime();
  const fills = allFills
    .filter(f => f.time >= SINCE)
    .sort((a, b) => a.time - b.time);

  console.log(`Fills since July 12: ${fills.length}\n`);

  // Group by coin
  const byCoin = {};
  for (const f of fills) {
    if (!byCoin[f.coin]) byCoin[f.coin] = [];
    byCoin[f.coin].push(f);
  }

  for (const coin of Object.keys(byCoin).sort()) {
    console.log(`\n═══════════════════════════════`);
    console.log(`  ${coin} — ${byCoin[coin].length} fills`);
    console.log(`═══════════════════════════════`);
    
    for (const f of byCoin[coin]) {
      const t = new Date(f.time).toISOString().replace('T',' ').slice(0,19);
      const pnl = parseFloat(f.closedPnl);
      const pnlStr = pnl !== 0 ? (pnl > 0 ? `✅ +$${pnl.toFixed(4)}` : `❌ -$${Math.abs(pnl).toFixed(4)}`) : '';
      const isBot = f.cloid && f.cloid.startsWith('0x626f74') ? '[BOT]' : '[manual]';
      const isTp = f.oid !== undefined && f.crossed ? `crossed=true` : `crossed=false`;
      console.log(`  ${t} | ${f.dir.padEnd(12)} | ${f.sz} @ $${parseFloat(f.px).toFixed(5)} | ${pnlStr.padEnd(18)} | fee=$${parseFloat(f.fee).toFixed(4)} | ${isBot} | ${isTp} | oid=${f.oid}`);
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SUMMARY since July 12:`);
  let totalPnl = 0;
  let totalFee = 0;
  let wins = 0; let losses = 0;
  const closeFills = fills.filter(f => f.dir.startsWith('Close'));
  for (const f of closeFills) {
    const pnl = parseFloat(f.closedPnl);
    totalPnl += pnl;
    totalFee += parseFloat(f.fee);
    if (pnl > 0) wins++;
    else losses++;
  }
  // Also add fees from open fills
  const openFills = fills.filter(f => f.dir.startsWith('Open'));
  for (const f of openFills) {
    totalFee += parseFloat(f.fee);
  }
  console.log(`  Closed trades: ${closeFills.length} (${wins}W / ${losses}L)`);
  console.log(`  Total PnL: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(4)}`);
  console.log(`  Total Fees: -$${totalFee.toFixed(4)}`);
  console.log(`  Net PnL: ${(totalPnl - totalFee) >= 0 ? '+' : ''}$${(totalPnl - totalFee).toFixed(4)}`);

  // Check trailing SL — look for fills where oid appears in multiple closes (pyramided)
  console.log(`\nTrailing SL check — looking for repeated oid closes:`);
  const oidCounts = {};
  for (const f of fills) {
    oidCounts[f.oid] = (oidCounts[f.oid] || 0) + 1;
  }
  const repeatedOids = Object.entries(oidCounts).filter(([,c]) => c > 1);
  if (repeatedOids.length > 0) {
    console.log(`  Found ${repeatedOids.length} OIDs with multiple fills (possible partial close or pyramiding):`);
    for (const [oid, count] of repeatedOids) {
      const fs = fills.filter(f => f.oid == oid);
      console.log(`  OID ${oid} (x${count}):`);
      fs.forEach(f => console.log(`    ${new Date(f.time).toISOString().slice(0,19)} | ${f.dir} | ${f.sz} @ $${f.px} | PnL=$${f.closedPnl}`));
    }
  } else {
    console.log(`  No repeated OIDs — each order only filled once`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
