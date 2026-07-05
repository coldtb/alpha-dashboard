import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

async function run() {
  const walletAddress = '0x2453DEa35f5d83896304649d9389dB2E4bC4c0e7';
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });

  try {
    const fills = await info.userFills({ user: walletAddress });
    console.log("Analyzing fills cloids:");
    fills.forEach(f => {
      const time = new Date(f.time).toISOString();
      const cloidHex = f.cloid || '';
      let cloidText = 'null';
      if (cloidHex.startsWith('0x')) {
        const bytes = Buffer.from(cloidHex.substring(2), 'hex');
        cloidText = bytes.toString('utf8').replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // clean control chars
      }
      console.log(`  [${time}] ${f.coin} | ${f.dir} | px: ${f.px} | sz: ${f.sz} | cloid: ${f.cloid} (${cloidText})`);
    });
  } catch (e) {
    console.error(e.message);
  }
}

run();
