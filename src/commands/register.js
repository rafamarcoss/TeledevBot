import { env } from '../config.js';
import { formatError, formatRepos, isAuthorized, requireActiveRepo, shrinkOutput } from './helpers.js';
import { allowedPresets, runCodex, runGitCommit, runPreset } from '../services/runner.js';
import { readState, writeState } from '../services/stateStore.js';
import { readAgents } from '../services/agentReader.js';
import { appendAppLog, appendPrompt, readLastRun } from '../services/logger.js';
import { getRepoInfo } from '../services/repoStore.js';

function helpText() {
  return [
    'TeleDev Orchestrator V1',
    '',
    '/repos',
    '/repo <name>',
    '/status',
    '/run <preset>',
    '/codex <prompt>',
    '/commit <message>',
    `/presets ${allowedPresets().join(', ')}`,
    '/prompt <text>',
    '/lastlog'
  ].join('\n');
}

async function send(bot, chatId, text) {
  appendAppLog('info', 'Sending Telegram message', {
    chatId,
    textLength: text?.length || 0
  });

  await bot.sendMessage(chatId, text);

  appendAppLog('info', 'Telegram message sent', {
    chatId,
    textLength: text?.length || 0
  });
}

export function createMessageHandler(bot) {
  return async function handleMessage(msg) {
    const chatId = msg?.chat?.id;
    const text = msg?.text?.trim();

    if (!chatId) {
      return;
    }

    if (!isAuthorized(msg)) {
      appendAppLog('warn', 'Rejected unauthorized chat message', {
        chatId,
        allowedChatId: env.allowedChatId
      });
      await send(bot, chatId, 'Unauthorized chat.');
      return;
    }

    if (!text || !text.startsWith('/')) {
      return;
    }

    appendAppLog('info', 'Received Telegram command', {
      chatId,
      text
    });

    try {
      if (text === '/start' || text === '/help') {
        await send(bot, chatId, helpText());
        return;
      }

      if (text === '/presets') {
        await send(bot, chatId, `Allowed presets: ${allowedPresets().join(', ')}`);
        return;
      }

      if (text === '/repos') {
        await send(bot, chatId, formatRepos());
        return;
      }

      if (text.startsWith('/repo')) {
        const name = text.replace('/repo', '').trim();
        if (!name) {
          await send(bot, chatId, 'Usage: /repo <name>');
          return;
        }

        const repo = getRepoInfo(name);

        if (!repo) {
          await send(bot, chatId, `Repo not found: ${name}`);
          return;
        }

        if (!repo.exists) {
          await send(bot, chatId, `Repo path does not exist for ${name}: ${repo.path}`);
          return;
        }

        writeState({ activeRepo: name });
        await send(bot, chatId, [
          `Active repo set to: ${name}`,
          `Path: ${repo.path}`,
          `Git: ${repo.hasGit ? 'yes' : 'no'}`,
          `Laravel app: ${repo.laravelApp.exists ? repo.laravelApp.displayPath : 'not found'}`
        ].join('\n'));
        return;
      }

      if (text === '/status') {
        const state = readState();
        if (!state.activeRepo) {
          await send(bot, chatId, 'No active repo selected.');
          return;
        }

        const repo = getRepoInfo(state.activeRepo);
        const agents = repo?.exists ? readAgents(repo.path) : null;

        await send(bot, chatId, [
          `Active repo: ${state.activeRepo}`,
          `Path: ${repo?.path || '(missing)'}`,
          `Repo exists: ${repo?.exists ? 'yes' : 'no'}`,
          `Git repo: ${repo?.hasGit ? 'yes' : 'no'}`,
          `Laravel app: ${repo?.laravelApp?.exists ? repo.laravelApp.displayPath : 'not found'}`,
          `AGENTS.md: ${agents ? 'found' : 'not found'}`,
          `Allowed presets: ${allowedPresets().join(', ')}`
        ].join('\n'));
        return;
      }

      if (text.startsWith('/run')) {
        const preset = text.replace('/run', '').trim();
        if (!preset) {
          await send(bot, chatId, 'Usage: /run <preset>');
          return;
        }

        const { repoName, repoPath } = requireActiveRepo();

        appendAppLog('info', 'Starting preset run', {
          chatId,
          preset,
          repoName,
          repoPath
        });

        await send(bot, chatId, `Running ${preset} on ${repoName}...`);

        const result = await runPreset(preset, repoPath);

        appendAppLog('info', 'Preset run finished', {
          chatId,
          preset,
          repoName,
          repoPath,
          success: result.success,
          cwd: result.cwd,
          outputLength: result.output?.length || 0
        });

        const response = [
          `Preset: ${result.preset}`,
          `Repo: ${repoName}`,
          `Success: ${result.success ? 'yes' : 'no'}`,
          '',
          shrinkOutput(result.output)
        ].join('\n');

        appendAppLog('info', 'About to send preset response', {
          chatId,
          preset,
          repoName,
          responseLength: response.length
        });

        await send(bot, chatId, response);

        appendAppLog('info', 'Preset response sent', {
          chatId,
          preset,
          repoName
        });

        return;
      }

      if (text.startsWith('/codex')) {
        const prompt = text.replace('/codex', '').trim();
        if (!prompt) {
          await send(bot, chatId, 'Usage: /codex <prompt>');
          return;
        }

        const { repoName, repoPath } = requireActiveRepo();

        appendAppLog('info', 'Starting Codex run', {
          chatId,
          repoName,
          repoPath,
          promptLength: prompt.length
        });

        await send(bot, chatId, `Running Codex on ${repoName}...`);

        const result = await runCodex(prompt, repoPath);

        appendAppLog('info', 'Codex run finished', {
          chatId,
          repoName,
          repoPath,
          success: result.success,
          cwd: result.cwd,
          outputLength: result.output?.length || 0
        });

        const response = [
          'Command: codex',
          `Repo: ${repoName}`,
          `Success: ${result.success ? 'yes' : 'no'}`,
          '',
          shrinkOutput(result.output)
        ].join('\n');

        await send(bot, chatId, response);
        return;
      }

      if (text.startsWith('/commit')) {
        const message = text.replace('/commit', '').trim();
        if (!message) {
          await send(bot, chatId, 'Usage: /commit <message>');
          return;
        }

        const { repoName, repoPath } = requireActiveRepo();

        appendAppLog('info', 'Starting git commit', {
          chatId,
          repoName,
          repoPath,
          message
        });

        await send(bot, chatId, `Creating commit on ${repoName}...`);

        const result = await runGitCommit(message, repoPath);

        appendAppLog('info', 'Git commit finished', {
          chatId,
          repoName,
          repoPath,
          success: result.success,
          cwd: result.cwd,
          outputLength: result.output?.length || 0
        });

        const response = [
          'Command: commit',
          `Repo: ${repoName}`,
          `Success: ${result.success ? 'yes' : 'no'}`,
          '',
          shrinkOutput(result.output)
        ].join('\n');

        await send(bot, chatId, response);
        return;
      }

      if (text.startsWith('/prompt')) {
        const prompt = text.replace('/prompt', '').trim();
        if (!prompt) {
          await send(bot, chatId, 'Usage: /prompt <text>');
          return;
        }

        const { repoName, repoPath } = requireActiveRepo();
        const agents = readAgents(repoPath);

        const entry = {
          createdAt: new Date().toISOString(),
          repoName,
          repoPath,
          prompt,
          hasAgents: Boolean(agents)
        };

        appendPrompt(entry);

        await send(bot, chatId, [
          `Prompt saved for repo: ${repoName}`,
          `AGENTS.md: ${agents ? 'attached in local context' : 'not found'}`,
          '',
          prompt
        ].join('\n'));
        return;
      }

      if (text === '/lastlog') {
        const last = readLastRun();
        if (!last) {
          await send(bot, chatId, 'No run logs yet.');
          return;
        }

        await send(bot, chatId, [
          `Preset: ${last.preset}`,
          `Success: ${last.success ? 'yes' : 'no'}`,
          `Started: ${last.startedAt}`,
          '',
          shrinkOutput(last.output)
        ].join('\n'));
        return;
      }

      await send(bot, chatId, 'Unknown command. Use /help.');
    } catch (error) {
      appendAppLog('error', 'Command handling failed', {
        chatId,
        text,
        error: formatError(error)
      });

      try {
        await send(bot, chatId, `Error: ${formatError(error)}`);
      } catch (sendError) {
        appendAppLog('error', 'Failed to send Telegram error message', {
          chatId,
          originalText: text,
          sendError: formatError(sendError)
        });
      }
    }
  };
}

export function registerCommands(bot) {
  const handleMessage = createMessageHandler(bot);
  bot.on('message', handleMessage);
  return handleMessage;
}
