import { HttpTransport } from "@nktkas/hyperliquid";

// Generic JSON-RPC tool caller helper for TrueNorth
async function callTrueNorthMcp(toolName, args) {
  const token = process.env.TN_FINANCIAL_DATA_API_KEY || 'ak_6bab536248be4a1896a4ea54de7b8377';
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

async function main() {
  console.log("Querying BTC technical analysis from TrueNorth...");
  const res = await callTrueNorthMcp('technical_analysis', { token_address: 'bitcoin', timeframe: '1h' });
  if (res?.result?.content?.[0]?.text) {
    const ta = JSON.parse(res.result.content[0].text);
    console.log("BTC TA structure:");
    console.log(JSON.stringify(ta, null, 2));
  } else {
    console.log("Empty or invalid response:", res);
  }
}

main().catch(console.error);
