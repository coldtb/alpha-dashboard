import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import fs from "fs";

function loadEnv() {
  const files = [".env.production", ".env.local", ".env"];
  const env = {};
  for (const file of files) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, "utf8");
      content.split("\n").forEach(line => {
        const parts = line.split("=");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          let value = parts.slice(1).join("=").trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          env[key] = value;
        }
      });
    }
  }
  return env;
}

const env = loadEnv();
const walletAddress = env.HYPERLIQUID_WALLET_ADDRESS || process.env.HYPERLIQUID_WALLET_ADDRESS;

async function run() {
  if (!walletAddress) {
    console.error("Wallet address not found in env. Read keys:", Object.keys(env));
    console.error("Process env keys:", Object.keys(process.env).filter(k => k.includes("HYPERLIQUID")));
    return;
  }
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });
  const [positions, openOrders] = await Promise.all([
    info.clearinghouseState({ user: walletAddress }),
    info.frontendOpenOrders({ user: walletAddress })
  ]);

  console.log("Wallet address:", walletAddress);
  console.log("Positions:");
  console.log(JSON.stringify(positions.assetPositions.filter(p => parseFloat(p.position.s) !== 0), null, 2));
  console.log("\nOpen Orders:");
  console.log(JSON.stringify(openOrders, null, 2));
}

run().catch(console.error);
