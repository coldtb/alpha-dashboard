/**
 * scratch/analyze-live-losses.js
 * Parses the vercel_json.jsonl file to extract and analyze the live trading fills,
 * focusing on why losses occurred.
 */

import fs from 'fs';

function analyze() {
  const content = fs.readFileSync('scratch/vercel_json.jsonl', 'utf8');
  const lines = content.split('\n');
  const allFills = new Map(); // hash -> fill
  
  lines.forEach(line => {
    if (line.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(line);
        if (obj.logs) {
          obj.logs.forEach(l => {
            if (l.message && l.message.includes('WLD Fills:')) {
              const prefix = 'WLD Fills:';
              const prefixIdx = l.message.indexOf(prefix);
              const startIdx = l.message.indexOf('[', prefixIdx);
              const endIdx = l.message.lastIndexOf(']') + 1;
              const fillsJson = l.message.substring(startIdx, endIdx);
              try {
                const fills = JSON.parse(fillsJson);
                fills.forEach(f => {
                  allFills.set(f.hash, f);
                });
              } catch (e) {
                console.error("JSON parse error for fills:", e.message);
              }
            }
          });
        }
      } catch (e) {
        console.error("JSON parse error for line:", e.message);
      }
    }
  });

  const fills = Array.from(allFills.values());
  console.log(`\n======================================================`);
  console.log(`📊 ANALYZING LIVE TRADES FROM VERCEL LOGS`);
  console.log(`======================================================`);
  console.log(`Total unique fills found: ${fills.length}`);

  // Filter closed trades (fills that closed a position and generated PnL)
  const closedTrades = fills.filter(f => parseFloat(f.closedPnl || '0') !== 0);
  console.log(`Total closed trades: ${closedTrades.length}`);

  const wins = closedTrades.filter(t => parseFloat(t.closedPnl) > 0);
  const losses = closedTrades.filter(t => parseFloat(t.closedPnl) < 0);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  console.log(`Win Rate: ${winRate.toFixed(1)}%`);

  const totalPnL = closedTrades.reduce((sum, t) => sum + parseFloat(t.closedPnl), 0);
  console.log(`Total Realized PnL: $${totalPnL.toFixed(2)}`);

  console.log(`\n------------------------------------------------------`);
  console.log(`❌ DETAILS OF LOSING TRADES`);
  console.log(`------------------------------------------------------`);
  
  losses.sort((a,b) => b.time - a.time).forEach((t, index) => {
    const date = new Date(t.time).toISOString().slice(0, 16);
    // Find the opening fill for this trade to compute entry price and duration
    // Opening fill has the same coin, opposite side, and happened before
    const isCloseShort = t.side === 'B'; // buying closes short
    const entrySide = isCloseShort ? 'A' : 'B';
    
    const openingFill = fills
      .filter(f => f.coin === t.coin && f.side === entrySide && f.time < t.time)
      .sort((a,b) => b.time - a.time)[0]; // nearest opening fill before this close
      
    const entryPx = openingFill ? parseFloat(openingFill.px) : null;
    const entryDate = openingFill ? new Date(openingFill.time).toISOString().slice(0, 16) : 'Unknown';
    const durationHrs = openingFill ? ((t.time - openingFill.time) / 3600000).toFixed(1) : 'Unknown';
    
    console.log(`\nLoss #${index + 1}:`);
    console.log(`  Coin:      ${t.coin}`);
    console.log(`  Direction: ${isCloseShort ? 'SHORT' : 'LONG'}`);
    console.log(`  PnL:       $${parseFloat(t.closedPnl).toFixed(2)}`);
    console.log(`  Entry:     $${entryPx ? entryPx.toFixed(4) : 'Unknown'} (${entryDate})`);
    console.log(`  Exit:      $${parseFloat(t.px).toFixed(4)} (${date})`);
    console.log(`  Duration:  ${durationHrs} hours`);
    
    if (entryPx) {
      const priceDiffPct = ((parseFloat(t.px) - entryPx) / entryPx) * 100;
      console.log(`  Price Diff: ${priceDiffPct.toFixed(2)}%`);
    }
  });

  console.log(`\n------------------------------------------------------`);
  console.log(`💡 GENERAL OBSERVATIONS`);
  console.log(`------------------------------------------------------`);
  
  // Calculate average win size vs average loss size
  const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + parseFloat(t.closedPnl), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + parseFloat(t.closedPnl), 0) / losses.length : 0;
  console.log(`• Average Win:  +$${avgWin.toFixed(2)}`);
  console.log(`• Average Loss: -$${Math.abs(avgLoss).toFixed(2)}`);
  
  const profitFactor = Math.abs(avgLoss) > 0 ? (wins.reduce((sum, t) => sum + parseFloat(t.closedPnl), 0)) / Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.closedPnl), 0)) : 0;
  console.log(`• Profit Factor: ${profitFactor.toFixed(2)}x`);
}

analyze();
