import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

const walletAddress = "0x2453DEa35d5d83896304649d9389dB2E4bC4c0e7";

async function check(testnet) {
  try {
    const transport = new HttpTransport({ testnet });
    const info = new InfoClient({ transport });
    const state = await info.clearinghouseState({ user: walletAddress });
    console.log(`SDK (testnet=${testnet}) State:`, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`SDK (testnet=${testnet}) error:`, err.message);
  }
}

async function run() {
  await check(false);
  await check(true);
}

run();
