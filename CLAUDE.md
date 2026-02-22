# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Autonomous AI agents that survive in Minecraft. Each agent is an LLM (Claude, Gemini, etc.) that controls a Mineflayer bot via JavaScript code. The LLM writes JS to `inbox.js`, the bot executes it, and results appear in `outbox.json`.

## Commands

```bash
# Install dependencies
npm install

# Run an agent (starts bot + LLM loop)
./run-agent.sh bob              # default LLM (glm)
./run-agent.sh bob 0 glm        # GLM via BigModel
./run-agent.sh bob 0 claude      # Claude via Anthropic
./run-agent.sh bob 0 gemini      # Gemini via Google
./run-agent.sh bob 10            # limit to 10 cycles

# Run just the bot process (no LLM loop)
node bot.js bob

# Run multiple agents in parallel
./run-agent.sh bob &
./run-agent.sh alice &
```

## Architecture

The system has two processes per agent:

1. **`bot.js`** — Persistent Node.js process running a Mineflayer bot. Polls `agents/<name>/inbox.js` every 500ms, `eval()`s the code with `bot`, `mcData`, `Goals`, `Movements`, and `tools` in scope, writes results to `outbox.json`. Has a 60-second timeout per action. Also writes `status.json` (health/food/position) and logs events (chat, damage, death) to `events.json` and `chat.json`.

2. **`run-agent.sh`** — Bash loop that assembles a prompt from `system-prompt.md` + `personality.md` + `skills/*.md` + `MEMORY.md` + current state files, then calls the selected LLM (glm/claude/gemini) with that prompt. After each cycle, a secondary LLM call updates the agent's `MEMORY.md`. The loop auto-restarts the bot if it crashes and wakes early on urgent events (chat, damage).

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

## Available Agents

All agents are generic survival players with no assigned role. They decide their own strategy.

| Agent | Default LLM |
|-------|-------------|
| alice | Sonnet |
| bob | Sonnet |
| charlie | GLM |
| dave | Sonnet |
| eve | GLM |
| frank | GLM |
| grace | GLM |
| hank | GLM |
| oscar | Opus |

**Admin**: `plus200` (human player) has authority over all agents.

## LLM Options

```bash
./run-agent.sh <name> 0 glm      # GLM 4.7 via BigModel (default, cheapest)
./run-agent.sh <name> 0 sonnet   # Claude Sonnet 4.6
./run-agent.sh <name> 0 claude   # Claude Sonnet 4.6 (alias)
./run-agent.sh <name> 0 opus     # Claude Opus 4.6
./run-agent.sh <name> 0 haiku    # Claude Haiku 4.5
./run-agent.sh <name> 0 gemini   # Gemini
```

## Managing Agents

```bash
# Start multiple agents
./run-agent.sh charlie 0 glm &
./run-agent.sh grace 0 glm &

# Stop all agents and bots
pkill -f "run-agent.sh"; pkill -f "node bot.js"

# Monitor logs with tmux
tmux new-session -d -s mc "tail -f agents/charlie/last-run.log" && \
  tmux split-window -t mc "tail -f agents/grace/last-run.log" && \
  tmux select-layout -t mc tiled
tmux attach -t mc

# Quick status check
python3 -c "
import json
for a in ['alice','bob','charlie','dave','eve','frank','grace','hank']:
    try:
        d=json.load(open(f'agents/{a}/outbox.json'))
        pos=d.get('position',{})
        print(f'{a}: HP:{d[\"health\"]} Pos:({pos.get(\"x\",0):.0f},{pos.get(\"y\",0):.0f},{pos.get(\"z\",0):.0f})')
    except: print(f'{a}: offline')
"
```

## Key Design Decisions

- **Auto-defense reflex** in `bot.js`: instant fight-or-flight on `entityHurt` — does not wait for LLM. Fights if HP>6 and has weapon, flees otherwise. Only triggers on non-player attackers.
- **Re-entrancy guard**: `executing` flag prevents concurrent eval() of two inbox.js scripts.
- **Atomic inbox consume**: `renameSync(INBOX, LAST_ACTION)` before reading — avoids TOCTOU race.
- **tools/ hot-reload**: `fs.watch` on tools dir, auto-created at startup if missing.
- **Night rule** in system-prompt: agents return to base before timeOfDay ~11500, or bury themselves 3 blocks deep if too far.
- **No animal killing**: absolute rule in system-prompt. Only plus200 may hunt.
- **tools/ directory**: agents create reusable JS modules, auto-injected with bot as first arg.

## Prompt Files

- `system-prompt.md` — shared rules for all agents (survival, chain of command, night rule, no animal killing)
- `agents/<name>/personality.md` — role-specific instructions with workflows and guides
- `agents/<name>/MEMORY.md` — persistent per-cycle memory updated by a secondary LLM call
- `skills/*.md` — Mineflayer API reference injected into every prompt
