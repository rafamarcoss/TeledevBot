# TeleDev Orchestrator V1

Telegram bot that runs on your WSL/Linux environment and lets you control local development workflows from your phone.

## Features in V1

- Telegram access restricted to one chat ID
- Repo selection with `/repo <name>`
- Repo listing with `/repos`
- Safe status check with `/status`
- Allowed command execution with `/run <preset>`
- Polling startup with explicit env validation and error logging
- Prompt logging with `/prompt <text>`
- Reads `AGENTS.md` when available
- Stores logs under `storage/`

## Preset commands

- `git-status`
- `docker-ps`
- `artisan-test`
- `route-list`
- `pwd`
- `ls`

## Setup in WSL

```bash
sudo apt update
sudo apt install -y nodejs npm
cd teledev-orchestrator-v1
cp .env.example .env
cp repos.example.json repos.json
npm install
npm run dev
```

Optional polling env vars:

```bash
TELEGRAM_POLLING_TIMEOUT=30
TELEGRAM_POLLING_INTERVAL=1000
```

## Telegram setup

1. Create a bot with BotFather.
2. Put the token into `.env`.
3. Send one message to your bot from Telegram.
4. Get your chat ID using:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"
   ```
5. Put the chat ID into `.env`.
6. Replace `DEFAULT_REPO` with one of the repo names from `repos.json`, or leave it empty.

## Example commands

```text
/start
/repos
/repo stock-management-live
/status
/run git-status
/run docker-ps
/prompt Implement task 3 following AGENTS.md
/lastlog
```

## Notes

- This V1 uses a command whitelist.
- It does not execute arbitrary shell commands.
- It is designed to be safe enough for a local-first MVP.
- `npm run verify` simulates the Telegram commands locally and checks logs, repo selection, and safe preset execution.
