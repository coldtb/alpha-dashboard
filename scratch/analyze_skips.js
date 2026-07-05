import fs from 'fs';

const logPath = 'C:\\Users\\hitech\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\scratch\\hype-events.txt';
if (!fs.existsSync(logPath)) {
  console.log(`Log file not found at ${logPath}`);
  process.exit(1);
}

const stats = fs.statSync(logPath);
console.log(`File size: ${stats.size} bytes`);

const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');
console.log(`Total lines: ${lines.length}`);

const skipCounts = {};

lines.forEach(line => {
  if (line.includes('Skip') || line.includes('filtered by 24h SMA')) {
    const cleanLine = line.trim();
    let category = 'Other Skip';
    if (cleanLine.includes('SMA Distance Filter')) {
      category = 'SMA Distance Filter';
    } else if (cleanLine.includes('VWAP Trend Filter')) {
      category = 'VWAP Trend Filter';
    } else if (cleanLine.includes('Direction filtered by 24h SMA Trend Filter')) {
      category = 'Direction filtered by 24h SMA';
    } else if (cleanLine.includes('Crowded Trade')) {
      category = 'Crowded Trade Filter';
    } else if (cleanLine.includes('Smart TP')) {
      category = 'Smart TP Skipped';
    }
    
    skipCounts[category] = (skipCounts[category] || 0) + 1;
    
    // Print a few examples
    if ((skipCounts[category] || 0) <= 5) {
      console.log(`[Example ${category}]: ${cleanLine}`);
    }
  }
});

console.log('\n--- SKIP SUMMARY ---');
console.log(JSON.stringify(skipCounts, null, 2));
