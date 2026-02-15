const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock')
const { Authflow, Titles } = require('prismarine-auth')
const fs = require('fs')
const path = require('path')

// Load .env
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^(\w+)=(.*)$/)
    if (match) process.env[match[1]] = match[2]
  }
}

const agentName = process.argv[2] || 'bob'
const AGENT_DIR = path.join(__dirname, 'agents', agentName)
const agentConfig = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, 'config.json'), 'utf8'))

const botOptions = {
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || '25565'),
  username: agentConfig.username || agentName,
  version: process.env.MC_VERSION || undefined,
}

// Microsoft auth: use prismarine-auth directly with MinecraftJava title
if (agentConfig.microsoft) {
  const authFlow = new Authflow(agentConfig.microsoft, path.join(__dirname, '.auth-cache'), {
    flow: 'live',
    authTitle: Titles.MinecraftJava,
    deviceType: 'Win32',
  }, (data) => {
    console.log('')
    console.log('========================================')
    console.log('  MICROSOFT LOGIN REQUIRED')
    console.log('========================================')
    console.log(`  1. Open: ${data.verification_uri}`)
    console.log(`  2. Enter: ${data.user_code}`)
    console.log('========================================')
    console.log('')
  })
  botOptions.username = agentConfig.microsoft
  botOptions.auth = authFlow
}

const bot = mineflayer.createBot(botOptions)

bot.loadPlugin(pathfinder.pathfinder)
bot.loadPlugin(collectBlock.plugin)

const INBOX = path.join(AGENT_DIR, 'inbox.js')
const LAST_ACTION = path.join(AGENT_DIR, 'last-action.js')
const OUTBOX = path.join(AGENT_DIR, 'outbox.json')
const STATUS = path.join(AGENT_DIR, 'status.json')
const TOOLS_DIR = path.join(AGENT_DIR, 'tools')

// === TOOLS: load reusable scripts from tools/ ===
const tools = {}

function loadTool(filePath) {
  const name = path.basename(filePath, '.js')
  try {
    delete require.cache[require.resolve(filePath)]
    tools[name] = require(filePath)
    console.log(`[${agentName}] Tool loaded: ${name}`)
  } catch (e) {
    console.error(`[${agentName}] Failed to load tool ${name}:`, e.message)
  }
}

function loadAllTools() {
  if (!fs.existsSync(TOOLS_DIR)) return
  for (const file of fs.readdirSync(TOOLS_DIR)) {
    if (file.endsWith('.js')) {
      loadTool(path.join(TOOLS_DIR, file))
    }
  }
}

// Watch tools/ for changes (reload on save)
if (fs.existsSync(TOOLS_DIR)) {
  fs.watch(TOOLS_DIR, (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
      const filePath = path.join(TOOLS_DIR, filename)
      if (fs.existsSync(filePath)) {
        console.log(`[${agentName}] Tool changed: ${filename}, reloading...`)
        loadTool(filePath)
      } else {
        // File was deleted
        const name = path.basename(filename, '.js')
        delete tools[name]
        console.log(`[${agentName}] Tool removed: ${name}`)
      }
    }
  })
}

function writeStatus(state, extra = {}) {
  fs.writeFileSync(STATUS, JSON.stringify({
    state,
    health: bot.health,
    food: bot.food,
    position: bot.entity?.position,
    time: bot.time?.timeOfDay,
    ...extra,
  }, null, 2))
}

bot.once('spawn', () => {
  console.log(`[${agentName}] Spawned at ${bot.entity.position}`)
  loadAllTools()
  writeStatus('idle')

  setInterval(async () => {
    if (!fs.existsSync(INBOX)) return

    const code = fs.readFileSync(INBOX, 'utf8').trim()
    if (!code) return
    fs.renameSync(INBOX, LAST_ACTION)

    console.log(`[${agentName}] Executing:\n${code.slice(0, 200)}...`)
    writeStatus('executing')

    // Snapshot state before execution
    const invBefore = bot.inventory.items().map(i => `${i.name} x${i.count}`)
    const healthBefore = bot.health
    const foodBefore = bot.food
    const posBefore = bot.entity.position.clone()

    try {
      const mcData = require('minecraft-data')(bot.version)
      const { goals: Goals, Movements } = pathfinder

      // Wrap tools to auto-inject bot as first arg
      const t = {}
      for (const [name, fn] of Object.entries(tools)) {
        t[name] = (...args) => fn(bot, ...args)
      }

      const TIMEOUT = 60_000 // 60s max per action
      const result = await Promise.race([
        eval(`(async () => {\nconst tools = t;\n${code}\n})()`),
        new Promise((_, reject) => setTimeout(() => {
          bot.pathfinder.setGoal(null)
          reject(new Error(`Timeout: action took more than ${TIMEOUT/1000}s`))
        }, TIMEOUT)),
      ])

      // Small delay to let physics settle (movement, item pickup)
      await new Promise(r => setTimeout(r, 500))
      const invAfter = bot.inventory.items().map(i => `${i.name} x${i.count}`)
      const output = {
        ok: true,
        result: result !== undefined ? String(result) : 'done',
        position: bot.entity.position,
        health: `${bot.health}/20${bot.health !== healthBefore ? ` (was ${healthBefore})` : ''}`,
        food: `${bot.food}/20${bot.food !== foodBefore ? ` (was ${foodBefore})` : ''}`,
        moved: posBefore.distanceTo(bot.entity.position) > 1 ? `${posBefore.distanceTo(bot.entity.position).toFixed(0)} blocks` : 'no',
        inventory: invAfter,
        inventoryChanged: JSON.stringify(invBefore) !== JSON.stringify(invAfter),
        time: bot.time.timeOfDay,
        nearbyEntities: Object.values(bot.entities)
          .filter(e => e !== bot.entity && e.position.distanceTo(bot.entity.position) < 16)
          .map(e => `${e.name || e.username || '?'} (${e.type}) ${e.position.distanceTo(bot.entity.position).toFixed(0)}m`)
          .slice(0, 5),
      }
      fs.writeFileSync(OUTBOX, JSON.stringify(output, null, 2))
      writeStatus('idle')
      console.log(`[${agentName}] OK:`, output.result)
    } catch (e) {
      const invAfter = bot.inventory.items().map(i => `${i.name} x${i.count}`)
      const output = {
        ok: false,
        error: e.message,
        position: bot.entity.position,
        health: `${bot.health}/20`,
        food: `${bot.food}/20`,
        inventory: invAfter,
        inventoryChanged: JSON.stringify(invBefore) !== JSON.stringify(invAfter),
        time: bot.time.timeOfDay,
      }
      fs.writeFileSync(OUTBOX, JSON.stringify(output, null, 2))
      writeStatus('idle')
      console.error(`[${agentName}] ERROR:`, e.message)
    }
  }, 500)
})

// === EVENT LOG: save events for the agent to read ===
const CHAT_FILE = path.join(AGENT_DIR, 'chat.json')
const EVENTS_FILE = path.join(AGENT_DIR, 'events.json')

function pushEvent(event) {
  const events = fs.existsSync(EVENTS_FILE) ? JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8')) : []
  events.push({ ...event, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
  while (events.length > 20) events.shift()
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2))
}

const URGENT_FILE = path.join(AGENT_DIR, 'urgent')

function triggerUrgent(reason) {
  fs.writeFileSync(URGENT_FILE, reason)
  console.log(`[${agentName}] URGENT: ${reason}`)
}

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  const chat = fs.existsSync(CHAT_FILE) ? JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')) : []
  chat.push({ from: username, message, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
  while (chat.length > 20) chat.shift()
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chat, null, 2))
  pushEvent({ type: 'chat', from: username, message })
  triggerUrgent(`Chat from ${username}: ${message}`)
})

bot.on('entityHurt', (entity) => {
  if (entity !== bot.entity) return
  const attacker = Object.values(bot.entities).find(e =>
    e !== bot.entity && e.position.distanceTo(bot.entity.position) < 6
  )
  const by = attacker?.name || attacker?.username || 'unknown'
  pushEvent({ type: 'hurt', by, health: bot.health })
  triggerUrgent(`Attacked by ${by}! HP: ${bot.health}`)
})

bot.on('death', () => {
  console.log(`[${agentName}] Died! Respawning...`)
  writeStatus('dead')
  bot.emit('respawn')
})

bot.on('error', (err) => {
  console.error(`[${agentName}] Error:`, err.message)
  writeStatus('error')
})
bot.on('kicked', (reason) => {
  console.log(`[${agentName}] Kicked:`, reason)
  writeStatus('disconnected')
  process.exit(1)
})
bot.on('end', (reason) => {
  console.log(`[${agentName}] Disconnected:`, reason)
  writeStatus('disconnected')
  process.exit(1)
})

// Prevent crashes from uncaught errors in eval'd scripts
process.on('uncaughtException', (err) => {
  console.error(`[${agentName}] Uncaught exception (ignored):`, err.message)
})
process.on('unhandledRejection', (err) => {
  console.error(`[${agentName}] Unhandled rejection (ignored):`, err?.message || err)
})
