const walletAddress = "0x2453DEa35f5d83896304649d9389dB2E4bC4c0e7";

async function run() {
  try {
    console.log("Fetching ledger updates for user:", walletAddress);
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "userNonFundingLedgerUpdates",
        user: walletAddress
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Ledger updates count:", data.length);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching ledger updates:", err);
  }
}

run();
