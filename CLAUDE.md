# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Autonomous AI agents that survive in Minecraft. Each agent is an LLM (Claude, Gemini, etc.) that controls a Mineflayer bot via JavaScript code. The LLM writes JS to `inbox.js`, the bot executes it, and results appear in `outbox.json`.

## Commands

```bash
# Install dependencies
npm install

# Run an agent (starts bot + LLM loop)
./run-agent.sh bob          # infinite cycles
./run-agent.sh bob 10       # limit to 10 cycles

# Run just the bot process (no LLM loop)
node bot.js bob

# Run multiple agents in parallel
./run-agent.sh bob &
./run-agent.sh alice &
```

## Architecture

The system has two processes per agent:

1. **`bot.js`** — Persistent Node.js process running a Mineflayer bot. Polls `agents/<name>/inbox.js` every 500ms, `eval()`s the code with `bot`, `mcData`, `Goals`, `Movements`, and `tools` in scope, writes results to `outbox.json`. Has a 60-second timeout per action. Also writes `status.json` (health/food/position) and logs events (chat, damage, death) to `events.json` and `chat.json`.

2. **`run-agent.sh`** — Bash loop that assembles a prompt from `system-prompt.md` + `personality.md` + `skills/*.md` + `MEMORY.md` + current state files, then calls `claude -p` with that prompt. After each cycle, a secondary haiku call updates the agent's `MEMORY.md`. The loop auto-restarts the bot if it crashes and wakes early on urgent events (chat, damage).

### Agent file-based communication protocol
- `inbox.js` — LLM writes JS here; bot consumes it (renamed to `last-action.js`)
- `outbox.json` — Bot writes execution results (ok/error, position, health, inventory, nearby entities)
- `status.json` — Bot writes real-time state
- `chat.json` / `events.json` — Bot appends chat messages and events (kept to last 20)
- `urgent` — Bot creates this file on critical events; loop script wakes early when it exists
- `MEMORY.md` — Agent's persistent memory across cycles

### Tools system
Agents create reusable JS modules in `agents/<name>/tools/`. Bot hot-reloads them via `fs.watch`. Tools export `async function(bot, { params })` and are called in inbox.js as `await tools.name({ params })` (bot is auto-injected).

## Creating a New Agent

```bash
mkdir -p agents/alice/tools
```
Then create `config.json` (username + optional microsoft email), `personality.md`, and `MEMORY.md` in the agent directory.

## Configuration

Server connection is configured via `.env` (MC_HOST, MC_PORT, MC_VERSION). Microsoft auth tokens are cached in `.auth-cache/`.

## Key Dependencies

- `mineflayer` — Minecraft bot framework
- `mineflayer-pathfinder` — A* pathfinding (Goals, Movements)
- `mineflayer-collectblock` — Block collection helper
- `prismarine-auth` — Microsoft authentication
- `minecraft-data` — Block/item/recipe data

## Skills Directory

`skills/*.md` files are Mineflayer API reference docs injected into the agent prompt. They cover basics, movement, mining, crafting, survival, and chat. Edit these to teach agents new capabilities.
