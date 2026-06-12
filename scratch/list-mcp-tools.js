import fs from "fs";

try {
  const fileContent = fs.readFileSync("C:\\Users\\hitech\\.gemini\\antigravity\\scratch\\tools_response.json", "utf8");
  const lines = fileContent.split('\n');
  let dataStr = null;
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      dataStr = line.substring(6).trim();
      break;
    }
  }

  if (!dataStr) {
    dataStr = fileContent;
  }

  const parsed = JSON.parse(dataStr);
  let tools = [];
  
  if (parsed.result && parsed.result.tools) {
    tools = parsed.result.tools;
  } else if (parsed.tools) {
    tools = parsed.tools;
  } else if (parsed.result && parsed.result.value) {
    const inner = JSON.parse(parsed.result.value);
    tools = inner.tools || [];
  }

  const targetTools = ["technical_analysis_v3", "derivatives_analysis", "options_report", "liquidation_risk"];
  
  targetTools.forEach(name => {
    const t = tools.find(x => x.name === name);
    if (t) {
      console.log(`\n=========================================`);
      console.log(`TOOL: ${t.name}`);
      console.log(`Description: ${t.description}`);
      console.log(`Input Schema:\n${JSON.stringify(t.inputSchema, null, 2)}`);
    } else {
      console.log(`\nTool ${name} not found!`);
    }
  });

} catch (e) {
  console.error("Error:", e.message);
}
