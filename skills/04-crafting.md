### Craft without crafting table (2x2 recipes)

```js
const item = 'spruce_planks'  // planks, sticks, crafting_table
const id = mcData.itemsByName[item].id
const recipes = bot.recipesFor(id, null, 1, null)
if (!recipes.length) return `No recipe for ${item}`
await bot.craft(recipes[0], 1, null)
return `Crafted ${item}! Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### Place a crafting table

```js
const belowPos = bot.entity.position.offset(1, -1, 0).floored()
const refBlock = bot.blockAt(belowPos)
if (!refBlock || refBlock.name === 'air') return 'No solid block nearby'

const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
if (!tableItem) return 'No crafting table in inventory'
await bot.equip(tableItem, 'hand')
await bot.placeBlock(refBlock, require('vec3')(0, 1, 0))
return 'Crafting table placed!'
```

### Craft with crafting table (3x3 recipes)

```js
const item = 'wooden_pickaxe'

let table = bot.findBlock({
  matching: mcData.blocksByName['crafting_table'].id,
  maxDistance: 32,
})
if (!table) return 'No crafting table found nearby — place one first!'

const id = mcData.itemsByName[item].id
const recipes = bot.recipesFor(id, null, 1, table)
if (!recipes.length) {
  const inv = bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')
  return `No recipe for ${item}. Inventory: ${inv}`
}
await bot.craft(recipes[0], 1, table)
return `Crafted ${item}! Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### List craftable items

```js
const craftable = []
for (const [name, item] of Object.entries(mcData.itemsByName)) {
  const recipes = bot.recipesFor(item.id, null, 1, null)
  if (recipes.length > 0) craftable.push(name)
}
return `Craftable without table: ${craftable.join(', ') || 'nothing'}`
```
