import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { createMessageHandler } from '../commands/register.js';
import { ensureStorage, projectRoot, promptsLog, runsLog } from '../config.js';
import { readLastRun } from '../services/logger.js';
import { getRepoPath } from '../services/repoStore.js';
import { writeState } from '../services/stateStore.js';

const demoRepo = path.join(projectRoot, 'sandbox', 'demo-repo');
const allowedChatId = Number.parseInt(process.env.TELEGRAM_ALLOWED_CHAT_ID || '123456789', 10);

class FakeBot {
  constructor() {
    this.messages = [];
  }

  async sendMessage(chatId, text) {
    this.messages.push({ chatId, text });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureDemoRepo() {
  fs.mkdirSync(demoRepo, { recursive: true });

  if (!fs.existsSync(path.join(demoRepo, '.git'))) {
    await execa('git', ['init'], { cwd: demoRepo });
  }

  const artisanPath = path.join(demoRepo, 'artisan');
  if (!fs.existsSync(artisanPath)) {
    fs.writeFileSync(artisanPath, "#!/usr/bin/env php\n<?php\necho \"demo artisan\\n\";\n");
  }
}

async function send(handler, bot, text, chatId = allowedChatId) {
  await handler({
    chat: { id: chatId },
    text
  });

  return bot.messages.at(-1)?.text || '';
}

async function main() {
  const stockRepoPath = getRepoPath('stock-management-live');
  assert(stockRepoPath, 'stock-management-live is missing from repos.json');

  ensureStorage();
  fs.mkdirSync(path.join(projectRoot, 'sandbox'), { recursive: true });
  fs.writeFileSync(promptsLog, '');
  fs.writeFileSync(runsLog, '');
  writeState({ activeRepo: null });
  await ensureDemoRepo();

  const bot = new FakeBot();
  const handler = createMessageHandler(bot);

  const unauthorized = await send(handler, bot, '/help', 999);
  assert(unauthorized.includes('Unauthorized chat'), 'Unauthorized chat handling failed');

  const repos = await send(handler, bot, '/repos');
  assert(repos.includes('sample'), 'Repo listing failed');

  const selected = await send(handler, bot, '/repo sample');
  assert(selected.includes('Active repo set to: sample'), 'Repo selection failed');
  assert(selected.includes('Laravel app: .'), 'Root Laravel app was not reported');

  const status = await send(handler, bot, '/status');
  assert(status.includes('Repo exists: yes'), 'Status command failed');
  assert(status.includes('Laravel app: .'), 'Status did not report root Laravel app');

  const pwdStartIndex = bot.messages.length;
  await handler({ chat: { id: allowedChatId }, text: '/run pwd' });
  const pwdMessages = bot.messages.slice(pwdStartIndex).map((entry) => entry.text);
  assert(pwdMessages.some((entry) => entry.includes('Running pwd on sample')), 'Run start message missing');
  assert(pwdMessages.some((entry) => entry.includes(`Preset: pwd`) && entry.includes('Success: yes')), 'pwd preset failed');

  const gitStartIndex = bot.messages.length;
  await handler({ chat: { id: allowedChatId }, text: '/run git-status' });
  const gitMessages = bot.messages.slice(gitStartIndex).map((entry) => entry.text);
  assert(gitMessages.some((entry) => entry.includes('Preset: git-status') && entry.includes('Success: yes')), 'git-status preset failed');

  const promptResponse = await send(handler, bot, '/prompt Review AGENTS.md before changes');
  assert(promptResponse.includes('Prompt saved for repo: sample'), 'Prompt storage failed');
  assert(fs.readFileSync(promptsLog, 'utf8').includes('Review AGENTS.md before changes'), 'Prompt log was not written');

  const lastlog = await send(handler, bot, '/lastlog');
  assert(lastlog.includes('Preset: git-status'), 'Last log command failed');

  const routeStartIndex = bot.messages.length;
  await handler({ chat: { id: allowedChatId }, text: '/run route-list' });
  const routeMessages = bot.messages.slice(routeStartIndex).map((entry) => entry.text);
  assert(routeMessages.some((entry) => entry.includes('Preset: route-list')), 'route-list response missing');
  assert(routeMessages.some((entry) => entry.includes('Success:')), 'route-list did not complete cleanly');
  assert(readLastRun()?.cwd === demoRepo, 'route-list did not run from the root Laravel app');

  writeState({ activeRepo: 'stock-management-live' });
  const stockStatus = await send(handler, bot, '/status');
  assert(stockStatus.includes('Active repo: stock-management-live'), 'Stock repo status failed');
  assert(stockStatus.includes('Laravel app: ./backend'), 'Status did not report backend Laravel app');
  assert(stockStatus.includes('AGENTS.md: found'), 'Stock repo AGENTS.md was not detected');

  const stockRouteStartIndex = bot.messages.length;
  await handler({ chat: { id: allowedChatId }, text: '/run route-list' });
  const stockRouteMessages = bot.messages.slice(stockRouteStartIndex).map((entry) => entry.text);
  assert(stockRouteMessages.some((entry) => entry.includes('Preset: route-list')), 'Stock route-list response missing');
  assert(stockRouteMessages.some((entry) => entry.includes('Success:')), 'Stock route-list did not complete cleanly');
  assert(readLastRun()?.cwd === path.join(stockRepoPath, 'backend'), 'Stock route-list did not run from ./backend');

  console.log('Verification passed.');
  console.log(`Demo repo: ${demoRepo}`);
  console.log(`Messages checked: ${bot.messages.length}`);
}

main().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exitCode = 1;
});
