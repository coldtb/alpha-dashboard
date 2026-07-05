import fs from 'fs';

const logPath = 'C:\\Users\\hitech\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\.system_generated\\tasks\\task-7785.log';
if (!fs.existsSync(logPath)) {
  console.log(`Log file not found at ${logPath}`);
  process.exit(1);
}

const content = fs.readFileSync(logPath, 'utf8');
const blocks = content.split('=== BLOCK:');

console.log(`Total bot runs found in logs: ${blocks.length}`);

let runIndex = 0;
blocks.forEach(block => {
  if (block.includes('Top 5 candidates') || block.includes('Top candidates')) {
    runIndex++;
    console.log(`\n--- BOT RUN #${runIndex} ---`);
    const lines = block.split('\n');
    let printing = false;
    let printedLines = 0;
    
    // Print Top 5 candidates array or lines following it
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Top 5 candidates') || lines[i].includes('Top candidates')) {
        printing = true;
      }
      if (printing) {
        console.log(lines[i]);
        printedLines++;
        if (printedLines > 30 || lines[i].startsWith(']') || (lines[i].trim() === ']' && printedLines > 5)) {
          printing = false;
          printedLines = 0;
        }
      }
      if (lines[i].includes('[Bot Execution]') && !lines[i].includes('Checking candidate')) {
        console.log(lines[i]);
      }
    }
  }
});
