const activeRepos = new Map();

function stateKey(chatId, userId = null) {
  return `${chatId}:${userId || chatId}`;
}

export function getActiveRepo(chatId, userId = null) {
  return activeRepos.get(stateKey(chatId, userId)) || null;
}

export function setActiveRepo(chatId, userId, repoName) {
  activeRepos.set(stateKey(chatId, userId), {
    repoName,
    updatedAt: new Date().toISOString()
  });
}

export function clearActiveRepos() {
  activeRepos.clear();
}
