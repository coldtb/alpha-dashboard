async function checkDeployedPnl() {
  const url = 'https://alpha-dashboard-beryl.vercel.app/api/pnl';
  console.log(`Sending GET request to production PNL endpoint: ${url}`);
  try {
    const response = await fetch(url);
    console.log(`HTTP Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log("\n=== Deployed PNL Full Response ===");
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log("Error Response:", text);
    }
  } catch (error) {
    console.error("Fetch Error:", error);
  }
}

checkDeployedPnl();
