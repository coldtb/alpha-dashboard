const token = process.env.TN_FINANCIAL_DATA_API_KEY || 'ak_6bab536248be4a1896a4ea54de7b8377';
const url = `https://mcp.true-north.xyz/mcp?token=${token}`;

async function main() {
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
        name: 'technical_analysis',
        arguments: {
          token_address: 'chainlink', // LINK geckoId
          timeframe: '1h'
        }
      }
    })
  });

  const text = await response.text();
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.substring(6).trim();
      const res = JSON.parse(dataStr);
      const taText = res.result.content[0].text;
      const taData = JSON.parse(taText);
      if (taData.support_resistance?.vwap) {
        console.log("LINK VWAP details:");
        console.log(JSON.stringify(taData.support_resistance.vwap.cumulative, null, 2));
      } else {
        console.log("No VWAP data found for LINK");
      }
      return;
    }
  }
}

main().catch(console.error);
