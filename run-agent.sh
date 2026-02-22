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
PAUSE=5
MAX_ACTIONS=5  # actions per cycle before memory update

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

# Actor only needs Write (inbox.js + tools) and Read (debug/docs)
ACTOR_TOOLS="Read,Write,WebSearch,WebFetch"

# ── Helper: call LLM as a sub-agent (memory update)
call_subagent() {
  local prompt_file="$1"
  local allowed_tools="${2:-Write}"
  local max_turns="${3:-4}"
  local timeout_sec=90

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

# ── Build actor prompt with current state
build_actor_prompt() {
  local file="$AGENT_DIR/.prompt.md"
  {
    cat "$SCRIPT_DIR/system-prompt.md"
    echo ""

    echo "## Your role"
    [ -f "$AGENT_DIR/personality.md" ] && cat "$AGENT_DIR/personality.md" || echo "(no personality)"
    echo ""

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

    echo "$TOOL_CATALOG"
    echo ""

    if [ -d "$AGENT_DIR/tools" ] && ls "$AGENT_DIR/tools"/*.js >/dev/null 2>&1; then
      echo "## Your personal tools"
      list_personal_tools
      echo ""
    fi

    echo "## Your memory"
    [ -f "$AGENT_DIR/MEMORY.md" ] && cat "$AGENT_DIR/MEMORY.md" || echo "(empty)"
    echo ""

    echo "## Action"
    echo "Write your JavaScript action to: $AGENT_DIR/inbox.js"
    echo "The result will be provided in the next prompt. Do NOT use Bash to check results."
    echo "If you have nothing to do, just respond with text (no Write)."
  } > "$file"
  echo "$file"
}

# ── Build memory prompt
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

# ── Call actor LLM (returns after LLM finishes, inbox.js may or may not exist)
call_actor() {
  local prompt_file="$1"
  local timeout_sec=120

  if [ "$LLM" = "gemini" ]; then
    timeout "$timeout_sec" \
    gemini -p "$(cat "$prompt_file")" \
      --model gemini-3-pro-preview \
      --yolo \
      --output-format stream-json \
      2>&1
  elif [ "$LLM" = "glm" ]; then
    timeout "$timeout_sec" \
    env ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic" \
        ANTHROPIC_AUTH_TOKEN="$GLM_TOKEN" \
    claude -p "$(cat "$prompt_file")" \
      --model "$GLM_MODEL" \
      --allowedTools "$ACTOR_TOOLS" \
      --dangerously-skip-permissions \
      --max-turns 4 \
      --output-format stream-json \
      2>&1
  else
    timeout "$timeout_sec" \
    claude -p "$(cat "$prompt_file")" \
      --model "$CLAUDE_MODEL" \
      --allowedTools "$ACTOR_TOOLS" \
      --dangerously-skip-permissions \
      --max-turns 4 \
      --output-format stream-json \
      2>&1
  fi
}

# ── Parse LLM stream-json for logging
parse_llm_output() {
  python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
    except: continue
    t = d.get('type','')
    if t == 'assistant':
        for block in d.get('message',{}).get('content',[]):
            if block.get('type') == 'text' and block.get('text','').strip():
                print('[THINK]', block['text'][:200])
            elif block.get('type') == 'tool_use':
                name = block.get('name','')
                inp = block.get('input',{})
                if name in ('Write','WriteFile'):
                    print(f'[WRITE] {inp.get(\"file_path\",\"\")}')
                elif name in ('Read','ReadFile'):
                    print(f'[READ] {inp.get(\"file_path\",\"\")}')
                elif name in ('WebSearch',):
                    print(f'[SEARCH] {inp.get(\"query\",\"\")[:80]}')
    elif t == 'tool_result' and d.get('status') == 'error':
        print(f'[ERROR] {d.get(\"output\",\"\")[:120]}')
" 2>/dev/null
}

# ── Wait for bot to consume inbox.js and write outbox.json
wait_for_execution() {
  local old_mtime="$1"
  local timeout=135  # slightly more than bot's 120s timeout
  local start=$(date +%s)

  # Wait for inbox.js to be consumed (bot renames it to last-action.js)
  while [ -f "$AGENT_DIR/inbox.js" ]; do
    sleep 1
    if [ $(($(date +%s) - start)) -ge $timeout ]; then
      echo "  [timeout: bot never consumed inbox.js]"
      rm -f "$AGENT_DIR/inbox.js"
      return 1
    fi
  done

  # Wait for outbox.json to be updated (mtime changes)
  while true; do
    local new_mtime
    new_mtime=$(stat -f %m "$AGENT_DIR/outbox.json" 2>/dev/null || echo "0")
    if [ "$new_mtime" != "$old_mtime" ]; then
      sleep 1  # small buffer for file write to complete
      break
    fi
    sleep 1
    if [ $(($(date +%s) - start)) -ge $timeout ]; then
      echo "  [timeout: outbox.json never updated]"
      return 1
    fi
  done
  return 0
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

  # Clear log for this cycle
  : > "$AGENT_DIR/last-run.log"

  # ── Action loop: LLM thinks → writes inbox.js → bot executes → repeat
  for action_num in $(seq 1 $MAX_ACTIONS); do
    echo "--- Action $action_num/$MAX_ACTIONS ---"

    # Record outbox mtime before LLM call
    OUTBOX_MTIME=$(stat -f %m "$AGENT_DIR/outbox.json" 2>/dev/null || echo "0")

    # Build fresh prompt with latest state
    ACTOR_PROMPT=$(build_actor_prompt)

    # Call LLM — it thinks and writes inbox.js (or not)
    call_actor "$ACTOR_PROMPT" | parse_llm_output | tee -a "$AGENT_DIR/last-run.log"

    # Did the LLM write inbox.js?
    if [ ! -f "$AGENT_DIR/inbox.js" ]; then
      echo "  [no action written — ending cycle]"
      break
    fi

    # Wait for bot to execute
    echo "  [waiting for bot...]"
    if wait_for_execution "$OUTBOX_MTIME"; then
      # Show result summary
      python3 -c "
import json
d = json.load(open('$AGENT_DIR/outbox.json'))
ok = d.get('ok', False)
if ok:
    r = str(d.get('result',''))
    print(f'  [OK] {r[:150]}')
else:
    print(f'  [ERROR] {d.get(\"error\",\"?\")[:150]}')
" 2>/dev/null
    fi
  done

  # ── Memory update (cheap LLM)
  echo "--- Memory update ---"
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
