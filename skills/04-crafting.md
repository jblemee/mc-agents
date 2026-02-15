### Craft an item (without a crafting table)

```js
const item = 'oak_planks'  // simple recipes (2x2)
const recipe = bot.recipesFor(mcData.itemsByName[item].id, null, 1, null)
if (!recipe.length) return `No recipe found for ${item} (or missing ingredients)`
await bot.craft(recipe[0], 1, null)  // null = no table
return `${item} crafted`
```

### Craft with a crafting table

```js
const item = 'wooden_pickaxe'  // complex recipes (3x3)

// Find or place a crafting table
let table = bot.findBlock({
  matching: mcData.blocksByName['crafting_table']?.id,
  maxDistance: 32,
})

if (!table) {
  // Craft a table first (requires planks)
  const planksRecipe = bot.recipesFor(mcData.itemsByName['crafting_table'].id, null, 1, null)
  if (planksRecipe.length) {
    await bot.craft(planksRecipe[0], 1, null)
  }
  // Place the table
  const pos = bot.entity.position.offset(1, 0, 0)
  const refBlock = bot.blockAt(bot.entity.position.offset(1, -1, 0))
  await bot.placeBlock(refBlock, require('vec3')(0, 1, 0))
  table = bot.findBlock({
    matching: mcData.blocksByName['crafting_table']?.id,
    maxDistance: 5,
  })
}

if (!table) return 'Unable to find/place a crafting table'

const recipe = bot.recipesFor(mcData.itemsByName[item].id, null, 1, table)
if (!recipe.length) return `No recipe for ${item} or missing ingredients`
await bot.craft(recipe[0], 1, table)
return `${item} crafted`
```

### List available recipes with current inventory

```js
const craftable = []
for (const [name, item] of Object.entries(mcData.itemsByName)) {
  const recipes = bot.recipesFor(item.id, null, 1, null)
  if (recipes.length > 0) craftable.push(name)
}
return `Craftable without table: ${craftable.join(', ') || 'nothing'}`
```
