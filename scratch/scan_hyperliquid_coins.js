import fs from 'fs';
import path from 'path';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import backtestHandler from '../api/backtest.js';

const targetCoins = [
  'BTC', 'ETH', 'SOL', 'LINK', 'INJ', 
  'WLD', 'XLM', 'TRX', 'SUI', 'TIA', 
  'FTM', 'AVAX', 'NEAR', 'OP', 'ARB', 
  'DOGE', 'LTC', 'ADA', 'PEPE', 'WIF'
];

async function runSingleBacktest(coin, days) {
  return new Promise(async (resolve) => {
    const req = {
      query: {
        coin,
        days: days.toString(),
        min_score: '65',
        initial_balance: '10000'
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
          resolve(data.summary);
        } else {
          resolve(null);
        }
      }
    };

    try {
      await backtestHandler(req, res);
    } catch (e) {
      resolve(null);
    }
  });
}

async function main() {
  console.log("=== SCANNING HYPERLIQUID COINS FOR XRP-LIKE BEHAVIOR ===");
  const results = [];

  for (const coin of targetCoins) {
    console.log(`Running backtest for ${coin}...`);
    const summary = await runSingleBacktest(coin, 90);
    if (summary) {
      results.push({
        coin,
        finalBalance: summary.finalBalance,
        returnPct: summary.totalReturnPct,
        winRate: summary.winRate,
        maxDrawdown: summary.maxDrawdown,
        profitFactor: summary.profitFactor,
        trades: summary.totalTrades
      });
    }
    // Small delay to prevent rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  // Sort by Return % descending
  results.sort((a, b) => b.returnPct - a.returnPct);

  // Write markdown report
  let report = `# Hyperliquid Coin Scan Report (XRP-Like Behavior Search)\n\n`;
  report += `Энэхүү тайлангаар Hyperliquid-ийн хамгийн өндөр хөрвөх чадвартай 20 коин дээр сүүлийн **90 хоногийн** backtest-ийг бодит Limit Touch логик болон одоогийн ботын хамгаалалтын дүрмээр ажиллуулж, **XRP**-тэй ижил ашигтай, тогтвортой ажиллах боломжтой коинуудыг илрүүллээ.\n\n`;
  report += `## 📊 90 хоногийн Backtest Шүүлтүүрийн Үр Дүн\n\n`;
  report += `| Rank | Asset | Эцсийн Баланс | Нийт Өгөөж | Win Rate | Max Drawdown | Profit Factor | Арилжаа |\n`;
  report += `|---|---|---|---|---|---|---|---|\n`;

  results.forEach((r, idx) => {
    const bold = r.coin === 'XRP' ? '**' : '';
    report += `| ${idx + 1} | ${bold}${r.coin}${bold} | $${r.finalBalance.toFixed(2)} | ${bold}${r.returnPct >= 0 ? '+' : ''}${r.returnPct.toFixed(2)}%${bold} | ${r.winRate.toFixed(2)}% | ${r.maxDrawdown.toFixed(2)}% | ${r.profitFactor.toFixed(2)} | ${r.trades} |\n`;
  });

  report += `\n> [!NOTE]\n`;
  report += `> Дээрх үр дүнгээс харахад өгөөж нь өндөр эерэг бөгөөд уналт (drawdown) нь бага заагтай коинууд нь XRP-тэй хамгийн төсөөтэй буюу манай ботын одоогийн логикт хамгийн сайн тохирох хөрвөх чадвартай коинууд юм.\n`;

  fs.writeFileSync('C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636/hyperliquid_scan_report.md', report);
  console.log("Scan complete! Report written to hyperliquid_scan_report.md");
}

main().catch(console.error);
