# MC Agents

Autonomous AI agents that survive in Minecraft. Each agent is an LLM (Claude, Gemini...) that controls a Mineflayer bot via JavaScript code.

## Architecture: reflexes and strategy

The architecture is inspired by human cognition. A human playing Minecraft doesn't think before eating or fleeing a creeper: these are automatic gestures, System 1 (Kahneman). The prefrontal cortex handles strategy: where to build, what to craft, how to coordinate.

Our agents work the same way:

- **Reflexes (bot.js)**: a persistent Node.js process handles survival without waiting for the LLM. It eats when hunger drops, fights or flees when a mob attacks, digs a shelter as a last resort. This is procedural memory: the body knows how without thinking about it.
- **Strategy (LLM)**: the language model plans, crafts, mines, coordinates. It writes JS that calls shared tools (`tools.mine()`, `tools.craft()`, `tools.smelt()`). This is semantic memory: knowing the tool exists and what it does, without knowing the Mineflayer API details.
- **Memory (MEMORY.md)**: each agent maintains a persistent memory file updated every cycle. This is episodic memory: remembering what happened and deciding what to do next.

Separating what needs thought from what doesn't is what every living organism does. A lizard doesn't need a cortex to flee a predator. An LLM doesn't need 30 seconds of compute to eat bread.

```
┌──────────────────┐  inbox.js   ┌──────────────────┐
│    LLM (loop)    │ ──────────► │  Mineflayer Bot   │
│ Claude/GLM/Gemini│ ◄────────── │   (Node.js)       │
└──────┬───────────┘  outbox.json└──────┬────────────┘
       │                                │ reflexes:
       ▼                                │  auto-eat
   MEMORY.md                            │  auto-fight/flee
   shared/tools/*.js                    │  auto-shelter
                                        ▼
                                  Minecraft Server
```

## Shared tools

Reusable tool modules in `shared/tools/*.js`, loaded by bot.js at startup. Each tool exports `async function(bot, { params })` with a `.meta` property (name, description, params). The tool catalog is auto-generated and injected into the LLM prompt.

```js
// In inbox.js, the LLM writes:
await tools.mine({ block: 'stone', count: 11 })
await tools.craft({ item: 'furnace', count: 1 })
await tools.smelt({ item: 'raw_iron', count: 3 })
```

Personal tools can also live in `agents/<name>/tools/` and are hot-reloaded via `fs.watch`.

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
./run-agent.sh bob              # default LLM (glm)
./run-agent.sh bob 0 glm        # GLM 4.7 via BigModel API
./run-agent.sh bob 0 sonnet     # Claude Sonnet via Anthropic API
./run-agent.sh bob 0 opus low   # Claude Opus with effort level
./run-agent.sh bob 0 gemini     # Gemini via Google CLI
./run-agent.sh bob 10           # limit to 10 cycles
```

The 4th argument (optional) sets the Claude `--effort` level: `low`, `medium`, or `high`.

The bot connects to the server, and the LLM begins its cycles: observe → decide → act → memorize.

To run multiple agents in parallel (tmux recommended):
```bash
tmux new-session -d -s agents './run-agent.sh alice 0 glm' \; \
  split-window -h './run-agent.sh bob 0 glm' \; \
  split-window -v './run-agent.sh charlie 0 glm' \; \
  select-pane -t 0 \; \
  split-window -v './run-agent.sh dave 0 glm' \; \
  attach
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

## LLM backends

| Backend | Command | Setup |
|---------|---------|-------|
| GLM-4.7 (default) | `glm` | `glm token set` |
| GLM-5 | `glm5` | `glm token set` |
| Claude Sonnet 4.6 | `sonnet` / `claude` | Anthropic API key |
| Claude Opus 4.6 | `opus` | Anthropic API key |
| Claude Haiku 4.5 | `haiku` | Anthropic API key |
| Gemini | `gemini` | `GEMINI_API_KEY` in `.env` or Google auth |

Each agent can use a different LLM. Sonnet offers the best cost/efficiency ratio. Opus is the most capable but 30x more expensive.

## Project structure

```
mc-agents/
├── .env                    # Server config (MC_HOST, MC_PORT, MC_VERSION)
├── bot.js                  # Persistent bot (reflexes, eval inbox.js, tools loader)
├── run-agent.sh            # LLM loop (prompt assembly, API call, memory update)
├── system-prompt.md        # Base prompt (shared rules for all agents)
├── shared/
│   ├── tools/*.js          # Shared tools (mine, craft, shelter, smelt, scan...)
│   └── tool-catalog.js     # Auto-generates tool docs for the LLM prompt
└── agents/
    └── bob/
        ├── config.json     # Username + microsoft auth (optional)
        ├── personality.md  # Agent personality
        ├── MEMORY.md       # Persistent memory between cycles
        ├── tools/          # Personal tools (hot-reloaded)
        ├── inbox.js        # JS code written by the LLM
        ├── last-action.js  # Last executed script (debug)
        ├── outbox.json     # Execution result
        ├── status.json     # Real-time state (HP, food, position)
        ├── chat.json       # Chat messages (snapshotted each cycle)
        └── events.json     # Events: damage, death... (snapshotted each cycle)
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` | The Minecraft server is not running or wrong IP/port in `.env` |
| `unverified_username` | Add `"microsoft": "email@outlook.com"` in the agent's `config.json`, or set `online-mode=false` on the server |
| `Cannot read properties of null (reading 'version')` | The version in `.env` is not supported — update mineflayer (`npm install mineflayer@latest`) |
| The bot does nothing | Check that `inbox.js` is written in the correct agent folder |
| `duplicate_login` | Another bot is already using this username — kill the existing process |
