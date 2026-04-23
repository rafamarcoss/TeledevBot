import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config.js';

export function detectLaravelApp(repoPath) {
  const rootArtisanPath = path.join(repoPath, 'artisan');
  if (fs.existsSync(rootArtisanPath)) {
    return {
      exists: true,
      path: repoPath,
      artisanPath: rootArtisanPath,
      displayPath: '.'
    };
  }

  const backendPath = path.join(repoPath, 'backend');
  const backendArtisanPath = path.join(backendPath, 'artisan');
  if (fs.existsSync(backendArtisanPath)) {
    return {
      exists: true,
      path: backendPath,
      artisanPath: backendArtisanPath,
      displayPath: './backend'
    };
  }

  return {
    exists: false,
    path: null,
    artisanPath: null,
    displayPath: null
  };
}

function getReposBaseDir() {
  if (!env.reposBaseDir) {
    throw new Error('REPOS_BASE_DIR is not configured.');
  }

  return env.reposBaseDir;
}

function isValidRepoPath(repoPath) {
  return fs.existsSync(path.join(repoPath, '.git'));
}

export function listRepos() {
  const baseDir = getReposBaseDir();

  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const repoPath = path.resolve(baseDir, entry.name);
      return {
        name: entry.name,
        path: repoPath
      };
    })
    .filter((repo) => isValidRepoPath(repo.path))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getRepoPath(name) {
  const repo = listRepos().find((candidate) => candidate.name === name);
  return repo?.path || null;
}

export function getRepoInfo(name) {
  const repoPath = getRepoPath(name);

  if (!repoPath) {
    return null;
  }

  const laravelApp = detectLaravelApp(repoPath);

  return {
    name,
    path: repoPath,
    exists: fs.existsSync(repoPath),
    hasGit: isValidRepoPath(repoPath),
    hasArtisan: laravelApp.exists,
    laravelApp
  };
}
