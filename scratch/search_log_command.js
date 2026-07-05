import fs from 'fs';

const transcriptPath = 'C:\\Users\\hitech\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\.system_generated\\logs\\transcript_full.jsonl';
if (!fs.existsSync(transcriptPath)) {
  console.log(`Transcript not found at ${transcriptPath}`);
  process.exit(1);
}

const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.split('\n');

console.log("Searching FULL transcript for USER messages or tool calls related to dashboard / pnl / error...");

lines.forEach((line, idx) => {
  if (line.includes('dashboard') || line.includes('dashborad') || line.includes('pnl.js') || line.includes('buruu')) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        console.log(`[Step ${obj.step_index}] USER: ${obj.content}`);
      } else if (obj.type === 'PLANNER_RESPONSE') {
        if (obj.tool_calls) {
          obj.tool_calls.forEach(tc => {
            if (tc.name === 'replace_file_content' || tc.name === 'write_to_file' || tc.name === 'multi_replace_file_content') {
              console.log(`[Step ${obj.step_index}] TOOL: ${tc.name} on ${tc.args.TargetFile}`);
            }
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }
});
