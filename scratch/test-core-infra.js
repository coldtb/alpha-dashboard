import { validateEnvSecrets } from "../api/bot.js";
import logger from "../api/services/logger.js";
import fs from "fs";
import path from "path";

// Helper to assert
function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion Failed: " + message);
  }
  console.log("✅ PASS: " + message);
}

async function runTests() {
  console.log("=== Running Core Infrastructure Tests ===\n");

  // Temporarily disable DRY_RUN so that env key/wallet validation is performed
  const originalDryRun = process.env.DRY_RUN;
  delete process.env.DRY_RUN;

  // 1. Test Env Validation (Success Case)
  console.log("--- 1. Testing Env Secrets Validation (Success Case) ---");
  process.env.HYPERLIQUID_PRIVATE_KEY = "0x1000000000000000000000000000000000000000000000000000000000000002";
  process.env.HYPERLIQUID_WALLET_ADDRESS = "0x0000000000000000000000000000000000000002";
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/123/abc";
  
  try {
    validateEnvSecrets();
    assert(true, "Env secrets validation succeeded for valid formats.");
  } catch (e) {
    assert(false, "Env secrets validation should not have thrown for valid formats: " + e.message);
  }

  // 2. Test Env Validation (Failure Case - Private Key)
  console.log("\n--- 2. Testing Env Secrets Validation (Failure Case - Private Key) ---");
  process.env.HYPERLIQUID_PRIVATE_KEY = "invalid_key";
  try {
    validateEnvSecrets();
    assert(false, "Should have thrown error for invalid private key format.");
  } catch (e) {
    assert(e.message.includes("HYPERLIQUID_PRIVATE_KEY must start with '0x' and be exactly 66 characters long"), "Correctly rejected invalid private key: " + e.message);
  }

  // Restore valid env for next steps
  process.env.HYPERLIQUID_PRIVATE_KEY = "0x1000000000000000000000000000000000000000000000000000000000000002";

  // 3. Test Env Validation (Failure Case - Webhook URL)
  console.log("\n--- 3. Testing Env Secrets Validation (Failure Case - Webhook URL) ---");
  process.env.DISCORD_WEBHOOK_URL = "invalid_url";
  try {
    validateEnvSecrets();
    assert(false, "Should have thrown error for invalid webhook URL format.");
  } catch (e) {
    assert(e.message.includes("DISCORD_WEBHOOK_URL must be a valid HTTP/HTTPS URL"), "Correctly rejected invalid webhook URL: " + e.message);
  }

  // Restore original DRY_RUN environment
  if (originalDryRun) {
    process.env.DRY_RUN = originalDryRun;
  } else {
    process.env.DRY_RUN = "true";
  }
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/123/abc";

  // 4. Test Structured Logger outputs
  console.log("\n--- 4. Testing Logger JSON Output and File Logs ---");
  // Clean logs directory or files for clean test
  const logDir = path.resolve("logs");
  const eventsLogFile = path.join(logDir, "events.log");
  if (fs.existsSync(eventsLogFile)) {
    fs.unlinkSync(eventsLogFile);
  }

  // Log in development mode (non-JSON console log, JSON file log)
  process.env.NODE_ENV = "development";
  logger.setTraceId("test-trace-123");
  logger.info("Test dev info message", "events", { extra: "data1" });

  // Log in production mode (JSON console log, JSON file log)
  process.env.NODE_ENV = "production";
  logger.warn("Test prod warn message", "events", { extra: "data2" });

  // Read log file and assert
  assert(fs.existsSync(eventsLogFile), "Log file events.log was created.");
  const fileContent = fs.readFileSync(eventsLogFile, "utf8").trim().split("\n");
  assert(fileContent.length === 2, "Log file contains exactly 2 logged entries.");

  const firstLog = JSON.parse(fileContent[0]);
  assert(firstLog.message === "Test dev info message", "First log message matches.");
  assert(firstLog.level === "INFO", "First log level is INFO.");
  assert(firstLog.traceId === "test-trace-123", "First log has correct trace ID.");
  assert(firstLog.extra === "data1", "First log has correct extra metadata.");

  const secondLog = JSON.parse(fileContent[1]);
  assert(secondLog.message === "Test prod warn message", "Second log message matches.");
  assert(secondLog.level === "WARN", "Second log level is WARN.");
  assert(secondLog.extra === "data2", "Second log has correct extra metadata.");

  console.log("\nAll core infrastructure tests passed successfully.");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
