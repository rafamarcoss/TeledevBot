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

export const env = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
  defaultRepo: process.env.DEFAULT_REPO || null,
  pollingTimeout: readOptionalInt(process.env.TELEGRAM_POLLING_TIMEOUT, 30),
  pollingInterval: readOptionalInt(process.env.TELEGRAM_POLLING_INTERVAL, 1000),
};

export const projectRoot = process.cwd();
export const storageDir = path.join(projectRoot, 'storage');
export const reposFile = path.join(projectRoot, 'repos.json');
export const stateFile = path.join(storageDir, 'state.json');
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

  if (env.pollingTimeout < 1) {
    throw new Error('TELEGRAM_POLLING_TIMEOUT must be greater than 0');
  }

  if (env.pollingInterval < 0) {
    throw new Error('TELEGRAM_POLLING_INTERVAL must be 0 or greater');
  }
}
