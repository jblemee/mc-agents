### Mine a block (simple and safe approach)

Always check inventory before/after to detect the protected spawn zone.

**IMPORTANT**: You can only mine blocks you have direct access to — there must be only air between you and the block. If a block is buried under dirt/grass, mine the covering blocks first. `bot.canDigBlock(block)` tells you if it's possible.

```js
const blockName = 'oak_log'  // change as needed
const block = bot.findBlock({
  matching: mcData.blocksByName[blockName]?.id,
  maxDistance: 32,
})
if (!block) return `No ${blockName} found`

const invBefore = bot.inventory.items().length

// Approach (max 4 blocks away)
const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalNear(block.position.x, block.position.y, block.position.z, 3))
await new Promise(resolve => bot.once('goal_reached', resolve))

await bot.dig(bot.blockAt(block.position))

// Wait for the item to drop and be picked up
await new Promise(r => setTimeout(r, 500))
const invAfter = bot.inventory.items().length

if (invAfter <= invBefore) {
  return `WARNING: block mined but nothing collected! Probably in protected spawn zone. You need to move away from spawn.`
}
return `${blockName} mined and collected! Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### Move away from spawn (DO THIS FIRST if in protected zone)

```js
const { goals: { GoalXZ } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
const moves = new Movements(bot)
moves.allowSprinting = true
bot.pathfinder.setMovements(moves)
// Go 200 blocks in one direction
const target = { x: bot.entity.position.x + 200, z: bot.entity.position.z + 200 }
bot.pathfinder.setGoal(new GoalXZ(target.x, target.z))
await new Promise(resolve => bot.once('goal_reached', resolve))
return `Arrived at ${bot.entity.position}`
```
Note: the pathfinder may timeout on long distances. If it times out, re-run — the bot will make progress between each cycle.
