import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function readOptionalInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export const projectRoot = process.cwd();
export const storageDir = path.join(projectRoot, 'storage');

export const env = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
  reposBaseDir: process.env.REPOS_BASE_DIR ? path.resolve(process.env.REPOS_BASE_DIR) : null,
  pollingTimeout: readOptionalInt(process.env.TELEGRAM_POLLING_TIMEOUT, 30),
  pollingInterval: readOptionalInt(process.env.TELEGRAM_POLLING_INTERVAL, 1000),
  email: {
    enabled: readOptionalBool(process.env.EMAIL_ENABLED, false),
    to: process.env.EMAIL_TO || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: readOptionalInt(process.env.SMTP_PORT, 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  }
};

export const promptsLog = path.join(storageDir, 'prompts.log');
export const runsLog = path.join(storageDir, 'runs.log');
export const appLog = path.join(storageDir, 'app.log');

export function ensureStorage() {
  fs.mkdirSync(storageDir, { recursive: true });

  for (const target of [promptsLog, runsLog, appLog]) {
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, '');
    }
  }
}

export function requireEnv() {
  if (!env.token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
  }

  if (env.token === 'your_bot_token_here') {
    throw new Error('TELEGRAM_BOT_TOKEN is still using the placeholder value in .env');
  }

  if (!env.allowedChatId) {
    throw new Error('Missing TELEGRAM_ALLOWED_CHAT_ID in .env');
  }

  if (!/^-?\d+$/.test(String(env.allowedChatId))) {
    throw new Error('TELEGRAM_ALLOWED_CHAT_ID must be a numeric Telegram chat ID');
  }

  if (!env.reposBaseDir) {
    throw new Error('Missing REPOS_BASE_DIR in .env');
  }

  if (!path.isAbsolute(env.reposBaseDir)) {
    throw new Error('REPOS_BASE_DIR must resolve to an absolute path');
  }

  if (env.pollingTimeout < 1) {
    throw new Error('TELEGRAM_POLLING_TIMEOUT must be greater than 0');
  }

  if (env.pollingInterval < 0) {
    throw new Error('TELEGRAM_POLLING_INTERVAL must be 0 or greater');
  }

  if (env.email.enabled) {
    if (!env.email.to) {
      throw new Error('EMAIL_TO is required when EMAIL_ENABLED is active');
    }

    if (!env.email.smtpHost) {
      throw new Error('SMTP_HOST is required when EMAIL_ENABLED is active');
    }

    if (!env.email.smtpPort || env.email.smtpPort < 1) {
      throw new Error('SMTP_PORT must be greater than 0 when EMAIL_ENABLED is active');
    }

    if (!env.email.smtpFrom) {
      throw new Error('SMTP_FROM or SMTP_USER is required when EMAIL_ENABLED is active');
    }
  }
}
