import { env } from '../config.js';
import { formatError, formatRepos, isAuthorized, requireActiveRepo, shrinkOutput } from './helpers.js';
import { allowedPresets, runCodex, runCodexPrompt, runGitCommit, runPreset } from '../services/runner.js';
import { getActiveRepo, setActiveRepo } from '../services/stateStore.js';
import { readAgents } from '../services/agentReader.js';
import { sendPromptReportEmail } from '../services/emailService.js';
import { appendAppLog, appendPrompt, readLastRun } from '../services/logger.js';
import { getRepoInfo, listRepos } from '../services/repoStore.js';

const activePromptRuns = new Map();
const PROMPT_PROGRESS_INTERVAL_MS = 10 * 60_000;

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
          await send(bot, chatId, 'Uso: /repo <nombre>');
          return;
        }

        const repo = getRepoInfo(name);

        if (!repo) {
          const available = listRepos().map((candidate) => candidate.name).join(', ') || '(ninguno)';
          await send(bot, chatId, [
            `No encontre el repo: ${name}`,
            `Disponibles: ${available}`,
            '',
            'Usa /repos para ver la lista limpia.'
          ].join('\n'));
          return;
        }

        if (!repo.exists || !repo.hasGit) {
          await send(bot, chatId, `El repo "${name}" no esta disponible como repo git valido.`);
          return;
        }

        setActiveRepo(chatId, msg?.from?.id, name);
        appendAppLog('info', 'Active repo selected', {
          chatId,
          userId: msg?.from?.id || null,
          repoName: name,
          repoPath: repo.path
        });

        await send(bot, chatId, [
          `Repo activo: ${name}`,
          `Ruta: ${repo.path}`,
          `Git: ${repo.hasGit ? 'si' : 'no'}`,
          `Laravel app: ${repo.laravelApp.exists ? repo.laravelApp.displayPath : 'no detectada'}`
        ].join('\n'));
        return;
      }

      if (text === '/status') {
        const active = getActiveRepo(chatId, msg?.from?.id);
        if (!active?.repoName) {
          await send(bot, chatId, 'No hay repo activo. Primero usa /repos y luego /repo <nombre>.');
          return;
        }

        const repo = getRepoInfo(active.repoName);
        const agents = repo?.exists ? readAgents(repo.path) : null;

        await send(bot, chatId, [
          `Repo activo: ${active.repoName}`,
          `Ruta: ${repo?.path || '(no disponible)'}`,
          `Existe: ${repo?.exists ? 'si' : 'no'}`,
          `Git: ${repo?.hasGit ? 'si' : 'no'}`,
          `Laravel app: ${repo?.laravelApp?.exists ? repo.laravelApp.displayPath : 'no detectada'}`,
          `AGENTS.md: ${agents ? 'encontrado' : 'no encontrado'}`,
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

        const { repoName, repoPath } = requireActiveRepo(msg);

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

        const { repoName, repoPath } = requireActiveRepo(msg);

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

        const { repoName, repoPath } = requireActiveRepo(msg);

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

      if (text === '/prompt' || text.startsWith('/prompt ')) {
        const prompt = text.replace('/prompt', '').trim();
        if (!prompt) {
          await send(bot, chatId, 'Usage: /prompt <text>');
          return;
        }

        const { repoName, repoPath } = requireActiveRepo(msg);
        const agents = readAgents(repoPath);

        if (activePromptRuns.has(chatId)) {
          await send(bot, chatId, 'Ya hay una ejecucion de /prompt en curso para este chat. Espera a que termine.');
          return;
        }

        const entry = {
          createdAt: new Date().toISOString(),
          chatId,
          userId: msg?.from?.id || null,
          repoName,
          repoPath,
          prompt,
          hasAgents: Boolean(agents)
        };

        appendPrompt(entry);

        appendAppLog('info', 'Starting prompt Codex run', {
          chatId,
          repoName,
          repoPath,
          promptLength: prompt.length,
          hasAgents: Boolean(agents)
        });

        activePromptRuns.set(chatId, {
          repoName,
          repoPath,
          startedAt: new Date().toISOString()
        });

        await send(bot, chatId, 'Tarea iniciada. Te avisaré al terminar.');

        const progressSends = [];
        const progressTimer = setInterval(() => {
          const progressSend = send(bot, chatId, 'La tarea sigue en curso.');
          progressSends.push(progressSend);
          progressSend.catch((error) => {
            appendAppLog('error', 'Failed to send prompt progress message', {
              chatId,
              error: formatError(error)
            });
          });
        }, PROMPT_PROGRESS_INTERVAL_MS);

        try {
          const result = await runCodexPrompt(prompt, repoPath, {
            onParseError: (error, line) => {
              appendAppLog('warn', 'Failed to parse Codex JSON event', {
                chatId,
                repoName,
                error: formatError(error),
                line: shrinkOutput(line, 500)
              });
            }
          });

          clearInterval(progressTimer);
          await Promise.allSettled(progressSends);

          appendAppLog('info', 'Prompt Codex run finished', {
            chatId,
            repoName,
            repoPath,
            success: result.success,
            turnCompleted: result.turnCompleted,
            exitCode: result.exitCode,
            outputLength: result.output?.length || 0
          });

          const emailReport = {
            repoName,
            repoPath,
            startedAt: result.startedAt,
            finishedAt: result.finishedAt,
            prompt,
            status: result.success ? 'correcto' : 'error',
            success: result.success,
            resultText: result.output,
            errorText: result.success ? '' : [
              `Exit code: ${result.exitCode ?? '(sin codigo)'}`,
              result.output
            ].filter(Boolean).join('\n'),
            result
          };

          let emailStatus = { skipped: true, reason: 'disabled' };
          try {
            emailStatus = await sendPromptReportEmail(emailReport);
          } catch (error) {
            appendAppLog('error', 'Failed to send prompt email', {
              chatId,
              repoName,
              repoPath,
              error: formatError(error)
            });
            await send(bot, chatId, result.success
              ? 'Tarea finalizada, pero falló el envío del correo.'
              : 'La tarea falló y también falló el envío del correo.');
            return;
          }

          if (!result.success) {
            const exitSummary = result.exitCode === null || result.exitCode === undefined
              ? 'sin codigo'
              : `exit code ${result.exitCode}`;
            await send(bot, chatId, `La tarea falló (${exitSummary}). ${emailStatus.skipped ? 'Email no configurado.' : 'Revisa tu correo.'}`);
            return;
          }

          await send(bot, chatId, emailStatus.skipped
            ? 'Tarea finalizada. Email no configurado.'
            : 'Tarea finalizada. Revisa tu correo.');
        } finally {
          clearInterval(progressTimer);
          activePromptRuns.delete(chatId);
        }
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
