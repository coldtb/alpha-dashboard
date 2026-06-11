import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import dotenv from "dotenv";

dotenv.config({ path: ".env.production" });

const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;
if (!walletAddress) {
  console.error("Wallet address not found in .env.production");
  process.exit(1);
}

console.log("Wallet address from env:", walletAddress);

const transport = new HttpTransport();
const info = new InfoClient({ transport });

async function run() {
  try {
    console.log("--- clearinghouseState ---");
    const chState = await info.clearinghouseState({ user: walletAddress });
    console.log("Withdrawable:", chState.withdrawable);
    console.log("Full clearinghouseState:", JSON.stringify(chState, null, 2).slice(0, 1000));

    console.log("\n--- spotClearinghouseState ---");
    if (typeof info.spotClearinghouseState === "function") {
      const spotState = await info.spotClearinghouseState({ user: walletAddress });
      console.log("Full spotClearinghouseState:", JSON.stringify(spotState, null, 2).slice(0, 1000));
    } else {
      console.log("spotClearinghouseState is not a function on InfoClient");
    }

    console.log("\n--- portfolioState ---");
    // Call generic post if portfolioState is not a method
    try {
      const portfolioState = await info.spotClearinghouseState ? await info.spotClearinghouseState({ user: walletAddress }) : null;
    } catch (e) {
      console.error(e);
    }
  } catch (err) {
    console.error("Error in run:", err);
  }
}

run();
