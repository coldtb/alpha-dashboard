import fs from "fs";
import path from "path";

const historyPath = path.join(process.cwd(), "scratch", "backtest-history.json");
const reportPath = path.join(process.cwd(), "scratch", "diagnostic-report.txt");
const outputPath = path.join(process.cwd(), "scratch", "latest-training-prompt.txt");

function formatTime(isoString) {
  try {
    return new Date(isoString).toLocaleString();
  } catch (e) {
    return isoString;
  }
}

async function run() {
  console.log("Reading backtest history and diagnostics...");
  
  if (!fs.existsSync(historyPath)) {
    console.error(`Error: ${historyPath} does not exist. Run a backtest first.`);
    return;
  }

  const history = JSON.parse(fs.readFileSync(historyPath, "utf8") || "[]");
  if (history.length === 0) {
    console.error("No backtest history records found.");
    return;
  }

  // Group by latest test per coin to show latest state
  const latestRuns = {};
  history.forEach(run => {
    const key = run.coin;
    if (!latestRuns[key] || new Date(run.timestamp) > new Date(latestRuns[key].timestamp)) {
      latestRuns[key] = run;
    }
  });

  let diagnostics = "No recent diagnostic report found.";
  if (fs.existsSync(reportPath)) {
    diagnostics = fs.readFileSync(reportPath, "utf8");
  }

  // Construct training prompt
  let prompt = `=== TRUENORTH DIGITAL TWIN FEEDBACK & ALIGNMENT LOOP ===
Хаяг: true-north.xyz чат эсвэл ask-agent хэрэгсэлд өгөх сургалтын prompt.
Хугацаа: ${new Date().toLocaleString()}

ХҮСЭЛТ:
"Дижитал Ихэр (Digital Twin)-д: Миний сүүлд ажиллуулсан түүхэн бэктестийн болон арилжааны алдааны тайлан (Diagnostics Report) гарлаа. Эдгээр тоон үр дүнг уншиж суралцаад, өөрийн дүн шинжилгээний логикоо үүний дагуу тохируулж сайжруулна уу.

1. БЭКТЕСТИЙН СҮҮЛИЙН ҮР ДҮНГҮҮД (Latest Backtest Performance):
`;

  Object.values(latestRuns).forEach(run => {
    prompt += `- ${run.coin} (${run.days} хоног, minScore=${run.minScore}):
  * Нийт арилжаа: ${run.summary.totalTrades}
  * Win Rate: ${run.summary.winRate}%
  * Нийт өгөөж: ${run.summary.totalReturnPct}%
  * Хамгийн их уналт (Max DD): ${run.summary.maxDrawdown}%
  * Profit Factor: ${run.summary.profitFactor}\n`;
  });

  prompt += `
2. СИСТЕМЭС ИЛРҮҮЛСЭН ОНЦЛОГ БОЛОН АЛДААНЫ ДҮГНЭЛТ (Diagnostics Summary):
${diagnostics}

3. СУРАЛЦАХ БОЛОН ШИНЖИЛГЭЭНД ӨӨРЧЛӨЛТ ОРУУЛАХ ЗААВАР:
- XRP дээр өгөөж маш сайн (+222%) байгаа нь трэнд дагалт болон TP=5.0% ашгийг урт барьж байгаатай холбоотой. Энэхүү трэнд дагах логикийг XRP дээр чанд мөрдөх.
- BTC болон ETH дээр whipsaw-д өртөж олон алдагдал хүлээсэн байна. Та дараагийн BTC, ETH арилжааны сигнал шинжлэхдээ:
  * Зах зээл sideways (чиглэлгүй савлагаатай) байгаа үед сигналын оноог эрс чангатгаж 95-аас дээш гаргах, эсвэл трэнд батлагдах хүртэл арилжаанаас татгалзах (SKIP).
  * Богино хугацааны савлагааг даван туулахын тулд Options-ийн Put/Call walls хамгаалалтын заагийг илүү нарийвчлан тооцох.
- HYPE токен дээр манай суурь логик маш том алдагдал хүлээж байгаа тул:
  * TrueNorth-ийн сошиал хандлага (social sentiment) болон сүлжээн дэх арилжааны идэвхтэй урсгал үнэхээр хүчтэй, нэг чиглэлтэй трэнд үүсгээгүй л бол HYPE дээрх бүх богино хугацааны дохиог SKIP хийхийг тушааж байна.

Дээрх өгөгдөл, алдааны дүгнэлтэд дүн шинжилгээ хийж суралцсан эсэхээ баталж, дараагийн арилжаанд хэрхэн дүрмээ өөрчлөхөө товч тайлбарлана уу."
======================================================`;

  fs.writeFileSync(outputPath, prompt);
  console.log("\n==================================================================");
  console.log(`SUCCESS: Training prompt generated and saved to:`);
  console.log(`[latest-training-prompt.txt](file:///${outputPath.replace(/\\/g, '/')})`);
  console.log("==================================================================\n");
}

run().catch(console.error);
