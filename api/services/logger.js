import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../../logs');

// Ensure log directory exists
const isVercel = !!process.env.VERCEL;
if (!isVercel && !fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

class StructuredLogger {
  constructor(defaultContext = {}) {
    this.defaultContext = defaultContext;
  }

  setTraceId(traceId) {
    this.defaultContext.traceId = traceId;
  }

  child(extraContext) {
    return new StructuredLogger({
      ...this.defaultContext,
      ...extraContext
    });
  }

  _log(level, message, category = 'events', meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      category,
      message,
      ...this.defaultContext,
      ...meta
    };

    // 1. Output to console in structured format
    const consoleOutput = process.env.NODE_ENV === 'production'
      ? JSON.stringify(logEntry)
      : `[${logEntry.timestamp}] [${logEntry.level}] [${category}]${logEntry.traceId ? ` [${logEntry.traceId}]` : ''}${logEntry.coin ? ` [${logEntry.coin}]` : ''} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;

    if (level === 'error' || level === 'critical') {
      console.error(consoleOutput);
    } else {
      console.log(consoleOutput);
    }

    // 2. Output to local log file synchronously to ensure it persists before process exit (crucial for cron jobs)
    if (!isVercel) {
      try {
        const fileName = `${category}.log`;
        const filePath = path.join(LOG_DIR, fileName);
        const fileEntry = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(filePath, fileEntry, 'utf8');
      } catch (err) {
        console.error(`[Logger Error] Failed to write to local log file: ${err.message}`);
      }
    }
  }

  info(message, category = 'events', meta = {}) {
    this._log('info', message, category, meta);
  }

  warn(message, category = 'events', meta = {}) {
    this._log('warn', message, category, meta);
  }

  error(message, category = 'events', meta = {}) {
    this._log('error', message, category, meta);
  }

  critical(message, category = 'events', meta = {}) {
    this._log('critical', message, category, meta);
  }

  trade(message, coin, dir, entry, exit, pnl, meta = {}) {
    this._log('info', message, 'trades', { coin, dir, entry, exit, pnl, ...meta });
  }

  audit(message, action, user = 'system', meta = {}) {
    this._log('info', message, 'audit', { action, user, ...meta });
  }
}

const logger = new StructuredLogger({
  traceId: null
});

export default logger;
