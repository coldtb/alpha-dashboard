import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

async function main() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });
  const [meta, assetCtxs] = await info.metaAndAssetCtxs();
  
  const zerog = meta.universe.find(a => a.name === "0G");
  console.log("0G perp meta:", JSON.stringify(zerog, null, 2));

  // Print all assets that support less than 5x leverage or have low max leverage
  console.log("\nAssets with low max leverage or specific metadata:");
  meta.universe.forEach((asset, idx) => {
    // If the asset has maxLeverage in its metadata or similar fields
    if (asset.maxLeverage && asset.maxLeverage < 5) {
      console.log(`${asset.name}: maxLeverage = ${asset.maxLeverage}`);
    }
  });
  
  // Let's print the entire object structure of a universe item
  console.log("\nSample universe item structure (first item):");
  console.log(JSON.stringify(meta.universe[0], null, 2));
}

main().catch(console.error);
