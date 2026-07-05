async function checkHistory() {
  const url = 'https://alpha-dashboard-beryl.vercel.app/api/pnl';
  console.log(`Querying ${url}...`);
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      console.log("Full PNL JSON response:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log("Failed to fetch:", res.status, await res.text());
    }
  } catch (e) {
    console.error(e);
  }
}

checkHistory();
