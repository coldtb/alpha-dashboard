async function callTrueNorthMcp(toolName, args) {
  const token = 'ak_6bab536248be4a1896a4ea54de7b8377';
  const url = `https://mcp.true-north.xyz/mcp?token=${token}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  if (!response.ok) {
    throw new Error(`TrueNorth MCP Server error: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.substring(6).trim();
      return JSON.parse(dataStr);
    }
  }
  throw new Error("Invalid TrueNorth SSE response format");
}

async function run() {
  console.log("Calling TrueNorth technical_analysis for worldcoin-wld...");
  const res = await callTrueNorthMcp('technical_analysis', { token_address: 'worldcoin-wld', timeframe: '1h' });
  if (res?.result?.content?.[0]?.text) {
    const data = JSON.parse(res.result.content[0].text);
    console.log("Full data structure keys:", Object.keys(data));
    console.log("support_resistance keys:", Object.keys(data.support_resistance || {}));
    if (data.support_resistance?.['support and resistance channel']?.channels) {
      console.log("Channels:", JSON.stringify(data.support_resistance['support and resistance channel'].channels, null, 2));
    }
  } else {
    console.log("Failed to get content from response:", res);
  }
}

run().catch(console.error);
