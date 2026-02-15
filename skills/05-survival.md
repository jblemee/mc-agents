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

### Fight a hostile mob (pvp plugin)

```js
const hostiles = Object.values(bot.entities).filter(e =>
  ['zombie', 'skeleton', 'spider', 'creeper', 'witch', 'enderman',
   'drowned', 'husk', 'stray', 'phantom', 'pillager'].includes(e.name) &&
  e.position.distanceTo(bot.entity.position) < 16
)
if (!hostiles.length) return 'No hostile mobs nearby'

const sword = bot.inventory.items().find(i => i.name.includes('sword'))
if (sword) await bot.equip(sword, 'hand')

const target = hostiles.sort((a, b) =>
  a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
)[0]

const startHealth = bot.health
bot.pvp.attack(target)
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

return `${!target.isValid ? 'Killed' : 'Fought'} ${target.name}. Health: ${bot.health}/20`
```

### Flee from danger

```js
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

### Kill an animal

```js
const animals = Object.values(bot.entities).filter(e =>
  ['cow', 'pig', 'chicken', 'sheep', 'rabbit'].includes(e.name) &&
  e.position.distanceTo(bot.entity.position) < 32
)
if (!animals.length) return 'No animals nearby'

const sword = bot.inventory.items().find(i => i.name.includes('sword'))
if (sword) await bot.equip(sword, 'hand')

const target = animals[0]
bot.pvp.attack(target)
await new Promise((resolve) => {
  const check = setInterval(() => {
    if (!target.isValid) { clearInterval(check); bot.pvp.stop(); resolve() }
  }, 500)
  setTimeout(() => { clearInterval(check); bot.pvp.stop(); resolve() }, 10000)
})

// Pick up loot
await new Promise(r => setTimeout(r, 500))
const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 1), true)
await new Promise(r => setTimeout(r, 2000))
bot.pathfinder.setGoal(null)
return `${target.name} killed. Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### Place a block

```js
const blockName = 'cobblestone'  // any placeable block
const item = bot.inventory.items().find(i => i.name === blockName)
if (!item) return `No ${blockName} in inventory`
await bot.equip(item, 'hand')
const below = bot.blockAt(bot.entity.position.offset(1, -1, 0).floored())
if (!below || below.name === 'air') return 'No solid reference block'
await bot.placeBlock(below, require('vec3')(0, 1, 0))
return `Placed ${blockName}`
```

### Sleep in a bed

```js
const bed = bot.findBlock({
  matching: (block) => block.name.includes('bed'),
  maxDistance: 32,
})
if (!bed) return 'No bed found'

const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalNear(bed.position.x, bed.position.y, bed.position.z, 2))
await new Promise(resolve => bot.once('goal_reached', resolve))

try {
  await bot.sleep(bed)
  return 'Sleeping'
} catch(e) {
  return `Cannot sleep: ${e.message}`
}
```
