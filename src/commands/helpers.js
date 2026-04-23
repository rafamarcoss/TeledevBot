import { env } from '../config.js';
import { getRepoPath, listRepos } from '../services/repoStore.js';
import { getActiveRepo } from '../services/stateStore.js';

export function isAuthorized(msg) {
  return String(msg.chat.id) === String(env.allowedChatId);
}

export function requireActiveRepo(msg) {
  const chatId = msg?.chat?.id;
  const userId = msg?.from?.id;
  const active = getActiveRepo(chatId, userId);

  if (!active?.repoName) {
    throw new Error('No hay repo activo. Primero usa /repos para ver opciones y luego /repo <nombre>.');
  }

  const repoPath = getRepoPath(active.repoName);
  if (!repoPath) {
    throw new Error(`El repo activo "${active.repoName}" ya no esta disponible. Usa /repos y selecciona otro con /repo <nombre>.`);
  }

  return {
    repoName: active.repoName,
    repoPath
  };
}

export function formatRepos() {
  const repos = listRepos();

  if (repos.length === 0) {
    return [
      'No encontre repos disponibles.',
      `Base: ${env.reposBaseDir || '(sin configurar)'}`,
      '',
      'Solo aparecen subcarpetas directas que contienen .git.'
    ].join('\n');
  }

  return [
    'Repos disponibles:',
    ...repos.map((repo) => `- ${repo.name}`),
    '',
    'Selecciona uno con /repo <nombre>.'
  ].join('\n');
}

export function shrinkOutput(text, max = 3500) {
  if (!text) return '(no output)';
  return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}

export function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
