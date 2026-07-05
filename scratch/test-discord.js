async function run() {
  const webhookUrl = "https://discord.com/api/webhooks/1522581600129519688/VpXD3LPDC5aQKidykxrJ5l5jN9sNXA__7bxSkrMeEQIR8HzVCYKCzF5amtkBgulwrdeW";
  
  const payload = {
    embeds: [
      {
        title: "🔵 Alpha Bot Test Connection",
        description: "Discord Webhook connection is 100% active and working! Bot alerts are successfully enabled.",
        color: 3447003,
        timestamp: new Date().toISOString()
      }
    ]
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log("Response status:", res.status);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

run();
