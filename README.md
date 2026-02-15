# MC Agents

Des agents IA autonomes qui survivent dans Minecraft. Chaque agent est un LLM (Claude, Gemini...) qui contrôle un bot Mineflayer via du code JavaScript.

## Architecture

```
┌─────────────┐   écrit inbox.js   ┌──────────────────┐
│  LLM (cron)  │ ─────────────────► │ Bot Mineflayer   │
│  Claude/etc  │ ◄───────────────── │ (Node.js)        │
└──────┬───────┘   lit outbox.json  └────────┬─────────┘
       │                                     │
       ▼                                     ▼
   MEMORY.md                          Serveur Minecraft
   skills/*.md
```

1. Un **bot Mineflayer** reste connecté au serveur Minecraft (process Node.js permanent)
2. Un **script boucle** qui relance un LLM à intervalles réguliers
3. Le LLM lit ses **skills** (comment utiliser mineflayer), sa **mémoire** (ce qu'il a fait avant), et son **état** (vie, faim, position)
4. Il écrit du JS dans `inbox.js`, le bot l'exécute, le résultat arrive dans `outbox.json`
5. Avant de finir, le LLM met à jour son `MEMORY.md`

## Prérequis

- Node.js >= 18
- Un serveur Minecraft (vanilla, Paper, Fabric...)
- Un CLI LLM : [Claude Code](https://claude.com/claude-code), Gemini CLI, ou autre
- Un compte Microsoft/Minecraft (si le serveur est en `online-mode=true`)

## Installation

```bash
git clone <repo>
cd mc-agents
npm install
```

## Configuration

Copier le fichier d'environnement et l'éditer :

```bash
cp .env.example .env
```

```env
MC_HOST=192.168.1.39    # IP du serveur Minecraft
MC_PORT=25565            # Port du serveur
MC_VERSION=1.21.11       # Version du serveur
```

> **Comment trouver la version ?** Lance `node -e "const mc = require('minecraft-protocol'); mc.ping({host:'TON_IP'}, (e,r) => console.log(r?.version))"`.

## Lancer un agent

**Étape 1 : Démarrer le bot** (reste connecté au serveur)

```bash
node bot.js bob
```

**Étape 2 : Démarrer la boucle LLM** (dans un autre terminal)

```bash
./run-agent.sh bob
```

Le bot se connecte au serveur, et le LLM commence ses cycles : observer → décider → agir → mémoriser.

## Authentification

### Serveur offline (`online-mode=false`)

Dans `config.json`, seul le `username` suffit :

```json
{
  "username": "Bob"
}
```

### Serveur online (compte Microsoft)

Ajouter le champ `microsoft` avec l'email du compte :

```json
{
  "username": "Bob",
  "microsoft": "bob@outlook.com"
}
```

Au premier lancement, le bot affiche un code à entrer sur [microsoft.com/link](https://microsoft.com/link) :

```
========================================
  CONNEXION MICROSOFT REQUISE
========================================
  1. Ouvrir : https://www.microsoft.com/link
  2. Entrer : ABC123XYZ
========================================
```

Les tokens sont ensuite cachés dans `.auth-cache/` — pas besoin de se re-connecter à chaque fois.

> Chaque agent a besoin de son propre compte Microsoft (= sa propre licence Minecraft).

## Créer un nouvel agent

```bash
mkdir -p agents/alice
```

Créer `agents/alice/config.json` :
```json
{
  "username": "Alice",
  "microsoft": "alice@outlook.com"
}
```

Créer `agents/alice/personality.md` :
```markdown
Tu t'appelles Alice. Tu es une exploratrice intrépide.
Tu adores découvrir de nouveaux biomes et cartographier le monde.
```

Créer `agents/alice/MEMORY.md` :
```markdown
# Situation actuelle
Première session. Je viens de spawner.

# À faire
1. Explorer les environs
```

Lancer :
```bash
node bot.js alice &
./run-agent.sh alice
```

## Utiliser un autre LLM

Le script `run-agent.sh` utilise `claude` par défaut. Pour changer, modifier la commande dans le script :

```bash
# Claude Code
claude -p "$PROMPT" --allowedTools "Read,Write,Bash" --max-turns 15

# Gemini CLI (adapter selon le CLI utilisé)
gemini -p "$PROMPT"

# Ollama (via un wrapper CLI)
ollama run llama3 "$PROMPT"
```

Chaque agent peut utiliser un LLM différent — il suffit de dupliquer `run-agent.sh` avec la bonne commande.

## Structure du projet

```
mc-agents/
├── .env                    # Config serveur (MC_HOST, MC_PORT, MC_VERSION)
├── .env.example
├── bot.js                  # Bot Mineflayer persistent
├── run-agent.sh            # Boucle LLM
├── system-prompt.md        # Prompt de base (commun à tous)
├── skills/                 # Comment utiliser mineflayer (markdown)
│   ├── 01-basics.md
│   ├── 02-movement.md
│   ├── 03-mining.md
│   ├── 04-crafting.md
│   ├── 05-survival.md
│   └── 06-chat.md
└── agents/
    └── bob/
        ├── config.json     # username + microsoft (optionnel)
        ├── personality.md  # Personnalité de l'agent
        ├── MEMORY.md       # Mémoire persistante entre les cycles
        ├── inbox.js        # Code JS envoyé au bot (créé par le LLM)
        ├── outbox.json     # Résultat de l'exécution (créé par le bot)
        └── status.json     # État en temps réel (créé par le bot)
```

## Dépannage

| Problème | Solution |
|----------|----------|
| `ECONNREFUSED` | Le serveur Minecraft ne tourne pas ou mauvaise IP/port dans `.env` |
| `unverified_username` | Ajouter `"microsoft": "email@outlook.com"` dans le `config.json` de l'agent, ou mettre `online-mode=false` sur le serveur |
| `Cannot read properties of null (reading 'version')` | La version dans `.env` n'est pas supportée — mettre à jour mineflayer (`npm install mineflayer@latest`) |
| Le bot ne fait rien | Vérifier que `inbox.js` est bien écrit dans le bon dossier agent |
