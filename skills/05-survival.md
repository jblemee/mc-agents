### Manger

```js
const food = bot.inventory.items().find(i =>
  ['bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'apple',
   'cooked_mutton', 'cooked_salmon', 'baked_potato', 'cooked_rabbit',
   'golden_apple', 'carrot', 'melon_slice', 'sweet_berries'].includes(i.name)
)
if (!food) return 'Pas de nourriture dans inventaire'
await bot.equip(food, 'hand')
await bot.consume()
return `Mangé ${food.name} | Santé: ${bot.health} | Faim: ${bot.food}`
```

### Tuer un animal pour de la nourriture

```js
const animals = Object.values(bot.entities).filter(e =>
  ['cow', 'pig', 'chicken', 'sheep', 'rabbit'].includes(e.name) &&
  e.position.distanceTo(bot.entity.position) < 32
)
if (!animals.length) return 'Pas d\'animaux proches'

const target = animals[0]
const { goals: { GoalFollow } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalFollow(target, 1), true)

// Attaquer jusqu'à ce que le mob meure
while (target.isValid) {
  if (bot.entity.position.distanceTo(target.position) < 3) {
    await bot.attack(target)
  }
  await new Promise(r => setTimeout(r, 500))
}
bot.pathfinder.setGoal(null)
return `${target.name} tué, récupère le loot`
```

### Se mettre à l'abri la nuit (pillar up simple)

```js
if (bot.time.timeOfDay < 13000) return 'Il fait encore jour'

// Construire un abri minimal : pilier de 3 blocs + dalle dessus
const pos = bot.entity.position
for (let i = 0; i < 3; i++) {
  const below = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  const dirt = bot.inventory.items().find(i => ['dirt', 'cobblestone', 'oak_planks'].includes(i.name))
  if (!dirt) return 'Pas de blocs pour construire un abri'
  await bot.equip(dirt, 'hand')
  await bot.placeBlock(below, require('vec3')(0, 1, 0))
  // Le bot monte automatiquement
  await new Promise(r => setTimeout(r, 300))
}
return 'Abri de fortune construit (pilier)'
```

### Dormir dans un lit

```js
const bed = bot.findBlock({
  matching: (block) => block.name.includes('bed'),
  maxDistance: 32,
})
if (!bed) return 'Pas de lit trouvé'

const { goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Movements } = require('mineflayer-pathfinder')
bot.pathfinder.setMovements(new Movements(bot))
bot.pathfinder.setGoal(new GoalNear(bed.position.x, bed.position.y, bed.position.z, 2))
await new Promise(resolve => bot.once('goal_reached', resolve))

try {
  await bot.sleep(bed)
  return 'Endormi dans le lit'
} catch(e) {
  return `Impossible de dormir: ${e.message}`
}
```
