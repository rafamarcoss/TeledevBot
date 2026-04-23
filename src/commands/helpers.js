import { env } from '../config.js';
import { getRepoInfo, getRepoPath, readRepos } from '../services/repoStore.js';
import { readState } from '../services/stateStore.js';

export function isAuthorized(msg) {
  return String(msg.chat.id) === String(env.allowedChatId);
}

export function requireActiveRepo() {
  const state = readState();
  if (!state.activeRepo) {
    throw new Error('No active repo selected. Use /repo <name>.');
  }

  const repoPath = getRepoPath(state.activeRepo);
  if (!repoPath) {
    throw new Error('Active repo is missing in repos.json.');
  }

  return {
    repoName: state.activeRepo,
    repoPath
  };
}

export function formatRepos() {
  const repos = readRepos();
  const lines = Object.keys(repos).sort().map((name) => {
    const info = getRepoInfo(name);
    const status = info.exists ? 'ok' : 'missing';
    return `- ${name}: ${info.path} [${status}]`;
  });

  return lines.length > 0 ? lines.join('\n') : 'No repos configured in repos.json.';
}

export function shrinkOutput(text, max = 3500) {
  if (!text) return '(no output)';
  return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}

export function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
