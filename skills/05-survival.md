### Eat

```js
const food = bot.inventory.items().find(i =>
  ['bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'apple',
   'cooked_mutton', 'cooked_salmon', 'baked_potato', 'cooked_rabbit',
   'golden_apple', 'carrot', 'melon_slice', 'sweet_berries'].includes(i.name)
)
if (!food) return 'No food in inventory'
await bot.equip(food, 'hand')
await bot.consume()
return `Ate ${food.name} | Health: ${bot.health} | Hunger: ${bot.food}`
```

### Fight a hostile mob (uses mineflayer-pvp plugin)

⚠️ ALWAYS equip your best weapon before fighting. ALWAYS eat to full health first.
The bot has `bot.pvp` loaded — it handles pathfinding + attack automatically.

```js
// Find nearby hostile mobs
const hostiles = Object.values(bot.entities).filter(e =>
  ['zombie', 'skeleton', 'spider', 'creeper', 'witch', 'enderman',
   'drowned', 'husk', 'stray', 'phantom', 'pillager'].includes(e.name) &&
  e.position.distanceTo(bot.entity.position) < 16
)
if (!hostiles.length) return 'No hostile mobs nearby'

// Equip best weapon
const sword = bot.inventory.items().find(i => i.name.includes('sword'))
if (sword) await bot.equip(sword, 'hand')

// Target the closest one
const target = hostiles.sort((a, b) =>
  a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
)[0]

// If it's a creeper, RUN AWAY (they explode)
if (target.name === 'creeper') {
  bot.setControlState('sprint', true)
  bot.setControlState('back', true)
  await new Promise(r => setTimeout(r, 2000))
  bot.clearControlStates()
  return 'Ran away from creeper! Never melee a creeper.'
}

// Use pvp plugin — it handles movement + attack timing automatically
const startHealth = bot.health
bot.pvp.attack(target)
// Wait for the fight to end (mob dies or timeout)
await new Promise((resolve) => {
  const check = setInterval(() => {
    if (!target.isValid || bot.health < 6) {
      clearInterval(check)
      bot.pvp.stop()
      resolve()
    }
  }, 500)
  setTimeout(() => { clearInterval(check); bot.pvp.stop(); resolve() }, 15000)
})

if (bot.health < 6) return `LOW HEALTH (${bot.health}/20)! Eat food immediately!`
const killed = !target.isValid
return killed
  ? `Killed ${target.name}! Health: ${bot.health}/20 (lost ${(startHealth - bot.health).toFixed(1)})`
  : `${target.name} still alive. Health: ${bot.health}/20`
```

### Flee from danger (low health or too many mobs)

```js
// Run away from nearest hostile
const hostile = Object.values(bot.entities).find(e =>
  ['zombie', 'skeleton', 'spider', 'creeper'].includes(e.name) &&
  e.position.distanceTo(bot.entity.position) < 16
)
if (!hostile) return 'No threats nearby'

const away = bot.entity.position.minus(hostile.position).normalize().scaled(20)
const fleePos = bot.entity.position.plus(away)
await bot.lookAt(fleePos)
bot.setControlState('sprint', true)
bot.setControlState('forward', true)
bot.setControlState('jump', true)
await new Promise(r => setTimeout(r, 4000))
bot.clearControlStates()
return `Fled from ${hostile.name}. Now at ${bot.entity.position}`
```

### Kill an animal for food

```js
const animals = Object.values(bot.entities).filter(e =>
  ['cow', 'pig', 'chicken', 'sheep', 'rabbit'].includes(e.name) &&
  e.position.distanceTo(bot.entity.position) < 32
)
if (!animals.length) return 'No animals nearby'

const sword = bot.inventory.items().find(i => i.name.includes('sword'))
if (sword) await bot.equip(sword, 'hand')

const target = animals[0]
for (let i = 0; i < 15 && target.isValid; i++) {
  const dist = bot.entity.position.distanceTo(target.position)
  if (dist > 2.5) {
    await bot.lookAt(target.position)
    bot.setControlState('sprint', true)
    bot.setControlState('forward', true)
    await new Promise(r => setTimeout(r, 300))
  } else {
    bot.clearControlStates()
    await bot.attack(target)
    await new Promise(r => setTimeout(r, 400))
  }
}
bot.clearControlStates()
// Walk to dropped loot
if (!target.isValid) {
  await new Promise(r => setTimeout(r, 500))
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  bot.pathfinder.setMovements(new Movements(bot))
  bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 1), true)
  await new Promise(r => setTimeout(r, 2000))
  bot.pathfinder.setGoal(null)
}
return `${target.name} killed. Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### Take shelter at night (simple pillar up)

```js
if (bot.time.timeOfDay < 13000) return 'It is still daytime'

// Build a minimal shelter: 3-block pillar
const pos = bot.entity.position
for (let i = 0; i < 3; i++) {
  const below = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  const block = bot.inventory.items().find(i => ['dirt', 'cobblestone', 'oak_planks', 'spruce_planks'].includes(i.name))
  if (!block) return 'No blocks to build a shelter'
  await bot.equip(block, 'hand')
  await bot.placeBlock(below, require('vec3')(0, 1, 0))
  await new Promise(r => setTimeout(r, 300))
}
return 'Emergency shelter built (pillar)'
```

### Sleep in a bed

```js
const bed = bot.findBlock({
  matching: (block) => block.name.includes('bed'),
  maxDistance: 32,
})
if (!bed) return 'No bed found'

const { goals: { GoalNear } } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalNear(bed.position.x, bed.position.y, bed.position.z, 2))
await new Promise(resolve => bot.once('goal_reached', resolve))

try {
  await bot.sleep(bed)
  return 'Sleeping in the bed'
} catch(e) {
  return `Cannot sleep: ${e.message}`
}
```
