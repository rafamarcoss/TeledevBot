import fs from 'node:fs';
import path from 'node:path';

export function readAgents(repoPath) {
  const target = path.join(repoPath, 'AGENTS.md');

  if (!fs.existsSync(target)) {
    return null;
  }

  return fs.readFileSync(target, 'utf8');
}
