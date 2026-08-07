import { ExchangeClient, InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;

  if (!privateKey || !walletAddress) {
    return res.status(400).json({
      status: "error",
      error: "Missing HYPERLIQUID_PRIVATE_KEY or HYPERLIQUID_WALLET_ADDRESS"
    });
  }

  try {
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
    const exchange = new ExchangeClient({ transport, wallet: account });

    // Fetch BTC price & metadata
    const [meta, ctxs] = await info.metaAndAssetCtxs();
    const btcIdx = meta.universe.findIndex(u => u.name === "BTC");
    if (btcIdx === -1) throw new Error("BTC asset not found on Hyperliquid");

    const btcCtx = ctxs[btcIdx];
    const markPx = parseFloat(btcCtx.markPx || btcCtx.midPx || "64000");
    const szDec = meta.universe[btcIdx].szDecimals;

    // Minimum notional on Hyperliquid is $10.50. At BTC = $64,800, 0.0002 BTC = $12.96 notional ($2.59 margin at 5x)
    const testSize = 0.0002;
    const testSizeStr = testSize.toFixed(szDec);
    const slippagePriceStr = (markPx * 1.01).toFixed(2);

    console.log(`[Test Trade] Step 1: Placing BUY market order for ${testSizeStr} BTC at ~$${markPx}...`);

    // 1. Open Position (BUY Market Order)
    const openRes = await exchange.order({
      orders: [{
        a: btcIdx,
        b: true, // Buy
        p: slippagePriceStr,
        s: testSizeStr,
        r: false,
        t: { limit: { tif: "Ioc" } }
      }]
    });

    // Wait 2 seconds
    await new Promise(r => setTimeout(r, 2000));

    // 2. Close Position (SELL Market Order)
    const sellSlippagePriceStr = (markPx * 0.99).toFixed(2);
    console.log(`[Test Trade] Step 2: Placing SELL market order to close ${testSizeStr} BTC...`);

    const closeRes = await exchange.order({
      orders: [{
        a: btcIdx,
        b: false, // Sell
        p: sellSlippagePriceStr,
        s: testSizeStr,
        r: true, // Reduce only
        t: { limit: { tif: "Ioc" } }
      }]
    });

    return res.status(200).json({
      status: "success",
      message: "Test trade executed and closed successfully on Hyperliquid Mainnet!",
      details: {
        symbol: "BTC",
        size: testSizeStr,
        approxPrice: markPx,
        openResult: openRes,
        closeResult: closeRes
      }
    });

  } catch (err) {
    console.error("[Test Trade Error]", err);
    return res.status(500).json({ status: "error", error: err.message });
  }
}
