import fs from 'fs';

const transcriptPath = 'C:\\Users\\hitech\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\.system_generated\\logs\\transcript_full.jsonl';
if (!fs.existsSync(transcriptPath)) {
  console.log(`Transcript not found at ${transcriptPath}`);
  process.exit(1);
}

const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.split('\n');

console.log("Searching for replacements in api/pnl.js...");

lines.forEach((line, idx) => {
  if (line.includes('api/pnl.js') && (line.includes('replace_file_content') || line.includes('multi_replace_file_content'))) {
    try {
      const obj = JSON.parse(line);
      console.log(`\n================ STEP ${obj.step_index} ================`);
      if (obj.tool_calls) {
        obj.tool_calls.forEach(tc => {
          if (tc.name === 'replace_file_content') {
            console.log("TargetContent:", tc.args.TargetContent);
            console.log("ReplacementContent:", tc.args.ReplacementContent);
          } else if (tc.name === 'multi_replace_file_content') {
            tc.args.ReplacementChunks.forEach((chunk, chunkIdx) => {
              console.log(`Chunk ${chunkIdx}:`);
              console.log("TargetContent:", chunk.TargetContent);
              console.log("ReplacementContent:", chunk.ReplacementContent);
            });
          }
        });
      }
    } catch (e) {
      // Ignore
    }
  }
});
