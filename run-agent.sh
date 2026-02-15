#!/bin/bash
# Usage: ./run-agent.sh bob [max_loops] [llm]
# llm: glm (default), claude, gemini
unset CLAUDECODE

# Load .env (for GEMINI_API_KEY, etc.)
SCRIPT_DIR_EARLY="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR_EARLY/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR_EARLY/.env" | xargs)
fi

AGENT_NAME="${1:-bob}"
MAX_LOOPS="${2:-0}"  # 0 = infinite
LLM="${3:-glm}"      # glm, claude, or gemini
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$SCRIPT_DIR/agents/$AGENT_NAME"
PAUSE=10  # seconds between cycles

# GLM config
GLM_CONFIG="$HOME/.glm/config.json"
if [ "$LLM" = "glm" ]; then
  if [ -f "$GLM_CONFIG" ]; then
    GLM_TOKEN=$(python3 -c "import json; print(json.load(open('$GLM_CONFIG'))['anthropic_auth_token'])" 2>/dev/null)
    GLM_MODEL=$(python3 -c "import json; print(json.load(open('$GLM_CONFIG')).get('default_model','glm-4.7'))" 2>/dev/null)
  else
    echo "ERROR: GLM config not found at $GLM_CONFIG. Run 'glm token set' first."
    exit 1
  fi
fi

# Build the prompt and write to a temp file
build_prompt() {
  local file="$AGENT_DIR/.prompt.md"

  {
    cat "$SCRIPT_DIR/system-prompt.md"
    echo ""

    # Agent personality
    if [ -f "$AGENT_DIR/personality.md" ]; then
      echo "## Your personality"
      cat "$AGENT_DIR/personality.md"
      echo ""
    fi

    # Skills
    echo "## Available skills"
    for skill in "$SCRIPT_DIR"/skills/*.md; do
      [ -f "$skill" ] && cat "$skill"
      echo ""
    done

    # Memory
    if [ -f "$AGENT_DIR/MEMORY.md" ]; then
      echo "## Your memory (from previous sessions)"
      cat "$AGENT_DIR/MEMORY.md"
      echo ""
    fi

    # Current status
    if [ -f "$AGENT_DIR/status.json" ]; then
      echo "## Your current state"
      echo '```json'
      cat "$AGENT_DIR/status.json"
      echo '```'
      echo ""
    fi

    # Last action result
    if [ -f "$AGENT_DIR/outbox.json" ]; then
      echo "## Result of your last action"
      echo '```json'
      cat "$AGENT_DIR/outbox.json"
      echo '```'
      echo ""
    fi

    # Events (attacks, chat, etc.)
    if [ -f "$AGENT_DIR/events.json" ] && [ -s "$AGENT_DIR/events.json" ]; then
      echo "## Recent events"
      echo '```json'
      cat "$AGENT_DIR/events.json"
      echo '```'
      echo ""
    fi

    # Chat messages
    if [ -f "$AGENT_DIR/chat.json" ] && [ -s "$AGENT_DIR/chat.json" ]; then
      echo "## Chat messages received"
      echo '```json'
      cat "$AGENT_DIR/chat.json"
      echo '```'
      echo "Reply to messages with bot.chat('your message'). Be social and friendly!"
      echo ""
    fi

    # Available tools
    if [ -d "$AGENT_DIR/tools" ] && ls "$AGENT_DIR/tools"/*.js >/dev/null 2>&1; then
      echo "## Available tools"
      echo "You can call these tools in inbox.js with \`await tools.name({ ...args })\`"
      echo ""
      for tool_file in "$AGENT_DIR/tools"/*.js; do
        tool_name=$(basename "$tool_file" .js)
        # Extract first comment line as description
        tool_desc=$(head -5 "$tool_file" | grep -m1 '^\s*//' | sed 's|^\s*// *||')
        if [ -n "$tool_desc" ]; then
          echo "- **$tool_name** : $tool_desc"
        else
          echo "- **$tool_name**"
        fi
      done
      echo ""
    fi

    # Paths
    echo "## Paths"
    echo "- Write your JS actions in: $AGENT_DIR/inbox.js"
    echo "- Read results from: $AGENT_DIR/outbox.json"
    echo "- Update your memory in: $AGENT_DIR/MEMORY.md"
    echo "- Create reusable tools in: $AGENT_DIR/tools/"

  } > "$file"

  echo "$file"
}

# Start bot process with auto-restart
BOT_PID=""
start_bot() {
  # Check if bot is still alive
  if [ -n "$BOT_PID" ] && kill -0 "$BOT_PID" 2>/dev/null; then
    # Also check status.json isn't disconnected
    local state=$(python3 -c "import json; print(json.load(open('$AGENT_DIR/status.json')).get('state',''))" 2>/dev/null)
    if [ "$state" != "disconnected" ] && [ "$state" != "error" ]; then
      return  # bot is running fine
    fi
    echo ">>> Bot state is '$state', killing and restarting..."
    kill "$BOT_PID" 2>/dev/null
    wait "$BOT_PID" 2>/dev/null
  fi
  echo ">>> Starting bot process..."
  node "$SCRIPT_DIR/bot.js" "$AGENT_NAME" &
  BOT_PID=$!
  sleep 5
  echo ">>> Bot started (PID: $BOT_PID)"
}
# Cleanup on exit
trap 'kill $BOT_PID 2>/dev/null' EXIT

echo "=== Agent $AGENT_NAME starting (LLM: $LLM) ==="
echo "Agent dir: $AGENT_DIR"

loop=0
while true; do
  loop=$((loop + 1))
  echo ""
  echo "--- Cycle $loop ($(date '+%H:%M:%S')) ---"

  start_bot  # ensure bot is running (auto-restart if crashed)
  PROMPT_FILE=$(build_prompt)

  # Launch LLM agent
  if [ "$LLM" = "gemini" ]; then
    gemini -p "$(cat "$PROMPT_FILE")" \
      --model gemini-3-pro-preview \
      --yolo \
      --output-format stream-json \
      2>&1
  elif [ "$LLM" = "glm" ]; then
    ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic" \
    ANTHROPIC_AUTH_TOKEN="$GLM_TOKEN" \
    claude -p "$(cat "$PROMPT_FILE")" \
      --model "$GLM_MODEL" \
      --allowedTools "Read,Write,Bash(sleep:*),Bash(cat:*),Bash(ls:*),Bash(jq:*),WebSearch,WebFetch" \
      --dangerously-skip-permissions \
      --max-turns 20 \
      --output-format stream-json \
      2>&1
  else
    claude -p "$(cat "$PROMPT_FILE")" \
      --model sonnet \
      --allowedTools "Read,Write,Bash(sleep:*),Bash(cat:*),Bash(ls:*),Bash(jq:*),WebSearch,WebFetch" \
      --dangerously-skip-permissions \
      --max-turns 20 \
      --output-format stream-json \
      2>&1
  fi | while IFS= read -r line; do
      echo "$line" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except: sys.exit()
t = d.get('type','')
# Gemini format
if t == 'message' and d.get('role') == 'assistant':
    txt = d.get('content','')
    if txt and not d.get('delta'): print('[THINK]', txt[:200])
    elif txt and d.get('delta'): print(txt, end='')
elif t == 'tool_use':
    name = d.get('tool_name','')
    params = d.get('parameters',{})
    if name in ('write_file','Write','WriteFile'):
        print(f'[WRITE] {params.get(\"file_path\",\"\")}')
    elif name in ('run_shell_command','Bash','Shell'):
        print(f'[BASH] {params.get(\"command\",\"\")[:120]}')
    elif name in ('read_file','Read','ReadFile'):
        print(f'[READ] {params.get(\"file_path\",\"\")}')
    else:
        print(f'[TOOL] {name}')
elif t == 'tool_result' and d.get('status') == 'error':
    print(f'[ERROR] {d.get(\"output\",\"\")[:120]}')
# Claude format
elif t == 'assistant':
    for block in d.get('message',{}).get('content',[]):
        if block.get('type') == 'text' and block.get('text','').strip():
            print('[THINK]', block['text'][:200])
        elif block.get('type') == 'tool_use':
            name = block.get('name','')
            inp = block.get('input',{})
            if name in ('Write','WriteFile'): print(f'[WRITE] {inp.get(\"file_path\",\"\")}')
            elif name in ('Bash','Shell'): print(f'[BASH] {inp.get(\"command\",\"\")[:120]}')
            elif name in ('Read','ReadFile'): print(f'[READ] {inp.get(\"file_path\",\"\")}')
" 2>/dev/null
    done | tee "$AGENT_DIR/last-run.log"

  # Force memory update: sub-agent analyzes the run log and updates memory
  echo "--- Updating memory ---"
  MEMORY_FILE="$AGENT_DIR/.memory-prompt.txt"
  {
    echo "Analyze this Minecraft agent log and update its memory."
    echo ""
    echo "=== CYCLE LOG ==="
    cat "$AGENT_DIR/last-run.log" 2>/dev/null
    echo ""
    echo "=== CURRENT STATE ==="
    cat "$AGENT_DIR/status.json" 2>/dev/null
    echo ""
    echo "=== LAST RESULT ==="
    cat "$AGENT_DIR/outbox.json" 2>/dev/null
    echo ""
    echo "=== CURRENT MEMORY ==="
    cat "$AGENT_DIR/MEMORY.md" 2>/dev/null
    echo ""
    echo "=== INSTRUCTIONS ==="
    echo "Write an updated MEMORY.md to the file: $AGENT_DIR/MEMORY.md"
    echo "Include: position, inventory, health, lessons learned (errors, protected zones, etc.), plan for next steps."
    echo "Be concise but thorough. The agent has ONLY this file as memory between sessions."
  } > "$MEMORY_FILE"

  if [ "$LLM" = "gemini" ]; then
    gemini -p "$(cat "$MEMORY_FILE")" \
      --model gemini-3-flash-preview \
      --yolo \
      --output-format text \
      2>&1 | tail -1
  elif [ "$LLM" = "glm" ]; then
    ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic" \
    ANTHROPIC_AUTH_TOKEN="$GLM_TOKEN" \
    claude -p "$(cat "$MEMORY_FILE")" \
      --model "$GLM_MODEL" \
      --allowedTools "Write" \
      --dangerously-skip-permissions \
      --max-turns 4 \
      --output-format text \
      2>&1 | tail -1
  else
    claude -p "$(cat "$MEMORY_FILE")" \
      --model haiku \
      --allowedTools "Write" \
      --permission-mode acceptEdits \
      --max-turns 4 \
      --output-format text \
      2>&1 | tail -1
  fi

  # Clear urgent flag and old chat/events after each cycle
  rm -f "$AGENT_DIR/urgent"
  echo "[]" > "$AGENT_DIR/chat.json"
  echo "[]" > "$AGENT_DIR/events.json"

  echo "--- Cycle $loop done, sleeping ${PAUSE}s (or until urgent event) ---"

  if [ "$MAX_LOOPS" -gt 0 ] && [ "$loop" -ge "$MAX_LOOPS" ]; then
    echo "=== Max loops reached, stopping ==="
    break
  fi

  # Sleep but wake up early if urgent event arrives
  for i in $(seq 1 "$PAUSE"); do
    if [ -f "$AGENT_DIR/urgent" ]; then
      echo ">>> URGENT: $(cat "$AGENT_DIR/urgent") — starting cycle now!"
      rm -f "$AGENT_DIR/urgent"
      break
    fi
    sleep 1
  done
done
