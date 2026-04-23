import TelegramBot from 'node-telegram-bot-api';
import { ensureStorage, requireEnv, env } from './config.js';
import { registerCommands } from './commands/register.js';
import { appendAppLog } from './services/logger.js';

ensureStorage();
requireEnv();

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
  reposBaseDir: env.reposBaseDir
});
console.log('TeleDev Orchestrator V1 is running with Telegram polling.');
