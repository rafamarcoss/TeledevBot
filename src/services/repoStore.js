import fs from 'node:fs';
import path from 'node:path';
import { reposFile } from '../config.js';

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

export function readRepos() {
  if (!fs.existsSync(reposFile)) {
    throw new Error('repos.json not found. Copy repos.example.json to repos.json and edit it.');
  }

  const raw = JSON.parse(fs.readFileSync(reposFile, 'utf8'));

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('repos.json must be a JSON object of repo names to absolute paths.');
  }

  return raw;
}

export function getRepoPath(name) {
  const repos = readRepos();
  return repos[name] || null;
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
    hasGit: fs.existsSync(path.join(repoPath, '.git')),
    hasArtisan: laravelApp.exists,
    laravelApp
  };
}
