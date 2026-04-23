import TelegramBot from 'node-telegram-bot-api';
import { ensureStorage, requireEnv, env } from './config.js';
import { registerCommands } from './commands/register.js';
import { appendAppLog } from './services/logger.js';
import { getRepoInfo } from './services/repoStore.js';
import { readState, writeState } from './services/stateStore.js';

ensureStorage();
requireEnv();

const state = readState();
if (!state.activeRepo && env.defaultRepo) {
  const defaultRepo = getRepoInfo(env.defaultRepo);

  if (defaultRepo?.exists) {
    writeState({ activeRepo: env.defaultRepo });
    appendAppLog('info', 'Initialized default repo from .env', {
      defaultRepo: env.defaultRepo
    });
  } else {
    appendAppLog('warn', 'DEFAULT_REPO was configured but not usable', {
      defaultRepo: env.defaultRepo
    });
  }
}

const bot = new TelegramBot(env.token, {
  polling: {
    autoStart: true,
    interval: env.pollingInterval,
    params: {
      timeout: env.pollingTimeout
    }
  }
});

registerCommands(bot);

bot.on('polling_error', (error) => {
  appendAppLog('error', 'Telegram polling error', { error: error.message });
  console.error('Telegram polling error:', error.message);
});

bot.on('error', (error) => {
  appendAppLog('error', 'Telegram bot error', { error: error.message });
  console.error('Telegram bot error:', error.message);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    appendAppLog('info', `Received ${signal}, stopping bot`);

    try {
      await bot.stopPolling();
    } catch (error) {
      console.error('Failed to stop polling cleanly:', error.message);
    }

    process.exit(0);
  });
}

appendAppLog('info', 'TeleDev Orchestrator started', {
  allowedChatId: env.allowedChatId,
  defaultRepo: env.defaultRepo
});
console.log('TeleDev Orchestrator V1 is running with Telegram polling.');
