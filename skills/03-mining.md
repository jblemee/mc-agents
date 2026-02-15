### Miner un bloc (approche simple et sûre)

Toujours vérifier l'inventaire avant/après pour détecter la zone de spawn protégée.

**IMPORTANT** : Tu ne peux miner que des blocs auxquels tu as un accès direct — il ne doit y avoir que de l'air entre toi et le bloc. Si un bloc est enterré sous de la dirt/grass, mine d'abord les blocs qui le recouvrent. `bot.canDigBlock(block)` te dit si c'est possible.

```js
const blockName = 'oak_log'  // changer selon besoin
const block = bot.findBlock({
  matching: mcData.blocksByName[blockName]?.id,
  maxDistance: 32,
})
if (!block) return `Pas de ${blockName} trouvé`

const invBefore = bot.inventory.items().length

// S'approcher (max 4 blocs)
const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalNear(block.position.x, block.position.y, block.position.z, 3))
await new Promise(resolve => bot.once('goal_reached', resolve))

await bot.dig(bot.blockAt(block.position))

// Attendre que l'item tombe et soit ramassé
await new Promise(r => setTimeout(r, 500))
const invAfter = bot.inventory.items().length

if (invAfter <= invBefore) {
  return `ATTENTION: bloc miné mais rien récupéré ! Probablement en zone de spawn protégée. Il faut s'éloigner du spawn.`
}
return `${blockName} miné et récupéré ! Inventaire: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### S'éloigner du spawn (FAIRE EN PREMIER si zone protégée)

```js
const { goals: { GoalXZ } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
const moves = new Movements(bot)
moves.allowSprinting = true
bot.pathfinder.setMovements(moves)
// Aller à 200 blocs dans une direction
const target = { x: bot.entity.position.x + 200, z: bot.entity.position.z + 200 }
bot.pathfinder.setGoal(new GoalXZ(target.x, target.z))
await new Promise(resolve => bot.once('goal_reached', resolve))
return `Arrivé à ${bot.entity.position}`
```
Note : le pathfinder peut timeout sur les longues distances. Si timeout, relancer — le bot avancera petit à petit entre chaque cycle.
