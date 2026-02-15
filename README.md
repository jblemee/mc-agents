# MC Agents

Autonomous AI agents that survive in Minecraft. Each agent is an LLM (Claude, Gemini...) that controls a Mineflayer bot via JavaScript code.

## Architecture

```
┌─────────────┐   writes inbox.js   ┌──────────────────┐
│  LLM (cron)  │ ─────────────────► │ Mineflayer Bot    │
│  Claude/etc  │ ◄───────────────── │ (Node.js)         │
└──────┬───────┘   reads outbox.json └────────┬─────────┘
       │                                      │
       ▼                                      ▼
   MEMORY.md                          Minecraft Server
   skills/*.md
   tools/*.js
```

1. A **Mineflayer bot** stays connected to the Minecraft server (persistent Node.js process)
2. A **loop script** relaunches an LLM at regular intervals
3. The LLM reads its **skills** (how to use mineflayer), its **memory** (what it did before), its **state** (health, hunger, position) and its **available tools**
4. It writes JS in `inbox.js`, the bot executes it, and the result arrives in `outbox.json`
5. If the script worked, the agent saves it as a **reusable tool** in `tools/`
6. Before finishing, the LLM updates its `MEMORY.md`

## Reusable tools

Each agent builds its own **toolbox** of tested, reusable scripts:

- When a script works, the agent saves it in `agents/<name>/tools/` as a JS module
- Tools are **auto-loaded** at bot startup and **hot-reloaded** when a file changes
- The agent can call its tools from `inbox.js`: `await tools.mine({ block: 'oak_log' })`
- The `bot` is automatically injected as the first argument

Tool format:
```js
// Mine N blocks of a given type
module.exports = async function(bot, { block, count }) {
  const mcData = require('minecraft-data')(bot.version)
  // ...
  return 'result'
}
```

The last executed script is kept in `last-action.js` for easier debugging.

## Prerequisites

- Node.js >= 18
- A Minecraft server (vanilla, Paper, Fabric...)
- An LLM CLI: [Claude Code](https://claude.com/claude-code), Gemini CLI, or other
- A Microsoft/Minecraft account (if the server has `online-mode=true`)

## Installation

```bash
git clone https://github.com/jblemee/mc-agents.git
cd mc-agents
npm install
```

## Configuration

Copy the environment file and edit it:

```bash
cp .env.example .env
```

```env
MC_HOST=192.168.1.39    # Minecraft server IP
MC_PORT=25565            # Server port
MC_VERSION=1.21.11       # Server version
```

> **How to find the version?** Run `node -e "const mc = require('minecraft-protocol'); mc.ping({host:'YOUR_IP'}, (e,r) => console.log(r?.version))"`.

## Running an agent

```bash
./run-agent.sh bob        # starts the bot + LLM loop
./run-agent.sh bob 10     # limits to 10 cycles
```

The bot connects to the server, and the LLM begins its cycles: observe → decide → act → save as tool → memorize.

To run multiple agents in parallel:
```bash
./run-agent.sh bob &
./run-agent.sh alice &
./run-agent.sh charlie &
```

## Authentication

### Offline server (`online-mode=false`)

In `config.json`, only the `username` is needed:

```json
{
  "username": "Bob"
}
```

### Online server (Microsoft account)

Add the `microsoft` field with the account email:

```json
{
  "username": "Bob",
  "microsoft": "bob@outlook.com"
}
```

On first launch, the bot displays a code to enter at [microsoft.com/link](https://microsoft.com/link):

```
========================================
  MICROSOFT LOGIN REQUIRED
========================================
  1. Open: https://www.microsoft.com/link
  2. Enter: ABC123XYZ
========================================
```

Tokens are then cached in `.auth-cache/` — no need to re-login each time.

> Each agent needs its own Microsoft account (= its own Minecraft license).

## Creating a new agent

```bash
mkdir -p agents/alice/tools
```

Create `agents/alice/config.json`:
```json
{
  "username": "Alice",
  "microsoft": "alice@outlook.com"
}
```

Create `agents/alice/personality.md`:
```markdown
Your name is Alice. You are a fearless explorer.
You love discovering new biomes and mapping the world.
```

Create `agents/alice/MEMORY.md`:
```markdown
# Current situation
First session. I just spawned.

# To do
1. Explore the surroundings
```

Launch:
```bash
./run-agent.sh alice
```

## Using a different LLM

The `run-agent.sh` script uses `claude` by default. To change it, modify the command in the script:

```bash
# Claude Code
claude -p "$PROMPT" --allowedTools "Read,Write,Bash" --max-turns 15

# Gemini CLI (adapt to the CLI used)
gemini -p "$PROMPT"

# Ollama (via a CLI wrapper)
ollama run llama3 "$PROMPT"
```

Each agent can use a different LLM — just duplicate `run-agent.sh` with the right command.

## Project structure

```
mc-agents/
├── .env                    # Server config (MC_HOST, MC_PORT, MC_VERSION)
├── .env.example
├── bot.js                  # Persistent Mineflayer bot (loads tools/, auto watch)
├── run-agent.sh            # LLM loop (injects available tools into the prompt)
├── system-prompt.md        # Base prompt (shared by all agents)
├── skills/                 # How to use mineflayer (markdown)
│   ├── 01-basics.md
│   ├── 02-movement.md
│   ├── 03-mining.md
│   ├── 04-crafting.md
│   ├── 05-survival.md
│   └── 06-chat.md
└── agents/
    └── bob/
        ├── config.json     # username + microsoft (optional)
        ├── personality.md  # Agent personality
        ├── MEMORY.md       # Persistent memory between cycles
        ├── tools/          # Reusable JS scripts (created by the agent)
        │   ├── mine.js
        │   ├── scan.js
        │   └── ...
        ├── inbox.js        # JS code sent to the bot (created by the LLM)
        ├── last-action.js  # Last executed script (debug)
        ├── outbox.json     # Execution result (created by the bot)
        └── status.json     # Real-time state (created by the bot)
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` | The Minecraft server is not running or wrong IP/port in `.env` |
| `unverified_username` | Add `"microsoft": "email@outlook.com"` in the agent's `config.json`, or set `online-mode=false` on the server |
| `Cannot read properties of null (reading 'version')` | The version in `.env` is not supported — update mineflayer (`npm install mineflayer@latest`) |
| The bot does nothing | Check that `inbox.js` is written in the correct agent folder |
| `duplicate_login` | Another bot is already using this username — kill the existing process |
