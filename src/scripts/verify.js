import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

const projectRoot = process.cwd();
const reposBaseDir = path.join(projectRoot, 'sandbox', 'repos-base');
const binDir = path.join(projectRoot, 'sandbox', 'bin');
const sampleRepo = path.join(reposBaseDir, 'sample');
const backendRepo = path.join(reposBaseDir, 'backend-app');
const ignoredDir = path.join(reposBaseDir, 'not-a-repo');
const allowedChatId = Number.parseInt(process.env.TELEGRAM_ALLOWED_CHAT_ID || '123456789', 10);
const userId = 987654321;

process.env.TELEGRAM_ALLOWED_CHAT_ID = String(allowedChatId);
process.env.REPOS_BASE_DIR = reposBaseDir;
process.env.EMAIL_ENABLED = 'false';
process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;

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

async function ensureGitRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });

  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    await execa('git', ['init'], { cwd: repoPath });
  }
}

async function ensureDemoRepos() {
  fs.rmSync(reposBaseDir, { recursive: true, force: true });
  fs.mkdirSync(ignoredDir, { recursive: true });

  await ensureGitRepo(sampleRepo);
  fs.writeFileSync(path.join(sampleRepo, 'artisan'), "#!/usr/bin/env php\n<?php\necho \"demo artisan\\n\";\n");

  await ensureGitRepo(backendRepo);
  fs.mkdirSync(path.join(backendRepo, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(backendRepo, 'backend', 'artisan'), "#!/usr/bin/env php\n<?php\necho \"backend artisan\\n\";\n");
  fs.writeFileSync(path.join(backendRepo, 'AGENTS.md'), '# Test agents\n');
}

function ensureFakeCodex() {
  fs.mkdirSync(binDir, { recursive: true });

  const codexPath = path.join(binDir, 'codex');
  fs.writeFileSync(codexPath, [
    '#!/usr/bin/env node',
    'const prompt = process.argv.at(-1);',
    'console.log("this is not json");',
    'console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: `Resumen\\nFake Codex response: ${prompt}` } }));',
    'console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Siguientes pasos\\n- Verify email report" } }));',
    'console.log(JSON.stringify({ type: "turn.completed" }));'
  ].join('\n'));
  fs.chmodSync(codexPath, 0o755);
}

async function send(handler, bot, text, chatId = allowedChatId, fromId = userId) {
  await handler({
    chat: { id: chatId },
    from: { id: fromId },
    text
  });

  return bot.messages.at(-1)?.text || '';
}

async function main() {
  const [
    { createMessageHandler },
    { ensureStorage, promptsLog, runsLog },
    { readLastRun },
    { clearActiveRepos },
    { renderPromptEmail }
  ] = await Promise.all([
    import('../commands/register.js'),
    import('../config.js'),
    import('../services/logger.js'),
    import('../services/stateStore.js'),
    import('../services/promptEmailRenderer.js')
  ]);

  ensureStorage();
  fs.writeFileSync(promptsLog, '');
  fs.writeFileSync(runsLog, '');
  clearActiveRepos();
  ensureFakeCodex();
  await ensureDemoRepos();

  const bot = new FakeBot();
  const handler = createMessageHandler(bot);

  const unauthorized = await send(handler, bot, '/help', 999);
  assert(unauthorized.includes('Unauthorized chat'), 'Unauthorized chat handling failed');

  const noRepoRun = await send(handler, bot, '/run pwd');
  assert(noRepoRun.includes('Primero usa /repos'), 'Missing active repo message failed');

  const repos = await send(handler, bot, '/repos');
  assert(repos.includes('- sample'), 'Repo listing did not include sample');
  assert(repos.includes('- backend-app'), 'Repo listing did not include backend-app');
  assert(!repos.includes('not-a-repo'), 'Repo listing included a folder without .git');

  const selected = await send(handler, bot, '/repo sample');
  assert(selected.includes('Repo activo: sample'), 'Repo selection failed');
  assert(selected.includes('Laravel app: .'), 'Root Laravel app was not reported');

  const status = await send(handler, bot, '/status');
  assert(status.includes('Repo activo: sample'), 'Status command failed');
  assert(status.includes('Existe: si'), 'Status did not report existing repo');
  assert(status.includes('Git: si'), 'Status did not report git repo');

  const otherUserStatus = await send(handler, bot, '/status', allowedChatId, 111);
  assert(otherUserStatus.includes('No hay repo activo'), 'Repo selection leaked across users');

  const pwdStartIndex = bot.messages.length;
  await send(handler, bot, '/run pwd');
  const pwdMessages = bot.messages.slice(pwdStartIndex).map((entry) => entry.text);
  assert(pwdMessages.some((entry) => entry.includes('Running pwd on sample')), 'Run start message missing');
  assert(pwdMessages.some((entry) => entry.includes('Preset: pwd') && entry.includes('Success: yes')), 'pwd preset failed');
  assert(readLastRun()?.cwd === sampleRepo, 'pwd did not run inside the selected repo');

  const promptStartIndex = bot.messages.length;
  const promptResponse = await send(handler, bot, '/prompt Review AGENTS.md before changes');
  const promptMessages = bot.messages.slice(promptStartIndex).map((entry) => entry.text);
  const promptRun = readLastRun();
  assert(promptMessages[0] === 'Tarea iniciada. Te avisaré al terminar.', 'Prompt start message missing or too verbose');
  assert(promptResponse === 'Tarea finalizada. Email no configurado.', 'Prompt final message missing or too verbose');
  assert(!promptMessages.some((entry) => entry.includes('Fake Codex response')), 'Prompt agent_message was sent to Telegram');
  assert(fs.readFileSync(promptsLog, 'utf8').includes('Review AGENTS.md before changes'), 'Prompt log was not written');
  assert(promptRun?.preset === 'prompt', 'Prompt run was not logged');
  assert(promptRun?.output.includes('Fake Codex response: Review AGENTS.md before changes'), 'Prompt output was not accumulated');
  assert(promptRun?.messages?.length === 2, 'Prompt agent messages were not preserved in order');
  const promptEmailHtml = renderPromptEmail({
    repoName: 'sample',
    repoPath: sampleRepo,
    startedAt: promptRun.startedAt,
    finishedAt: promptRun.finishedAt,
    prompt: '<check escaping>',
    status: 'correcto',
    success: true,
    resultText: promptRun.output,
    result: promptRun
  });
  assert(promptEmailHtml.includes('Fake Codex response: Review AGENTS.md before changes'), 'Prompt email does not include accumulated output');
  assert(promptEmailHtml.includes('&lt;check escaping&gt;'), 'Prompt email did not escape dynamic HTML');
  assert(promptEmailHtml.includes('Siguientes pasos'), 'Prompt email omitted a real next steps section');
  assert(!promptEmailHtml.includes('No se detectaron problemas específicos'), 'Prompt email rendered the old problems fallback');
  assert(!promptEmailHtml.includes('Codex no separó recomendaciones'), 'Prompt email rendered the old improvements fallback');
  assert(!promptEmailHtml.includes('Codex no identificó archivos afectados'), 'Prompt email rendered the old files fallback');

  const generalOnlyEmailHtml = renderPromptEmail({
    repoName: 'sample',
    repoPath: sampleRepo,
    startedAt: promptRun.startedAt,
    finishedAt: promptRun.finishedAt,
    prompt: 'General-only task',
    status: 'correcto',
    success: true,
    resultText: 'Todo quedó en una salida general sin bloques especializados.',
    result: { turnCompleted: true, exitCode: 0, parseErrorCount: 0 }
  });
  assert(generalOnlyEmailHtml.includes('Todo quedó en una salida general'), 'General-only prompt email omitted the main output');
  assert(!generalOnlyEmailHtml.includes('Problemas detectados'), 'General-only prompt email rendered empty problems section');
  assert(!generalOnlyEmailHtml.includes('Mejoras recomendadas'), 'General-only prompt email rendered empty improvements section');
  assert(!generalOnlyEmailHtml.includes('Archivos afectados'), 'General-only prompt email rendered empty files section');
  assert(!generalOnlyEmailHtml.includes('Siguientes pasos'), 'General-only prompt email rendered empty next steps section');
  assert(!generalOnlyEmailHtml.includes('Observaciones relevantes'), 'General-only prompt email rendered non-useful observations');

  const artificialFallbackEmailHtml = renderPromptEmail({
    repoName: 'sample',
    repoPath: sampleRepo,
    startedAt: promptRun.startedAt,
    finishedAt: promptRun.finishedAt,
    prompt: 'Fallback cleanup task',
    status: 'correcto',
    success: true,
    resultText: [
      'Resumen',
      'Contenido real del resumen.',
      'Problemas detectados',
      'No se detectaron problemas específicos en la salida de Codex.'
    ].join('\n'),
    result: { turnCompleted: true, exitCode: 0, parseErrorCount: 0 }
  });
  assert(artificialFallbackEmailHtml.includes('Contenido real del resumen'), 'Fallback cleanup email omitted real summary content');
  assert(!artificialFallbackEmailHtml.includes('No se detectaron problemas específicos'), 'Fallback cleanup email rendered artificial section content');
  assert(!artificialFallbackEmailHtml.includes('Problemas detectados'), 'Fallback cleanup email rendered section with artificial content only');

  const backendSelected = await send(handler, bot, '/repo backend-app');
  assert(backendSelected.includes('Repo activo: backend-app'), 'Second repo selection failed');
  assert(backendSelected.includes('Laravel app: ./backend'), 'Backend Laravel app was not reported');

  const backendStatus = await send(handler, bot, '/status');
  assert(backendStatus.includes('Repo activo: backend-app'), 'Backend repo status failed');
  assert(backendStatus.includes('AGENTS.md: encontrado'), 'AGENTS.md detection failed');

  const lastlog = await send(handler, bot, '/lastlog');
  assert(lastlog.includes('Preset: prompt'), 'Last log command failed');

  console.log('Verification passed.');
  console.log(`Repos base: ${reposBaseDir}`);
  console.log(`Messages checked: ${bot.messages.length}`);
}

main().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exitCode = 1;
});
