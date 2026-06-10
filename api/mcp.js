export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = 'ak_6bab536248be4a1896a4ea54de7b8377';
  const url = `https://mcp.true-north.xyz/mcp?token=${token}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `TrueNorth MCP Server error: ${errText}` });
      return;
    }

    const text = await response.text();
    
    // Parse SSE lines
    let jsonResponse = null;
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.substring(6).trim();
        try {
          jsonResponse = JSON.parse(dataStr);
          break;
        } catch (e) {
          // ignore
        }
      }
    }

    if (jsonResponse) {
      res.status(200).json(jsonResponse);
    } else {
      res.status(200).send(text);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
