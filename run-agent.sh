#!/bin/bash
# Usage: ./run-agent.sh bob [max_loops] [llm]
# llm: glm (default), claude, sonnet, haiku, opus, gemini
unset CLAUDECODE

# Load .env
SCRIPT_DIR_EARLY="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR_EARLY/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR_EARLY/.env" | xargs)
fi

AGENT_NAME="${1:-bob}"
MAX_LOOPS="${2:-0}"
LLM="${3:-glm}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$SCRIPT_DIR/agents/$AGENT_NAME"
PAUSE=10

# GLM config
GLM_CONFIG="$HOME/.glm/config.json"
GLM_TOKEN=""
GLM_MODEL="glm-4.7"
if [ "$LLM" = "glm" ]; then
  if [ -f "$GLM_CONFIG" ]; then
    GLM_TOKEN=$(python3 -c "import json; print(json.load(open('$GLM_CONFIG'))['anthropic_auth_token'])" 2>/dev/null)
    GLM_MODEL=$(python3 -c "import json; print(json.load(open('$GLM_CONFIG')).get('default_model','glm-4.7'))" 2>/dev/null)
  else
    echo "ERROR: GLM config not found at $GLM_CONFIG"
    exit 1
  fi
fi

# Claude model for actor phase
CLAUDE_MODEL="sonnet"
[ "$LLM" = "haiku" ] && CLAUDE_MODEL="haiku"
[ "$LLM" = "opus"  ] && CLAUDE_MODEL="opus"

ACTOR_TOOLS="Read,Write,Bash(sleep:*),Bash(cat:*),Bash(ls:*),Bash(jq:*),Bash(grep:*),Bash(cp:*),Bash(wc:*),Bash(node:*),Bash(python3:*),WebSearch,WebFetch"

# ── Helper: call LLM as a sub-agent (memory update)
# Uses haiku for Claude backends, same model for GLM
# Args: prompt_file allowed_tools max_turns
call_subagent() {
  local prompt_file="$1"
  local allowed_tools="${2:-Write}"
  local max_turns="${3:-4}"
  local timeout_sec=90  # kill subagent if it hangs

  if [ "$LLM" = "glm" ]; then
    timeout "$timeout_sec" \
    env ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic" \
        ANTHROPIC_AUTH_TOKEN="$GLM_TOKEN" \
    claude -p "$(cat "$prompt_file")" \
      --model "$GLM_MODEL" \
      --allowedTools "$allowed_tools" \
      --dangerously-skip-permissions \
      --max-turns "$max_turns" \
      --output-format text \
      2>&1 | tail -1
  elif [ "$LLM" = "gemini" ]; then
    timeout "$timeout_sec" \
    gemini -p "$(cat "$prompt_file")" \
      --model gemini-3-flash-preview \
      --yolo \
      --output-format text \
      2>&1 | tail -1
  else
    timeout "$timeout_sec" \
    claude -p "$(cat "$prompt_file")" \
      --model haiku \
      --allowedTools "$allowed_tools" \
      --permission-mode acceptEdits \
      --max-turns "$max_turns" \
      --output-format text \
      2>&1 | tail -1
  fi
}

# ── Helper: list personal tools for prompts
list_personal_tools() {
  if [ -d "$AGENT_DIR/tools" ] && ls "$AGENT_DIR/tools"/*.js >/dev/null 2>&1; then
    for tool_file in "$AGENT_DIR/tools"/*.js; do
      local name desc
      name=$(basename "$tool_file" .js)
      desc=$(head -5 "$tool_file" | grep -m1 '^\s*//' | sed 's|^\s*// *||')
      [ -n "$desc" ] && echo "- **$name**: $desc" || echo "- **$name**"
    done
  fi
}

# ── Generate tool catalog (uses .meta from shared tools)
TOOL_CATALOG=""
generate_tool_catalog() {
  TOOL_CATALOG=$(node "$SCRIPT_DIR/shared/tool-catalog.js" 2>/dev/null)
  if [ -z "$TOOL_CATALOG" ]; then
    TOOL_CATALOG="(tool catalog generation failed)"
  fi
}

# ── Phase A: ACTOR prompt (single prompt with inline state)
build_actor_prompt() {
  local file="$AGENT_DIR/.prompt.md"
  {
    cat "$SCRIPT_DIR/system-prompt.md"
    echo ""

    # Role
    echo "## Your role"
    [ -f "$AGENT_DIR/personality.md" ] && cat "$AGENT_DIR/personality.md" || echo "(no personality)"
    echo ""

    # Current state (inline — no separate observer)
    echo "## Current state"
    echo ""
    echo "### status.json"
    [ -f "$AGENT_DIR/status.json" ] && cat "$AGENT_DIR/status.json" || echo "(none)"
    echo ""
    echo "### Last action result (outbox.json)"
    [ -f "$AGENT_DIR/outbox.json" ] && cat "$AGENT_DIR/outbox.json" || echo "(none)"
    echo ""
    echo "### Recent events"
    ([ -f "$AGENT_DIR/events.json" ] && [ -s "$AGENT_DIR/events.json" ] && cat "$AGENT_DIR/events.json") || echo "[]"
    echo ""
    echo "### Chat"
    ([ -f "$AGENT_DIR/chat.json" ] && [ -s "$AGENT_DIR/chat.json" ] && cat "$AGENT_DIR/chat.json") || echo "[]"
    echo ""

    # Tool catalog (generated from .meta)
    echo "$TOOL_CATALOG"
    echo ""

    if [ -d "$AGENT_DIR/tools" ] && ls "$AGENT_DIR/tools"/*.js >/dev/null 2>&1; then
      echo "## Your personal tools"
      list_personal_tools
      echo ""
    fi

    # Memory
    echo "## Your memory"
    [ -f "$AGENT_DIR/MEMORY.md" ] && cat "$AGENT_DIR/MEMORY.md" || echo "(empty)"
    echo ""

    echo "## Paths"
    echo "- Actions: $AGENT_DIR/inbox.js"
    echo "- Results: $AGENT_DIR/outbox.json"
    echo "- Memory:  $AGENT_DIR/MEMORY.md"
    echo "- New tools: $AGENT_DIR/tools/<name>.js"
  } > "$file"
  echo "$file"
}

# ── Phase B: MEMORY prompt
build_memory_prompt() {
  local file="$AGENT_DIR/.memory-prompt.txt"
  {
    echo "Update the MEMORY.md for Minecraft bot '$AGENT_NAME' based on this cycle."
    echo ""
    echo "## Cycle log"
    cat "$AGENT_DIR/last-run.log" 2>/dev/null
    echo ""
    echo "## Final state"
    cat "$AGENT_DIR/status.json" 2>/dev/null
    echo ""
    echo "## Last result"
    cat "$AGENT_DIR/outbox.json" 2>/dev/null
    echo ""
    echo "## Current memory"
    cat "$AGENT_DIR/MEMORY.md" 2>/dev/null
    echo ""
    echo "Write updated memory to: $AGENT_DIR/MEMORY.md"
    echo "Include: position, inventory, base location (if known), lessons learned, plan for next cycle."
    echo "Be concise. Max 100 lines."
  } > "$file"
  echo "$file"
}

# ── Start bot process with auto-restart
BOT_PID=""
start_bot() {
  if [ -n "$BOT_PID" ] && kill -0 "$BOT_PID" 2>/dev/null; then
    local state
    state=$(python3 -c "import json; print(json.load(open('$AGENT_DIR/status.json')).get('state',''))" 2>/dev/null)
    if [ "$state" != "disconnected" ] && [ "$state" != "error" ]; then
      return
    fi
    echo ">>> Bot state is '$state', restarting..."
    kill "$BOT_PID" 2>/dev/null
    wait "$BOT_PID" 2>/dev/null
  fi
  echo ">>> Starting bot..."
  node "$SCRIPT_DIR/bot.js" "$AGENT_NAME" &
  BOT_PID=$!
  sleep 5
  echo ">>> Bot started (PID: $BOT_PID)"
}
trap 'kill $BOT_PID 2>/dev/null' EXIT

echo "=== Agent $AGENT_NAME starting (LLM: $LLM) ==="
echo "Agent dir: $AGENT_DIR"

# Generate tool catalog once at startup
generate_tool_catalog

loop=0
while true; do
  loop=$((loop + 1))
  echo ""
  echo "━━━ Cycle $loop ($(date '+%H:%M:%S')) ━━━"

  start_bot

  # ── Phase A: Actor (main LLM — reads state, plans, writes JS)
  echo "--- [1/2] Actor ---"
  ACTOR_PROMPT=$(build_actor_prompt)

  if [ "$LLM" = "gemini" ]; then
    gemini -p "$(cat "$ACTOR_PROMPT")" \
      --model gemini-3-pro-preview \
      --yolo \
      --output-format stream-json \
      2>&1
  elif [ "$LLM" = "glm" ]; then
    ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic" \
    ANTHROPIC_AUTH_TOKEN="$GLM_TOKEN" \
    claude -p "$(cat "$ACTOR_PROMPT")" \
      --model "$GLM_MODEL" \
      --allowedTools "$ACTOR_TOOLS" \
      --dangerously-skip-permissions \
      --max-turns 12 \
      --output-format stream-json \
      2>&1
  else
    claude -p "$(cat "$ACTOR_PROMPT")" \
      --model "$CLAUDE_MODEL" \
      --allowedTools "$ACTOR_TOOLS" \
      --dangerously-skip-permissions \
      --max-turns 12 \
      --output-format stream-json \
      2>&1
  fi | while IFS= read -r line; do
    echo "$line" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except: sys.exit()
t = d.get('type','')
if t == 'assistant':
    for block in d.get('message',{}).get('content',[]):
        if block.get('type') == 'text' and block.get('text','').strip():
            print('[THINK]', block['text'][:200])
        elif block.get('type') == 'tool_use':
            name = block.get('name','')
            inp = block.get('input',{})
            if name in ('Write','WriteFile'): print(f'[WRITE] {inp.get(\"file_path\",\"\")}')
            elif name in ('Bash','Shell'): print(f'[BASH] {inp.get(\"command\",\"\")[:120]}')
            elif name in ('Read','ReadFile'): print(f'[READ] {inp.get(\"file_path\",\"\")}')
elif t == 'tool_result' and d.get('status') == 'error':
    print(f'[ERROR] {d.get(\"output\",\"\")[:120]}')
" 2>/dev/null
  done | tee "$AGENT_DIR/last-run.log"

  # ── Phase B: Memory (cheap LLM — updates MEMORY.md)
  echo "--- [2/2] Memory ---"
  MEMORY_PROMPT=$(build_memory_prompt)
  call_subagent "$MEMORY_PROMPT" "Write" 4

  # Cleanup
  echo "[]" > "$AGENT_DIR/chat.json"
  echo "[]" > "$AGENT_DIR/events.json"

  echo "--- Cycle $loop done, sleeping ${PAUSE}s ---"

  if [ "$MAX_LOOPS" -gt 0 ] && [ "$loop" -ge "$MAX_LOOPS" ]; then
    echo "=== Max loops reached, stopping ==="
    break
  fi

  sleep "$PAUSE"
done
