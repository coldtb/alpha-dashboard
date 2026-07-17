// Deep analysis: check all Hyperliquid order history to find trailing SL evidence
// by looking at orders placed for known bot positions
const WALLET = "0x2453DEa35f5d83896304649d9389dB2E4bC4c0e7";

async function hl(body) {
  const r = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function run() {
  // Get all fills 
  const allFills = await hl({ type: "userFills", user: WALLET });
  const SINCE = new Date("2026-07-12T00:00:00Z").getTime();
  const fills = allFills.filter(f => f.time >= SINCE).sort((a,b) => a.time - b.time);
  console.log(`\n=== ALL FILLS SINCE JULY 12 (${fills.length} total) ===\n`);

  // Print each fill with full detail
  for (const f of fills) {
    const t = new Date(f.time).toISOString().replace('T',' ').slice(0,19);
    const pnl = parseFloat(f.closedPnl);
    const pnlStr = pnl !== 0 ? (pnl >= 0 ? `+$${pnl.toFixed(4)}` : `-$${Math.abs(pnl).toFixed(4)}`) : '$0';
    const isBot = (f.cloid && f.cloid.startsWith('0x626f74')) ? '[BOT]' : '[MANUAL]';
    console.log(`[${t}] ${f.coin.padEnd(5)} ${f.dir.padEnd(14)} | ${String(f.sz).padEnd(8)} @ $${parseFloat(f.px).toFixed(5)} | PnL=${pnlStr.padEnd(12)} | Fee=$${parseFloat(f.fee).toFixed(4)} | ${isBot}`);
    console.log(`        OID=${f.oid} | CLOID=${f.cloid || 'none'} | startPos=${f.startPosition} | crossed=${f.crossed}`);
  }

  // Now let's check: HYPE close Long on July 12 22:45
  // Entry OID must have been placed before - let's find in all fills
  console.log('\n=== HYPE POSITION INVESTIGATION ===');
  const hypeFills = allFills.filter(f => f.coin === 'HYPE').sort((a,b) => a.time - b.time);
  
  // Find the entry for the HYPE Long that was closed on Jul 12 
  // Close Long means we had an OPEN LONG before it
  let prevFill = null;
  for (const f of hypeFills) {
    if (f.dir === 'Close Long' && f.oid === 494215753939) {
      console.log(`\nFound HYPE Close: ${new Date(f.time).toISOString()} | closedPnl=$${f.closedPnl}`);
      console.log(`startPosition when closing: ${f.startPosition} (negative means was long)`);
      if (prevFill) {
        console.log(`Previous HYPE fill (entry?):`);
        console.log(`  ${new Date(prevFill.time).toISOString()} | ${prevFill.dir} | ${prevFill.sz} @ $${prevFill.px}`);
        console.log(`  Entry-to-close: ${((f.time - prevFill.time)/3600000).toFixed(1)} hours`);
        const entryPx = parseFloat(prevFill.px);
        const closePx = parseFloat(f.px);
        const pnlPct = ((closePx - entryPx) / entryPx * 100).toFixed(3);
        console.log(`  Price move: $${entryPx} → $${closePx} = ${pnlPct}%`);
      }
    }
    prevFill = f;
  }

  // SUI analysis - check trailing SL
  console.log('\n=== SUI POSITIONS ANALYSIS ===');
  const suiFills = allFills.filter(f => f.coin === 'SUI').sort((a,b) => a.time - b.time);
  const recentSui = suiFills.filter(f => f.time >= SINCE);
  
  for (let i = 0; i < recentSui.length; i++) {
    const f = recentSui[i];
    const t = new Date(f.time).toISOString().replace('T',' ').slice(0,19);
    console.log(`\n[${i+1}] [${t}] ${f.dir} | ${f.sz} @ $${f.px} | PnL=${f.closedPnl}`);
    if (f.dir.startsWith('Open')) {
      // Find the corresponding close
      const closeF = recentSui.find(c => c.time > f.time && c.dir.startsWith('Close'));
      if (closeF) {
        const durationHrs = ((closeF.time - f.time) / 3600000).toFixed(2);
        const entryPx = parseFloat(f.px);
        const closePx = parseFloat(closeF.px);
        const pnlPct = (f.dir === 'Open Short')
          ? ((entryPx - closePx) / entryPx * 100).toFixed(3)
          : ((closePx - entryPx) / entryPx * 100).toFixed(3);
        console.log(`  → CLOSED after ${durationHrs}h at $${closePx} | move=${pnlPct}% | PnL=$${closeF.closedPnl}`);
        console.log(`  → Close OID=${closeF.oid} | crossed=${closeF.crossed} (crossed=true means SL/TP triggered)`);
        // Determine if SL or TP hit
        if (closeF.crossed) {
          const grossPnl = parseFloat(closeF.closedPnl);
          if (grossPnl > 0) {
            console.log(`  → ✅ PROFIT → likely TP hit`);
          } else {
            console.log(`  → ❌ LOSS → likely SL hit`);
          }
        }
      }
    }
  }

  // BTC analysis
  console.log('\n=== BTC POSITION ANALYSIS ===');
  const btcFills = fills.filter(f => f.coin === 'BTC');
  const btcOpen = btcFills.find(f => f.dir === 'Open Short');
  const btcClose = btcFills.find(f => f.dir === 'Close Short');
  if (btcOpen && btcClose) {
    const entry = parseFloat(btcOpen.px);
    const close = parseFloat(btcClose.px);
    const durationHrs = ((btcClose.time - btcOpen.time) / 3600000).toFixed(1);
    const movePct = ((entry - close) / entry * 100).toFixed(3);
    console.log(`  Open Short: ${new Date(btcOpen.time).toISOString().slice(0,19)} @ $${btcOpen.px}`);
    console.log(`  Close Short: ${new Date(btcClose.time).toISOString().slice(0,19)} @ $${btcClose.px}`);
    console.log(`  Duration: ${durationHrs}h | Price move: ${movePct}% | crossed=${btcClose.crossed}`);
    const pnl = parseFloat(btcClose.closedPnl);
    console.log(`  Closed PnL: ${pnl >= 0 ? '✅' : '❌'} $${pnl.toFixed(4)}`);
    if (pnl < 0 && btcClose.crossed) console.log('  → SL HIT (price went against short)');
    if (pnl > 0 && btcClose.crossed) console.log('  → TP HIT');
  }

  // XRP analysis - 3 fills same OID at same time suggests pyramiding
  console.log('\n=== XRP INVESTIGATION (3 fills same OID) ===');
  const xrpFills = fills.filter(f => f.coin === 'XRP');
  console.log(`  3 fills with same OID at same time → PYRAMIDING (partially filled limit order)`);
  console.log(`  Total size opened: ${xrpFills.reduce((sum, f) => sum + parseFloat(f.sz), 0)} XRP @ $${xrpFills[0]?.px}`);
  console.log(`  This means the limit order was filled in 3 parts (11 + 11 + 74 = 96 XRP)`);
  // Check if there's a close yet
  const xrpAllFills = allFills.filter(f => f.coin === 'XRP' && f.time >= SINCE).sort((a,b) => a.time - b.time);
  const xrpClose = xrpAllFills.find(f => f.dir.startsWith('Close'));
  if (xrpClose) {
    console.log(`  Close found: ${new Date(xrpClose.time).toISOString()} | ${xrpClose.dir} | PnL=$${xrpClose.closedPnl}`);
  } else {
    console.log(`  ⏳ No close yet → XRP LONG STILL OPEN (as of now)`);
  }
}

run().catch(console.error);
