const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock')
const pvp = require('mineflayer-pvp').plugin
const toolPlugin = require('mineflayer-tool').plugin
const autoEat = require('mineflayer-auto-eat').loader
const hawkeye = require('minecrafthawkeye').default
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
bot.loadPlugin(pvp)
bot.loadPlugin(toolPlugin)
bot.loadPlugin(autoEat)
bot.loadPlugin(hawkeye)

const INBOX = path.join(AGENT_DIR, 'inbox.js')
const LAST_ACTION = path.join(AGENT_DIR, 'last-action.js')
const OUTBOX = path.join(AGENT_DIR, 'outbox.json')
const STATUS = path.join(AGENT_DIR, 'status.json')
const TOOLS_DIR = path.join(AGENT_DIR, 'tools')
const SHARED_TOOLS_DIR = path.join(__dirname, 'shared', 'tools')

// === TOOLS: load reusable scripts from shared/tools/ and agents/<name>/tools/ ===
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
  // Load shared tools first (agent tools can override)
  if (fs.existsSync(SHARED_TOOLS_DIR)) {
    for (const file of fs.readdirSync(SHARED_TOOLS_DIR)) {
      if (file.endsWith('.js')) loadTool(path.join(SHARED_TOOLS_DIR, file))
    }
  }
  // Load agent-specific tools
  if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true })
  for (const file of fs.readdirSync(TOOLS_DIR)) {
    if (file.endsWith('.js')) loadTool(path.join(TOOLS_DIR, file))
  }
}

// Watch tools/ for changes (reload on save)
if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true })
{
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

let executing = false

bot.once('spawn', () => {
  console.log(`[${agentName}] Spawned at ${bot.entity.position}`)
  loadAllTools()
  writeStatus('idle')

  setInterval(async () => {
    if (executing) return

    // Atomic consume: rename first, then read (avoids TOCTOU race)
    try {
      fs.renameSync(INBOX, LAST_ACTION)
    } catch (e) {
      return // file doesn't exist or already consumed
    }
    const code = fs.readFileSync(LAST_ACTION, 'utf8').trim()
    if (!code) return

    executing = true
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

      const TIMEOUT = 120_000 // 120s max per action
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

      // Safely calculate distance
      let distance = 'unknown'
      try {
        const d = posBefore.distanceTo(bot.entity.position)
        distance = d > 1 ? `${d.toFixed(0)} blocks` : 'no'
      } catch (de) {
        console.error(`[${agentName}] Distance calc failed:`, de.message)
      }

      const output = {
        ok: true,
        result: result !== undefined ? (typeof result === 'object' ? JSON.stringify(result) : String(result)) : 'done',
        position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z },
        health: `${bot.health}/20${bot.health !== healthBefore ? ` (was ${healthBefore})` : ''}`,
        food: `${bot.food}/20${bot.food !== foodBefore ? ` (was ${foodBefore})` : ''}`,
        moved: distance,
        inventory: invAfter,
        inventoryChanged: JSON.stringify(invBefore) !== JSON.stringify(invAfter),
        time: bot.time.timeOfDay,
        nearbyEntities: Object.values(bot.entities)
          .filter(e => e !== bot.entity)
          .filter(e => {
            try { return e.position.distanceTo(bot.entity.position) < 16 } catch { return false }
          })
          .map(e => {
            try {
              const d = e.position.distanceTo(bot.entity.position).toFixed(0)
              return `${e.name || e.username || '?'} (${e.type}) ${d}m`
            } catch {
              return `${e.name || e.username || '?'} (${e.type}) unknown distance`
            }
          })
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
    } finally {
      executing = false
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

function recordChat(from, message, type = 'chat') {
  const chat = fs.existsSync(CHAT_FILE) ? JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')) : []
  const prefix = type === 'whisper' ? '[whisper] ' : ''
  chat.push({ from, message: prefix + message, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
  while (chat.length > 20) chat.shift()
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chat, null, 2))
  pushEvent({ type, from, message })
}

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  recordChat(username, message, 'chat')
})

bot.on('whisper', (username, message) => {
  if (username === bot.username) return
  recordChat(username, message, 'whisper')
})

// === AUTO-DEFENSE REFLEX: instant fight-or-flight ===
let reflexActive = false

function getBestWeapon() {
  const dominated = ['diamond_sword', 'diamond_axe', 'iron_sword', 'iron_axe', 'stone_sword', 'stone_axe', 'wooden_sword', 'wooden_axe']
  for (const name of dominated) {
    const item = bot.inventory.items().find(i => i.name === name)
    if (item) return item
  }
  return null
}

async function autoDefense(attacker) {
  if (reflexActive) return
  if (!attacker || attacker.type !== 'mob') return  // Only fight mobs, never items/players/other
  reflexActive = true
  try {
    const weapon = getBestWeapon()
    if (bot.health > 6 && weapon && attacker) {
      // Fight: equip weapon and attack
      await bot.equip(weapon, 'hand')
      bot.pvp.attack(attacker)
      console.log(`[${agentName}] REFLEX: Fighting ${attacker.name || attacker.username} with ${weapon.name}`)
      pushEvent({ type: 'reflex', action: 'fight', target: attacker.name || attacker.username, weapon: weapon.name })
    } else if (attacker) {
      // Flight: sprint away from attacker
      bot.pvp.stop()
      const dir = bot.entity.position.minus(attacker.position).normalize()
      const fleeTarget = bot.entity.position.plus(dir.scaled(20))
      bot.pathfinder.setGoal(new pathfinder.goals.GoalNear(fleeTarget.x, fleeTarget.y, fleeTarget.z, 3))
      bot.setControlState('sprint', true)
      console.log(`[${agentName}] REFLEX: Fleeing from ${attacker.name || attacker.username} (HP: ${bot.health})`)
      pushEvent({ type: 'reflex', action: 'flee', from: attacker.name || attacker.username, health: bot.health })
      setTimeout(() => bot.setControlState('sprint', false), 5000)
    }
  } catch (e) {
    console.error(`[${agentName}] Reflex error:`, e.message)
  }
  // Cooldown: don't re-trigger for 2s
  setTimeout(() => { reflexActive = false }, 2000)
}

// Hostile mob types that should trigger auto-defense
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'enderman',
  'witch', 'pillager', 'vindicator', 'phantom', 'drowned', 'husk', 'stray',
  'slime', 'magma_cube', 'blaze', 'ghast', 'ravager', 'evoker', 'vex',
  'warden', 'elder_guardian', 'guardian', 'silverfish', 'zombie_villager',
])

// Proactive proximity check: attack before getting hit
setInterval(() => {
  if (reflexActive) return
  const nearby = Object.values(bot.entities).find(e => {
    if (!HOSTILE_MOBS.has(e.name)) return false
    try { return e.position.distanceTo(bot.entity.position) < 5 } catch { return false }
  })
  if (nearby) autoDefense(nearby)
}, 500)

// === AUTO-EAT REFLEX: eat when hungry, non-blocking ===
let eating = false
let lastAteAt = 0
const EAT_COOLDOWN = 10000  // 10s cooldown — let food/saturation regenerate
const FOOD_PRIORITY = [
  'cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken',
  'cooked_salmon','cooked_cod','bread','baked_potato',
  'carrot','apple','melon_slice','potato','beetroot',
  'cookie','pumpkin_pie','golden_carrot','golden_apple',
]

setInterval(async () => {
  if (eating || executing || reflexActive) return
  if (bot.food >= 14) return
  if (Date.now() - lastAteAt < EAT_COOLDOWN) return  // wait for food to regenerate

  const foodItem = FOOD_PRIORITY
    .map(name => bot.inventory.items().find(i => i.name === name))
    .find(Boolean)
  if (!foodItem) return

  eating = true
  try {
    await bot.equip(foodItem, 'hand')
    await bot.consume()
    lastAteAt = Date.now()
    console.log(`[${agentName}] [AUTO-EAT] Ate ${foodItem.name}, food: ${bot.food}/20`)
    pushEvent({ type: 'auto-eat', item: foodItem.name, food: bot.food })
  } catch (e) {
    console.error(`[${agentName}] Auto-eat error:`, e.message)
  } finally {
    eating = false
  }
}, 5000)

// === AUTO-SHELTER REFLEX: emergency shelter when in danger at night ===
let sheltering = false

setInterval(async () => {
  if (sheltering || executing || reflexActive || eating) return

  const time = bot.time?.timeOfDay
  const isNight = time > 13000 && time < 23000
  if (!isNight) return
  if (bot.health >= 10) return

  // Check for nearby hostile mob
  const hasHostileNearby = Object.values(bot.entities).some(e => {
    if (!HOSTILE_MOBS.has(e.name)) return false
    try { return e.position.distanceTo(bot.entity.position) < 10 } catch { return false }
  })
  if (!hasHostileNearby) return

  // Check no weapon
  const weapon = getBestWeapon()
  if (weapon) return  // has weapon, auto-defense will handle it

  sheltering = true
  try {
    console.log(`[${agentName}] [AUTO-SHELTER] Emergency shelter — night + hostile + low HP + no weapon`)
    pushEvent({ type: 'auto-shelter', health: bot.health, time })
    const Vec3 = require('vec3')
    const start = bot.entity.position.floored()

    // Dig down 3 blocks
    for (let i = 1; i <= 4; i++) {
      const b = bot.blockAt(start.offset(0, -i, 0))
      if (b && b.name !== 'air' && bot.canDigBlock(b)) {
        await bot.dig(b).catch(() => {})
        await new Promise(r => setTimeout(r, 200))
      }
    }

    // Seal the top
    const sealItem = bot.inventory.items().find(i =>
      ['dirt','cobblestone','stone','gravel','sand','oak_planks','spruce_planks','birch_planks'].includes(i.name)
    )
    if (sealItem) {
      await bot.equip(sealItem, 'hand')
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const wallRef = bot.blockAt(new (require('vec3'))(start.x + dx, start.y, start.z + dz))
        if (wallRef && wallRef.name !== 'air' && wallRef.name !== 'water') {
          try {
            await bot.placeBlock(wallRef, new (require('vec3'))(-dx, 0, -dz))
            console.log(`[${agentName}] [AUTO-SHELTER] Sealed shelter`)
            break
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.error(`[${agentName}] Auto-shelter error:`, e.message)
  } finally {
    sheltering = false
  }
}, 10000)

bot.on('entityHurt', (entity) => {
  if (entity !== bot.entity) return
  const attacker = Object.values(bot.entities).find(e =>
    e !== bot.entity && e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 6
  )
  const by = attacker?.name || attacker?.username || 'unknown'
  pushEvent({ type: 'hurt', by, health: bot.health })
  if (attacker && attacker.type !== 'player') {
    autoDefense(attacker)
  }
})

bot.on('death', () => {
  console.log(`[${agentName}] Died! Respawning...`)
  writeStatus('dead')
  pushEvent({ type: 'death' })
  setTimeout(() => bot.respawn(), 1000)
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
