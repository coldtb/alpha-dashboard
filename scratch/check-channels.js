import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

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
  try {
    console.log("Querying TrueNorth technical analysis for worldcoin-org (WLD)...");
    const result = await callTrueNorthMcp('technical_analysis', { token_address: 'worldcoin-org', timeframe: '1h' });
    console.log("TrueNorth Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error calling TrueNorth:", err.message);
  }
}

run();
