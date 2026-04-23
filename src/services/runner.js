import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execa } from 'execa';
import { appendRun } from './logger.js';
import { detectLaravelApp } from './repoStore.js';

const PRESETS = {
  'git-status': {
    command: 'git',
    args: ['status', '--short', '--branch'],
    requires: ['git']
  },
  'docker-ps': {
    command: 'docker',
    args: ['compose', 'ps'],
    requires: ['docker-compose']
  },
  'up': {
    command: 'docker',
    args: ['compose', 'up', '-d'],
    requires: ['docker-compose']
  },
  'down': {
    command: 'docker',
    args: ['compose', 'down'],
    requires: ['docker-compose']
  },
  'logs-app': {
    command: 'docker',
    args: ['compose', 'logs', '--tail=100', 'app'],
    requires: ['docker-compose']
  },
  'logs-worker': {
    command: 'docker',
    args: ['compose', 'logs', '--tail=100', 'worker'],
    requires: ['docker-compose']
  },
  'restart-app': {
    command: 'docker',
    args: ['compose', 'restart', 'app'],
    requires: ['docker-compose']
  },
  'artisan-test': {
    command: 'docker',
    args: ['compose', 'exec', '-T', 'app', 'php', 'artisan', 'test'],
    requires: ['docker-compose']
  },
  'route-list': {
    command: 'docker',
    args: ['compose', 'exec', '-T', 'app', 'php', 'artisan', 'route:list'],
    requires: ['docker-compose']
  },
  'migrate': {
    command: 'docker',
    args: ['compose', 'exec', '-T', 'app', 'php', 'artisan', 'migrate', '--force'],
    requires: ['docker-compose']
  },
  'pwd': {
    command: 'pwd',
    args: [],
    requires: []
  },
  'ls': {
    command: 'ls',
    args: ['-la'],
    requires: []
  }
};

export function allowedPresets() {
  return Object.keys(PRESETS);
}

export function getPresetDetails(preset) {
  return PRESETS[preset] || null;
}

function ensureRepoReady(cwd, preset) {
  if (!fs.existsSync(cwd)) {
    throw new Error(`Repo path does not exist: ${cwd}`);
  }

  const selected = PRESETS[preset];

  if (!selected) {
    throw new Error(`Unknown preset: ${preset}`);
  }

  if (selected.requires.includes('git') && !fs.existsSync(path.join(cwd, '.git'))) {
    throw new Error(`Preset ${preset} requires a git repository.`);
  }

  if (selected.requires.includes('artisan') && !detectLaravelApp(cwd).exists) {
    throw new Error(`Preset ${preset} requires a Laravel artisan file.`);
  }

  if (selected.requires.includes('docker-compose') && !fs.existsSync(path.join(cwd, 'docker-compose.yml'))) {
    throw new Error(`Preset ${preset} requires docker-compose.yml in the repo root.`);
  }
}

function resolvePresetCwd(cwd, preset) {
  const dockerBasedPresets = [
    'docker-ps',
    'up',
    'down',
    'logs-app',
    'logs-worker',
    'restart-app',
    'artisan-test',
    'route-list',
    'migrate'
  ];

  if (dockerBasedPresets.includes(preset)) {
    return cwd;
  }

  const selected = PRESETS[preset];
  if (!selected?.requires.includes('artisan')) {
    return cwd;
  }

  const laravelApp = detectLaravelApp(cwd);
  return laravelApp.path || cwd;
}

function normalizeErrorOutput(error) {
  if (error.all) {
    return error.all;
  }

  if (error.stderr || error.stdout) {
    return [error.stdout, error.stderr].filter(Boolean).join('\n');
  }

  if (error.code === 'ENOENT') {
    return `Command not available on this machine: ${error.command}`;
  }

  if (error.code === 'EACCES') {
    return `Permission denied while running command: ${error.command}`;
  }

  return error.message;
}

function ensureCodexRepo(cwd) {
  if (!fs.existsSync(cwd)) {
    throw new Error(`Repo path does not exist: ${cwd}`);
  }

  if (!fs.existsSync(path.join(cwd, '.git'))) {
    throw new Error('Codex execution requires a git repository.');
  }
}

export async function runPreset(preset, cwd) {
  const selected = PRESETS[preset];
  if (!selected) {
    throw new Error(`Unknown preset: ${preset}`);
  }

  ensureRepoReady(cwd, preset);
  const executionCwd = resolvePresetCwd(cwd, preset);

  const { command, args } = selected;
  const startedAt = new Date().toISOString();

  try {
    const result = await execa(command, args, {
      cwd: executionCwd,
      all: true,
      shell: false,
      timeout: 60_000,
      reject: true
    });

    const payload = {
      preset,
      cwd: executionCwd,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: true,
      output: result.all || ''
    };

    appendRun(payload);
    return payload;
  } catch (error) {
    const payload = {
      preset,
      cwd: executionCwd,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      output: normalizeErrorOutput(error)
    };

    appendRun(payload);
    return payload;
  }
}

export async function runCodex(prompt, cwd) {
  ensureCodexRepo(cwd);

  const startedAt = new Date().toISOString();

  try {
    const result = await execa('codex', ['exec', prompt], {
      cwd,
      all: true,
      shell: false,
      timeout: 15 * 60_000,
      reject: true
    });

    const payload = {
      preset: 'codex',
      cwd,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: true,
      output: result.all || ''
    };

    appendRun(payload);
    return payload;
  } catch (error) {
    const payload = {
      preset: 'codex',
      cwd,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      output: normalizeErrorOutput(error)
    };

    appendRun(payload);
    return payload;
  }
}

export async function runCodexPrompt(prompt, cwd, options = {}) {
  ensureCodexRepo(cwd);

  const { onAgentMessage, onParseError } = options;
  const startedAt = new Date().toISOString();
  const messages = [];
  const errors = [];
  const parseErrors = [];
  let stdoutBuffer = '';
  let stderr = '';
  let sawTurnCompleted = false;

  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', '--json', '--sandbox', 'danger-full-access', prompt], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    function handleLine(line) {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      let event;
      try {
        event = JSON.parse(trimmed);
      } catch (error) {
        parseErrors.push(trimmed);
        if (onParseError) {
          onParseError(error, trimmed);
        }
        return;
      }

      if (event.type === 'turn.completed') {
        sawTurnCompleted = true;
        return;
      }

      if (event.type !== 'item.completed' || event.item?.type !== 'agent_message') {
        return;
      }

      const text = event.item?.text;
      if (!text) {
        return;
      }

      messages.push(text);
      if (onAgentMessage) {
        onAgentMessage(text);
      }
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      errors.push(normalizeErrorOutput(error));
    });

    child.on('close', (code, signal) => {
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer);
      }

      const success = code === 0 && sawTurnCompleted && errors.length === 0;
      const output = [
        ...messages,
        stderr.trim(),
        ...errors
      ].filter(Boolean).join('\n');

      const payload = {
        preset: 'prompt',
        cwd,
        startedAt,
        finishedAt: new Date().toISOString(),
        success,
        exitCode: code,
        signal,
        turnCompleted: sawTurnCompleted,
        parseErrorCount: parseErrors.length,
        messages,
        stderr: stderr.trim(),
        errors,
        output
      };

      appendRun(payload);
      resolve(payload);
    });
  });
}

export async function runGitCommit(message, cwd) {
  if (!fs.existsSync(cwd)) {
    throw new Error(`Repo path does not exist: ${cwd}`);
  }

  if (!fs.existsSync(path.join(cwd, '.git'))) {
    throw new Error('Commit requires a git repository.');
  }

  const startedAt = new Date().toISOString();

  try {
    await execa('git', ['add', '-A'], {
      cwd,
      all: true,
      shell: false,
      reject: true
    });

    let hasStagedChanges = false;

    try {
      await execa('git', ['diff', '--cached', '--quiet'], {
        cwd,
        all: true,
        shell: false,
        reject: true
      });
      hasStagedChanges = false;
    } catch (diffError) {
      if (diffError.exitCode === 1) {
        hasStagedChanges = true;
      } else {
        throw diffError;
      }
    }

    if (!hasStagedChanges) {
      const payload = {
        preset: 'commit',
        cwd,
        startedAt,
        finishedAt: new Date().toISOString(),
        success: false,
        output: 'No staged changes to commit.'
      };

      appendRun(payload);
      return payload;
    }

    const result = await execa('git', ['commit', '-m', message], {
      cwd,
      all: true,
      shell: false,
      reject: true
    });

    const payload = {
      preset: 'commit',
      cwd,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: true,
      output: result.all || ''
    };

    appendRun(payload);
    return payload;
  } catch (error) {
    const payload = {
      preset: 'commit',
      cwd,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      output: normalizeErrorOutput(error)
    };

    appendRun(payload);
    return payload;
  }
}
