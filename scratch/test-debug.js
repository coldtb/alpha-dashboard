import handler from "../api/debug-address.js";

const req = {};
const res = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.jsonData = data;
    console.log("Handler Output:", JSON.stringify(data, null, 2));
    return this;
  }
};

process.env.HYPERLIQUID_WALLET_ADDRESS = "0x2453DEa35d5d83896304649d9389dB2E4bC4c0e7";
process.env.NODE_ENV = "production";

handler(req, res);
