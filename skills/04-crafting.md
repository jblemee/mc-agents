### Crafter un objet (sans table de craft)

```js
const item = 'oak_planks'  // recettes simples (2x2)
const recipe = bot.recipesFor(mcData.itemsByName[item].id, null, 1, null)
if (!recipe.length) return `Pas de recette trouvée pour ${item} (ou ingrédients manquants)`
await bot.craft(recipe[0], 1, null)  // null = sans table
return `${item} crafté`
```

### Crafter avec une table de craft

```js
const item = 'wooden_pickaxe'  // recettes complexes (3x3)

// Trouver ou poser une table de craft
let table = bot.findBlock({
  matching: mcData.blocksByName['crafting_table']?.id,
  maxDistance: 32,
})

if (!table) {
  // Crafter une table d'abord (il faut des planches)
  const planksRecipe = bot.recipesFor(mcData.itemsByName['crafting_table'].id, null, 1, null)
  if (planksRecipe.length) {
    await bot.craft(planksRecipe[0], 1, null)
  }
  // Poser la table
  const pos = bot.entity.position.offset(1, 0, 0)
  const refBlock = bot.blockAt(bot.entity.position.offset(1, -1, 0))
  await bot.placeBlock(refBlock, require('vec3')(0, 1, 0))
  table = bot.findBlock({
    matching: mcData.blocksByName['crafting_table']?.id,
    maxDistance: 5,
  })
}

if (!table) return 'Impossible de trouver/poser une table de craft'

const recipe = bot.recipesFor(mcData.itemsByName[item].id, null, 1, table)
if (!recipe.length) return `Pas de recette pour ${item} ou ingrédients manquants`
await bot.craft(recipe[0], 1, table)
return `${item} crafté`
```

### Lister les recettes disponibles avec l'inventaire actuel

```js
const craftable = []
for (const [name, item] of Object.entries(mcData.itemsByName)) {
  const recipes = bot.recipesFor(item.id, null, 1, null)
  if (recipes.length > 0) craftable.push(name)
}
return `Craftable sans table: ${craftable.join(', ') || 'rien'}`
```
