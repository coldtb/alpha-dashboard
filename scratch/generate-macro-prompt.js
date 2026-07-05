import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const outputPath = path.join(process.cwd(), "scratch", "latest-macro-prompt.txt");

async function run() {
  console.log("Checking for TN_FINANCIAL_DATA_API_KEY in environment variables...");
  
  let rates = "US_TREASURY_10Y: [10 жилийн бондын хүүг энд гараар бичнэ үү, жишээ нь: 4.25%]";
  let cpi = "US_CPI: [CPI-ийг энд бичнэ үү, жишээ нь: 3.3%]";
  let gold = "GOLD: [Алтыг энд бичнэ үү, жишээ нь: $2320]";
  let oil = "OIL (Brent): [Газрын тосыг энд бичнэ үү, жишээ нь: $82]";
  let dxy = "DXY (US Dollar Index): [Долларын индексийг энд бичнэ үү, жишээ нь: 105.2]";

  const apiKey = process.env.TN_FINANCIAL_DATA_API_KEY;
  
  if (apiKey) {
    console.log("API Key found. Attempting to fetch real-time macro data...");
    try {
      // Fetch rates
      const ratesRaw = execSync(`tn-financial-data query us-rates --series us_treasury_10y,us_treasury_2y,fed_funds_rate --limit 1 --api-key ${apiKey}`).toString();
      console.log("Fetched rates successfully.");
      rates = ratesRaw.trim();
      
      // Fetch CPI
      const cpiRaw = execSync(`tn-financial-data query us-economic-indicators --series us_cpi --limit 1 --api-key ${apiKey}`).toString();
      cpi = cpiRaw.trim();

      // Fetch commodities
      const commRaw = execSync(`tn-financial-data query commodity-snapshot --commodities gold,brent --api-key ${apiKey}`).toString();
      const fxRaw = execSync(`tn-financial-data query fx-snapshot --pairs eurusd --api-key ${apiKey}`).toString();
      
      gold = commRaw.trim();
      dxy = `FX Snapshot: ${fxRaw.trim()}`;
    } catch (e) {
      console.warn("Failed to fetch via CLI (check API key permissions or network). Falling back to manual template:", e.message);
    }
  } else {
    console.log("No API Key found. Generating a manual template prompt...");
  }

  const prompt = `=== TRUENORTH MACRO & CRYPTO CORRELATION TRAINING ===
Хаяг: true-north.xyz чат эсвэл ask-agent хэрэгсэлд өгөх сургалтын prompt.
Хугацаа: ${new Date().toLocaleString()}

ХҮСЭЛТ:
"Дижитал Ихэр (Digital Twin) / Макро шинжээчид: Дараах хамгийн сүүлийн үеийн Макро эдийн засаг болон хөрөнгийн зах зээлийн өгөгдлийг крипто зах зээлтэй холбон шинжилж суралцана уу.

[МАКРО ҮЗҮҮЛЭЛТҮҮД / MACRO DATA]:
- АНУ-ын бондын хүү (Treasury Yields):
  ${rates}
- Инфляцийн түвшин (Economic Indicators):
  ${cpi}
- Түүхий эдийн ханш (Commodities Snapshot):
  * Алт (Gold): ${gold}
  * Тос (Oil/Brent): ${oil}
- Долларын индекс / Валют (DXY / FX):
  ${dxy}

[КРИПТО ЗАХ ЗЭЭЛИЙН ҮЗҮҮЛЭЛТҮҮД]:
- BTC (Bitcoin Price): [Bitcoin-ий ханшийг бичнэ үү, жишээ нь: $64,250]
- Funding rates (Watchlist coins):
  * BTC: [BTC-ий funding бичнэ үү]
  * XRP: [XRP-ий funding бичнэ үү]
  * SOL: [SOL-ий funding бичнэ үү]

ДҮН ШИНЖИЛГЭЭНИЙ ЗААВАРЧИЛГАА:
1. Бондын хүүгийн чиглэл (Yield Curve) болон DXY нь эрсдэлт хөрөнгийн (Risk-on) ликвид урсгалд хэрхэн нөлөөлж байна вэ?
2. Түүхий эд (Алт болон Тос)-ний өсөлт инфляцийн хүлээлтэд хэрхэн нөлөөлж, энэ нь Bitcoin-ийг үнэ цэнийн хамгаалалт (safe haven) болох статуст нь хэрхэн чиглүүлж байна вэ?
3. Энэхүү макро орчин нь альткоин (XRP, SOL, LINK) дээр хөшүүрэгтэй LONG позицууд нэмэгдэхэд эрсдэлтэй орчин (Risk-off) байна уу, эсвэл эерэг орчин (Risk-on) байна уу?
4. Дээрх шинжилгээнд тулгуурлан, манай арилжааны ботын 'minScore' оноог хэвээр барих уу, эсвэл эрсдэлээс хамгаалж улам чангалах уу гэдэгт дүгнэлт өгнө үү."
======================================================`;

  fs.writeFileSync(outputPath, prompt);
  console.log("\n==================================================================");
  console.log(`SUCCESS: Macro prompt template generated and saved to:`);
  console.log(`[latest-macro-prompt.txt](file:///${outputPath.replace(/\\/g, '/')})`);
  console.log("==================================================================\n");
}

run().catch(console.error);
