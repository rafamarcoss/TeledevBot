import fs from 'node:fs';
import { appLog, promptsLog, runsLog } from '../config.js';

function appendLine(target, entry) {
  fs.appendFileSync(target, JSON.stringify(entry) + '\n');
}

function readJsonLines(target) {
  if (!fs.existsSync(target)) {
    return [];
  }

  const raw = fs.readFileSync(target, 'utf8').trim();
  if (!raw) {
    return [];
  }

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function appendPrompt(entry) {
  appendLine(promptsLog, entry);
}

export function appendRun(entry) {
  appendLine(runsLog, entry);
}

export function appendAppLog(level, message, meta = {}) {
  appendLine(appLog, {
    createdAt: new Date().toISOString(),
    level,
    message,
    ...meta
  });
}

export function readLastRun() {
  const lines = readJsonLines(runsLog);
  return lines.at(-1) || null;
}
