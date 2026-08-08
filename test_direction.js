// Replicates the new direction logic in api/bot.js:3246-3271
function decide(srDirection, price, smaTrend, rawDirection = null) {
  const trendDir =
    smaTrend !== null && typeof smaTrend === 'number'
      ? (price >= smaTrend ? 'LONG' : 'SHORT')
      : null;
  let direction = null;
  if (srDirection === 'LONG' && trendDir !== 'SHORT') direction = 'LONG';
  else if (srDirection === 'SHORT' && trendDir !== 'LONG') direction = 'SHORT';
  if (!direction) {
    if (
      srDirection === null &&
      rawDirection &&
      rawDirection !== 'SKIP' &&
      (trendDir === null || trendDir === rawDirection)
    ) {
      direction = rawDirection;
    }
  }
  return direction ? direction : 'SKIP(counter-trend)';
}

// want: 'LONG' | 'SHORT' | 'SKIP' (partial match on 'SKIP(counter-trend)')
const cases = [
  { sr: 'LONG', px: 55, sma: 54, raw: null, want: 'LONG', note: 'uptrend + support -> LONG' },
  { sr: 'LONG', px: 53, sma: 54, raw: null, want: 'SKIP', note: 'downtrend + support -> REJECT (counter-trend)' },
  { sr: 'SHORT', px: 53, sma: 54, raw: null, want: 'SHORT', note: 'downtrend + resistance -> SHORT' },
  { sr: 'SHORT', px: 55, sma: 54, raw: null, want: 'SKIP', note: 'uptrend + resistance -> REJECT (counter-trend)' },
  { sr: 'LONG', px: 54, sma: 54, raw: null, want: 'LONG', note: 'boundary price==sma -> uptrend -> LONG' },
  { sr: null, px: 55, sma: 54, raw: 'LONG', want: 'LONG', note: 'no S/R, fallback rawDirection LONG, trend LONG' },
  { sr: null, px: 53, sma: 54, raw: 'SHORT', want: 'SHORT', note: 'no S/R, fallback rawDirection SHORT, trend SHORT' },
];

let pass = 0;
for (const c of cases) {
  const got = decide(c.sr, c.px, c.sma, c.raw);
  const ok = c.want === 'SKIP' ? got.startsWith('SKIP') : got === c.want;
  if (ok) pass++;
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), got.padEnd(22), '<-', c.note);
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
