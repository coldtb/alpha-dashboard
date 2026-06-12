import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import fs from "fs";

// Custom .env loader
try {
  const envText = fs.readFileSync(".env.production", "utf8");
  envText.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index !== -1) {
      const key = trimmed.substring(0, index).trim();
      const val = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  });
} catch (e) {
  console.warn("Could not load .env.production directly:", e.message);
}

const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;
if (!walletAddress) {
  console.error("Wallet address not found in process.env");
  process.exit(1);
}

const transport = new HttpTransport();
const info = new InfoClient({ transport });

async function run() {
  try {
    console.log("Fetching fills for user:", walletAddress);
    const fills = await info.userFills({ user: walletAddress });
    console.log("Total fills found:", fills.length);

    // Filter WLD fills
    const wldFills = fills.filter(f => f.coin === "WLD");
    console.log(`\nFound ${wldFills.length} fills for WLD:`);
    wldFills.forEach((f, idx) => {
      const date = new Date(f.time);
      console.log(`[${idx}] Time: ${date.toLocaleString()} | Price: ${f.px} | Size: ${f.sz} | Side: ${f.side} | Closed PNL: ${f.closedPnl || 0} USDC`);
    });

  } catch (err) {
    console.error("Error fetching fills:", err);
  }
}

run();
