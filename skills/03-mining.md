### Mine a block

```js
const blockName = 'oak_log'  // change as needed
const block = bot.findBlock({
  matching: mcData.blocksByName[blockName]?.id,
  maxDistance: 32,
})
if (!block) return `No ${blockName} found`

const invBefore = bot.inventory.items().length

const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalNear(block.position.x, block.position.y, block.position.z, 3))
await new Promise(resolve => bot.once('goal_reached', resolve))

await bot.dig(bot.blockAt(block.position))
await new Promise(r => setTimeout(r, 500))

const invAfter = bot.inventory.items().length
if (invAfter <= invBefore) {
  return `WARNING: block mined but nothing collected! Probably in protected spawn zone (16 blocks). Move further away.`
}
return `${blockName} mined! Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### Mine with collectBlock (auto-equip tool + pickup)

```js
const block = bot.findBlock({
  matching: mcData.blocksByName['stone']?.id,
  maxDistance: 32,
})
if (!block) return 'No block found'
await bot.collectBlock.collect(block)
return `Collected! Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```
