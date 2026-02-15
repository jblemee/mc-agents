### Craft an item (without a crafting table)

Only works for 2x2 recipes: planks, sticks, crafting_table, etc.

```js
const item = 'spruce_planks'  // or oak_planks, birch_planks, etc.
const id = mcData.itemsByName[item].id
const recipes = bot.recipesFor(id, null, 1, null)  // null = no crafting table
if (!recipes.length) return `No recipe for ${item} (missing ingredients or needs crafting table)`
await bot.craft(recipes[0], 1, null)
return `Crafted ${item}! Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### Common 2x2 recipes (no table needed)

```js
// Log → 4 planks (works with any log type: oak_log, spruce_log, birch_log, etc.)
const logType = 'spruce_log'  // change to match what you have
const planksType = 'spruce_planks'  // must match the log type!
let r = bot.recipesFor(mcData.itemsByName[planksType].id, null, 1, null)
await bot.craft(r[0], 1, null)

// Planks → 4 sticks (any planks type works)
r = bot.recipesFor(mcData.itemsByName['stick'].id, null, 1, null)
await bot.craft(r[0], 1, null)

// 4 planks → 1 crafting table
r = bot.recipesFor(mcData.itemsByName['crafting_table'].id, null, 1, null)
await bot.craft(r[0], 1, null)
```

### Place a crafting table

⚠️ You MUST place it on a solid block surface. Use `bot.placeBlock(referenceBlock, faceVector)` where faceVector points from the reference block toward where you want the new block.

```js
// Find a solid block below your feet to place the table on top of
const belowPos = bot.entity.position.offset(1, -1, 0).floored()
const refBlock = bot.blockAt(belowPos)

if (!refBlock || refBlock.name === 'air') return 'No solid block to place table on — move somewhere with solid ground'

// Equip the crafting table
const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
if (!tableItem) return 'No crafting table in inventory'
await bot.equip(tableItem, 'hand')

// Place on top of the reference block (faceVector 0,1,0 = top face)
await bot.placeBlock(refBlock, require('vec3')(0, 1, 0))
return 'Crafting table placed!'
```

### Craft with a crafting table (3x3 recipes)

Needed for: pickaxes, axes, swords, shovels, furnaces, etc.

```js
const item = 'wooden_pickaxe'

// Find a nearby crafting table (must be placed in the world)
let table = bot.findBlock({
  matching: mcData.blocksByName['crafting_table'].id,
  maxDistance: 32,
})

if (!table) return 'No crafting table found nearby — place one first!'

const id = mcData.itemsByName[item].id
const recipes = bot.recipesFor(id, null, 1, table)
if (!recipes.length) {
  // Debug: show what you have
  const inv = bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')
  return `No recipe for ${item}. Your inventory: ${inv}`
}
await bot.craft(recipes[0], 1, table)
return `Crafted ${item}! Inventory: ${bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')}`
```

### Full bootstrap: logs → wooden pickaxe

```js
// Step 1: Convert logs to planks (need at least 3 logs for a pickaxe)
const logItem = bot.inventory.items().find(i => i.name.includes('_log'))
if (!logItem) return 'No logs in inventory!'
const planksName = logItem.name.replace('_log', '_planks')

// Craft 3 logs into 12 planks
for (let i = 0; i < 3 && bot.inventory.items().find(j => j.name.includes('_log')); i++) {
  const r = bot.recipesFor(mcData.itemsByName[planksName].id, null, 1, null)
  if (r.length) await bot.craft(r[0], 1, null)
}

// Step 2: Craft sticks (2 planks → 4 sticks)
let r = bot.recipesFor(mcData.itemsByName['stick'].id, null, 1, null)
if (r.length) await bot.craft(r[0], 1, null)

// Step 3: Craft crafting table (4 planks → 1 table)
r = bot.recipesFor(mcData.itemsByName['crafting_table'].id, null, 1, null)
if (r.length) await bot.craft(r[0], 1, null)

// Step 4: Place crafting table
const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
if (tableItem) {
  await bot.equip(tableItem, 'hand')
  const below = bot.blockAt(bot.entity.position.offset(1, -1, 0).floored())
  if (below && below.name !== 'air') {
    await bot.placeBlock(below, require('vec3')(0, 1, 0))
  }
}

// Step 5: Find the placed table and craft pickaxe
const table = bot.findBlock({ matching: mcData.blocksByName['crafting_table'].id, maxDistance: 5 })
if (!table) return 'Could not find placed crafting table'

r = bot.recipesFor(mcData.itemsByName['wooden_pickaxe'].id, null, 1, table)
if (!r.length) return 'Missing ingredients for wooden pickaxe'
await bot.craft(r[0], 1, table)

const inv = bot.inventory.items().map(i => i.name + ' x' + i.count).join(', ')
return `Wooden pickaxe crafted! Inventory: ${inv}`
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
