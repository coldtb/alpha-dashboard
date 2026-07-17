import fs from 'fs';
import path from 'path';
import backtestHandler from '../api/backtest.js';

async function run() {
  const req = {
    query: {
      coin: 'XRP',
      days: '180',
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
        fs.writeFileSync('C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636/scratch/xrp_real_debug.json', JSON.stringify(data, null, 2));
        console.log("Successfully wrote real XRP debug to xrp_real_debug.json");
      } else {
        console.error("Backtest failed:", data.error);
      }
    }
  };

  await backtestHandler(req, res);
}

run().catch(console.error);
