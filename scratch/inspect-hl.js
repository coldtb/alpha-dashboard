import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

const transport = new HttpTransport();
const info = new InfoClient({ transport });

console.log("Prototype methods:");
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(info)));
