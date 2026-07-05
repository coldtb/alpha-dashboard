// Unit test for SL/TP classification logic and divergence-based SL tightening guard

console.log("--- STARTING SL/TP CLASSIFICATION UNIT TESTS ---\n");

// Classification logic helper matching the new implementation in bot.js
function classifyOrders(coinOrders, currentPrice, isLong) {
  const slOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) < currentPrice : parseFloat(o.triggerPx) > currentPrice));
  const tpOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) > currentPrice : parseFloat(o.triggerPx) < currentPrice));
  return { slOrder, tpOrder };
}

// Old classification logic helper matching the buggy implementation
function classifyOrdersOld(coinOrders, entryPx, isLong) {
  const slOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) < entryPx : parseFloat(o.triggerPx) > entryPx));
  const tpOrder = coinOrders.find(o => o.triggerPx && parseFloat(o.triggerPx) !== 0 && (isLong ? parseFloat(o.triggerPx) > entryPx : parseFloat(o.triggerPx) < entryPx));
  return { slOrder, tpOrder };
}

// ----------------------------------------------------
// TEST 1: Short Position in Profit with Trailed SL
// ----------------------------------------------------
console.log("TEST 1: SHORT position (entry: 63.13, current: 60.50)");
console.log("Open trigger orders: Trailed SL at 60.87, TP at 58.00");

const shortOrders = [
  { triggerPx: "60.87", oid: 101, coin: "HYPE", isTrigger: true }, // Trailed SL (locks profit)
  { triggerPx: "58.00", oid: 102, coin: "HYPE", isTrigger: true }  // TP
];

const oldShortRes = classifyOrdersOld(shortOrders, 63.13, false);
const newShortRes = classifyOrders(shortOrders, 60.50, false);

console.log("\nOld Logic Result:");
console.log(`- slOrder: ${oldShortRes.slOrder ? oldShortRes.slOrder.triggerPx : "undefined"}`);
console.log(`- tpOrder: ${oldShortRes.tpOrder ? oldShortRes.tpOrder.triggerPx : "undefined"}`);

console.log("\nNew Logic Result:");
console.log(`- slOrder: ${newShortRes.slOrder ? newShortRes.slOrder.triggerPx : "undefined"}`);
console.log(`- tpOrder: ${newShortRes.tpOrder ? newShortRes.tpOrder.triggerPx : "undefined"}`);

if (!oldShortRes.slOrder && oldShortRes.tpOrder && oldShortRes.tpOrder.triggerPx === "60.87") {
  console.log("✅ [Old Logic Behavior Confirmed] Bug correctly replicated: old logic misclassified the trailed SL at 60.87 as a TP and left slOrder undefined.");
} else {
  console.log("❌ [Old Logic Behavior Unexpected]");
}

if (newShortRes.slOrder && newShortRes.slOrder.triggerPx === "60.87" && newShortRes.tpOrder && newShortRes.tpOrder.triggerPx === "58.00") {
  console.log("✅ [New Logic Confirmed] Trailed SL correctly classified as slOrder, and TP correctly classified as tpOrder!");
} else {
  console.log("❌ [New Logic Failed] Failed to correctly classify orders.");
}

// ----------------------------------------------------
// TEST 2: Long Position in Profit with Trailed SL
// ----------------------------------------------------
console.log("\n----------------------------------------------------");
console.log("TEST 2: LONG position (entry: 100.0, current: 120.0)");
console.log("Open trigger orders: Trailed SL at 115.0, TP at 130.0");

const longOrders = [
  { triggerPx: "115.00", oid: 201, coin: "BTC", isTrigger: true }, // Trailed SL (locks profit)
  { triggerPx: "130.00", oid: 202, coin: "BTC", isTrigger: true }  // TP
];

const oldLongRes = classifyOrdersOld(longOrders, 100.0, true);
const newLongRes = classifyOrders(longOrders, 120.0, true);

console.log("\nOld Logic Result:");
console.log(`- slOrder: ${oldLongRes.slOrder ? oldLongRes.slOrder.triggerPx : "undefined"}`);
console.log(`- tpOrder: ${oldLongRes.tpOrder ? oldLongRes.tpOrder.triggerPx : "undefined"}`);

console.log("\nNew Logic Result:");
console.log(`- slOrder: ${newLongRes.slOrder ? newLongRes.slOrder.triggerPx : "undefined"}`);
console.log(`- tpOrder: ${newLongRes.tpOrder ? newLongRes.tpOrder.triggerPx : "undefined"}`);

if (!oldLongRes.slOrder && oldLongRes.tpOrder && oldLongRes.tpOrder.triggerPx === "115.00") {
  console.log("✅ [Old Logic Behavior Confirmed] Bug correctly replicated: old logic misclassified the trailed SL at 115.00 as a TP and left slOrder undefined.");
} else {
  console.log("❌ [Old Logic Behavior Unexpected]");
}

if (newLongRes.slOrder && newLongRes.slOrder.triggerPx === "115.00" && newLongRes.tpOrder && newLongRes.tpOrder.triggerPx === "130.00") {
  console.log("✅ [New Logic Confirmed] Trailed SL correctly classified as slOrder, and TP correctly classified as tpOrder!");
} else {
  console.log("❌ [New Logic Failed] Failed to correctly classify orders.");
}

// ----------------------------------------------------
// TEST 3: Counter-Divergence SL Tightening Guard
// ----------------------------------------------------
console.log("\n----------------------------------------------------");
console.log("TEST 3: Counter-Divergence SL Tightening Guard");

function shouldTightenSl(slOrder, entryPx, isLong) {
  if (!slOrder) return false;
  const slIsWorseThanEntry = isLong ? parseFloat(slOrder.triggerPx) < entryPx : parseFloat(slOrder.triggerPx) > entryPx;
  return slIsWorseThanEntry;
}

// Scenario A: Short position with initial SL above entry (worse than entry)
const slWorse = { triggerPx: "65.00" };
const tightenWorse = shouldTightenSl(slWorse, 63.13, false);
console.log(`Scenario A (SL at 65.00, Entry 63.13, Short): Should tighten? ${tightenWorse}`);
if (tightenWorse === true) {
  console.log("✅ SL worse than entry will be tightened to entry (Correct).");
} else {
  console.log("❌ SL worse than entry was NOT marked for tightening.");
}

// Scenario B: Short position with trailed SL below entry (better than entry, profit locked in)
const slBetter = { triggerPx: "60.87" };
const tightenBetter = shouldTightenSl(slBetter, 63.13, false);
console.log(`Scenario B (SL at 60.87, Entry 63.13, Short): Should tighten? ${tightenBetter}`);
if (tightenBetter === false) {
  console.log("✅ SL better than entry (profit locked in) will NOT be tightened/degraded back to entry (Correct).");
} else {
  console.log("❌ SL better than entry was incorrectly marked for tightening (would degrade profit lock-in!).");
}

console.log("\n--- ALL UNIT TESTS COMPLETED ---");
