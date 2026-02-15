#!/bin/bash
# Usage: ./run-agent.sh bob [max_loops]
unset CLAUDECODE

AGENT_NAME="${1:-bob}"
MAX_LOOPS="${2:-0}"  # 0 = infinite
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$SCRIPT_DIR/agents/$AGENT_NAME"
PAUSE=10  # seconds between cycles

# Build the prompt and write to a temp file
build_prompt() {
  local file="$AGENT_DIR/.prompt.md"

  {
    cat "$SCRIPT_DIR/system-prompt.md"
    echo ""

    # Agent personality
    if [ -f "$AGENT_DIR/personality.md" ]; then
      echo "## Ta personnalité"
      cat "$AGENT_DIR/personality.md"
      echo ""
    fi

    # Skills
    echo "## Skills disponibles"
    for skill in "$SCRIPT_DIR"/skills/*.md; do
      [ -f "$skill" ] && cat "$skill"
      echo ""
    done

    # Memory
    if [ -f "$AGENT_DIR/MEMORY.md" ]; then
      echo "## Ta mémoire (de tes sessions précédentes)"
      cat "$AGENT_DIR/MEMORY.md"
      echo ""
    fi

    # Current status
    if [ -f "$AGENT_DIR/status.json" ]; then
      echo "## Ton état actuel"
      echo '```json'
      cat "$AGENT_DIR/status.json"
      echo '```'
      echo ""
    fi

    # Last action result
    if [ -f "$AGENT_DIR/outbox.json" ]; then
      echo "## Résultat de ta dernière action"
      echo '```json'
      cat "$AGENT_DIR/outbox.json"
      echo '```'
      echo ""
    fi

    # Events (attacks, chat, etc.)
    if [ -f "$AGENT_DIR/events.json" ] && [ -s "$AGENT_DIR/events.json" ]; then
      echo "## Événements récents"
      echo '```json'
      cat "$AGENT_DIR/events.json"
      echo '```'
      echo ""
    fi

    # Chat messages
    if [ -f "$AGENT_DIR/chat.json" ] && [ -s "$AGENT_DIR/chat.json" ]; then
      echo "## Messages reçus dans le chat"
      echo '```json'
      cat "$AGENT_DIR/chat.json"
      echo '```'
      echo "Réponds aux messages avec bot.chat('ton message'). Sois social et amical !"
      echo ""
    fi

    # Available tools
    if [ -d "$AGENT_DIR/tools" ] && ls "$AGENT_DIR/tools"/*.js >/dev/null 2>&1; then
      echo "## Tools disponibles"
      echo "Tu peux appeler ces tools dans inbox.js avec \`await tools.nom({ ...args })\`"
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
    echo "## Chemins"
    echo "- Écrire tes actions JS dans : $AGENT_DIR/inbox.js"
    echo "- Lire les résultats dans : $AGENT_DIR/outbox.json"
    echo "- Mettre à jour ta mémoire dans : $AGENT_DIR/MEMORY.md"
    echo "- Créer des tools réutilisables dans : $AGENT_DIR/tools/"

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

echo "=== Agent $AGENT_NAME starting ==="
echo "Agent dir: $AGENT_DIR"

loop=0
while true; do
  loop=$((loop + 1))
  echo ""
  echo "--- Cycle $loop ($(date '+%H:%M:%S')) ---"

  start_bot  # ensure bot is running (auto-restart if crashed)
  PROMPT_FILE=$(build_prompt)

  # Launch Claude Code (haiku = rapide et pas cher)
  claude -p "$(cat "$PROMPT_FILE")" \
    --model sonnet \
    --allowedTools "Read,Write,Bash(sleep:*),Bash(cat:*),Bash(ls:*),Bash(jq:*),WebSearch,WebFetch" \
    --dangerously-skip-permissions \
    --max-turns 20 \
    --output-format stream-json \
    2>&1 | while IFS= read -r line; do
      # Extract assistant text and tool uses for logging
      type=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('type',''))" 2>/dev/null)
      if [ "$type" = "assistant" ]; then
        echo "$line" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for block in d.get('message',{}).get('content',[]):
    if block.get('type') == 'text' and block.get('text','').strip():
        print('[THINK]', block['text'])
    elif block.get('type') == 'tool_use':
        name = block.get('name','')
        if name == 'Write':
            inp = block.get('input',{})
            print(f'[WRITE] {inp.get(\"file_path\",\"\")}')
        elif name == 'Bash':
            print(f'[BASH] {block.get(\"input\",{}).get(\"command\",\"\")[:100]}')
        elif name == 'Read':
            print(f'[READ] {block.get(\"input\",{}).get(\"file_path\",\"\")}')
" 2>/dev/null
      fi
    done | tee "$AGENT_DIR/last-run.log"

  # Force memory update: sub-agent analyzes the run log and updates memory
  echo "--- Updating memory ---"
  MEMORY_FILE="$AGENT_DIR/.memory-prompt.txt"
  {
    echo "Analyse ce log d'un agent Minecraft et mets à jour sa mémoire."
    echo ""
    echo "=== LOG DU CYCLE ==="
    cat "$AGENT_DIR/last-run.log" 2>/dev/null
    echo ""
    echo "=== ÉTAT ACTUEL ==="
    cat "$AGENT_DIR/status.json" 2>/dev/null
    echo ""
    echo "=== DERNIER RÉSULTAT ==="
    cat "$AGENT_DIR/outbox.json" 2>/dev/null
    echo ""
    echo "=== MÉMOIRE ACTUELLE ==="
    cat "$AGENT_DIR/MEMORY.md" 2>/dev/null
    echo ""
    echo "=== INSTRUCTION ==="
    echo "Écris un MEMORY.md mis à jour avec l'outil Write dans le fichier : $AGENT_DIR/MEMORY.md"
    echo "Inclus : position, inventaire, santé, leçons apprises (erreurs, zones protégées, etc.), plan pour la suite."
    echo "Sois concis mais complet. L'agent n'a QUE ce fichier comme mémoire entre ses sessions."
  } > "$MEMORY_FILE"

  claude -p "$(cat "$MEMORY_FILE")" \
    --model haiku \
    --allowedTools "Write" \
    --permission-mode acceptEdits \
    --max-turns 4 \
    --output-format text \
    2>&1 | tail -1

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
