### Move to a position

```js
const { goals: { GoalBlock } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalBlock(X, Y, Z))  // replace X,Y,Z
await new Promise(resolve => bot.once('goal_reached', resolve))
return 'Arrived'
```

### Go to a specific block (e.g. find wood)

```js
const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))

const log = bot.findBlock({
  matching: mcData.blocksByName['oak_log']?.id,
  maxDistance: 64,
})
if (!log) return 'No wood found nearby'

bot.pathfinder.setGoal(new GoalNear(log.position.x, log.position.y, log.position.z, 1))
await new Promise(resolve => bot.once('goal_reached', resolve))
return `Arrived near wood at ${log.position}`
```

### Follow a player

```js
const { goals: { GoalFollow } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))

const player = bot.players['Steve']  // replace with player name
if (!player?.entity) return 'Player not visible'
bot.pathfinder.setGoal(new GoalFollow(player.entity, 2), true)  // true = dynamic
return 'Following the player'
```
