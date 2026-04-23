import fs from 'node:fs';
import { stateFile, storageDir } from '../config.js';

function defaultState() {
  return {
    activeRepo: null,
    updatedAt: null
  };
}

export function readState() {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, JSON.stringify(defaultState(), null, 2));
  }

  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

export function writeState(nextState) {
  const current = readState();
  const payload = {
    ...current,
    ...nextState,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(stateFile, JSON.stringify(payload, null, 2));
  return payload;
}
