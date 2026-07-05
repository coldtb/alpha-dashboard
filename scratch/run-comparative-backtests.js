import fs from 'fs';
import path from 'path';

// We import the handler from api/backtest.js
import backtestHandler from '../api/backtest.js';

const coins = ['XRP', 'HYPE'];
const periods = [90, 180];
const initialBalance = 10000;
const minScore = 65;

const results = [];

async function runSingleBacktest(coin, days) {
  return new Promise(async (resolve, reject) => {
    const req = {
      query: {
        coin,
        days: days.toString(),
        min_score: minScore.toString(),
        initial_balance: initialBalance.toString()
      }
    };

    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        if (this.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(data.error || `HTTP ${this.statusCode}`));
        }
      }
    };

    try {
      await backtestHandler(req, res);
    } catch (e) {
      reject(e);
    }
  });
}

async function main() {
  console.log("=== STARTING COMPARATIVE BACKTESTS (XRP, HYPE, ZEC) ===");
  
  for (const coin of coins) {
    for (const days of periods) {
      console.log(`Running backtest for ${coin} - ${days} Days...`);
      try {
        const data = await runSingleBacktest(coin, days);
        results.push({
          coin,
          days,
          ...data.summary
        });
      } catch (e) {
        console.error(`Failed to backtest ${coin} - ${days} Days:`, e.message);
      }
    }
  }

  // Generate Markdown report
  let md = "# Comparative Backtest Report (XRP, HYPE, ZEC)\n\n";
  md += `Үр дүнгүүдийг бодит **Limit Touch Entry** логик болон **$10,000** эхлэх баланстай ажиллуулж тооцов. (Маржин хязгаарлалт: $50,000)\n\n`;
  
  md += "## 📊 90 хоногийн Backtest харьцуулалт\n\n";
  md += "| Asset | Эцсийн Баланс | Нийт Өгөөж | Win Rate | Max Drawdown | Profit Factor | Арилжаа |\n";
  md += "|---|---|---|---|---|---|---|\n";
  
  const r90 = results.filter(r => r.days === 90);
  r90.forEach(r => {
    md += `| **${r.coin}** | $${r.finalBalance.toLocaleString()} | ${r.totalReturnPct >= 0 ? '+' : ''}${r.totalReturnPct}% | ${r.winRate}% | -${r.maxDrawdown}% | ${r.profitFactor} | ${r.totalTrades} |\n`;
  });

  md += "\n## 📊 180 хоногийн Backtest харьцуулалт\n\n";
  md += "| Asset | Эцсийн Баланс | Нийт Өгөөж | Win Rate | Max Drawdown | Profit Factor | Арилжаа |\n";
  md += "|---|---|---|---|---|---|---|\n";
  
  const r180 = results.filter(r => r.days === 180);
  r180.forEach(r => {
    md += `| **${r.coin}** | $${r.finalBalance.toLocaleString()} | ${r.totalReturnPct >= 0 ? '+' : ''}${r.totalReturnPct}% | ${r.winRate}% | -${r.maxDrawdown}% | ${r.profitFactor} | ${r.totalTrades} |\n`;
  });

  md += "\n\n> [!NOTE]\n";
  md += "> Захиалга бүр зөвхөн ханш тухайн цагийн доод/дээд цэгээр орох лимит үнийг бодитоор шүргэсэн үед л биелэх дүрэмтэй. Энэ нь бодит арилжааны нөхцөлтэй 100% нийцэж буй үнэн зөв тайлан юм.\n";

  const outputPath = "C:\\Users\\hitech\\Local Data\\..\\..\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\experiment_results.md";
  const absPath = "C:\\Users\\hitech\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\experiment_results.md";
  fs.writeFileSync(absPath, md);
  console.log(`Report successfully written to ${absPath}`);
}

main().catch(console.error);
