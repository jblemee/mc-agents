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

### Kill an animal for food

```js
const animals = Object.values(bot.entities).filter(e =>
  ['cow', 'pig', 'chicken', 'sheep', 'rabbit'].includes(e.name) &&
  e.position.distanceTo(bot.entity.position) < 32
)
if (!animals.length) return 'No animals nearby'

const target = animals[0]
const { goals: { GoalFollow } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalFollow(target, 1), true)

// Attack until the mob dies
while (target.isValid) {
  if (bot.entity.position.distanceTo(target.position) < 3) {
    await bot.attack(target)
  }
  await new Promise(r => setTimeout(r, 500))
}
bot.pathfinder.setGoal(null)
return `${target.name} killed, pick up the loot`
```

### Take shelter at night (simple pillar up)

```js
if (bot.time.timeOfDay < 13000) return 'It is still daytime'

// Build a minimal shelter: 3-block pillar + slab on top
const pos = bot.entity.position
for (let i = 0; i < 3; i++) {
  const below = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  const dirt = bot.inventory.items().find(i => ['dirt', 'cobblestone', 'oak_planks'].includes(i.name))
  if (!dirt) return 'No blocks to build a shelter'
  await bot.equip(dirt, 'hand')
  await bot.placeBlock(below, require('vec3')(0, 1, 0))
  // The bot climbs automatically
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
const { Movements } = require('mineflayer-pathfinder')
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
