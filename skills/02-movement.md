### Se déplacer vers une position

```js
const { goals: { GoalBlock } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalBlock(X, Y, Z))  // remplacer X,Y,Z
await new Promise(resolve => bot.once('goal_reached', resolve))
return 'Arrivé'
```

### Aller vers un bloc spécifique (ex: trouver du bois)

```js
const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))

const log = bot.findBlock({
  matching: mcData.blocksByName['oak_log']?.id,
  maxDistance: 64,
})
if (!log) return 'Pas de bois trouvé à proximité'

bot.pathfinder.setGoal(new GoalNear(log.position.x, log.position.y, log.position.z, 1))
await new Promise(resolve => bot.once('goal_reached', resolve))
return `Arrivé près du bois à ${log.position}`
```

### Suivre un joueur

```js
const { goals: { GoalFollow } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))

const player = bot.players['Steve']  // remplacer par le nom du joueur
if (!player?.entity) return 'Joueur non visible'
bot.pathfinder.setGoal(new GoalFollow(player.entity, 2), true)  // true = dynamic
return 'Je suis le joueur'
```
