// Craft an item. Searches 32 blocks for crafting table, auto-places one if needed.
module.exports = async function(bot, { item, count = 1 } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const itemData = mcData.itemsByName[item]
  if (!itemData) return `Unknown item: ${item}`

  // Try 2x2 first (no table needed)
  let recipes = bot.recipesFor(itemData.id, null, 1, null)
  if (recipes.length) {
    const perRecipe = recipes[0].result.count || 1
    const repeats = Math.ceil(count / perRecipe)
    const before = bot.inventory.count(itemData.id)
    await bot.craft(recipes[0], repeats, null)
    const after = bot.inventory.count(itemData.id)
    return `Crafted ${after - before} ${item}`
  }

  // Search for existing crafting table (64 blocks)
  const tableId = mcData.blocksByName['crafting_table'].id
  let table = bot.findBlock({ matching: tableId, maxDistance: 64 })

  // Place crafting table from inventory if none found nearby
  if (!table) {
    const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
    if (!tableItem) return `No crafting table within 32 blocks and none in inventory`

    const moves = new Movements(bot)
    bot.pathfinder.setMovements(moves)

    // Try multiple offsets to find a solid floor block with air above
    const offsets = [[1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1], [1, -1, 1], [-1, -1, -1], [2, -1, 0], [0, -1, 2]]
    let placed = false

    for (const [dx, dy, dz] of offsets) {
      const floor = bot.blockAt(bot.entity.position.offset(dx, dy, dz))
      const above = bot.blockAt(bot.entity.position.offset(dx, 0, dz))
      if (floor && floor.name !== 'air' && floor.name !== 'water' && floor.name !== 'lava'
          && floor.boundingBox === 'block'
          && above && above.name === 'air') {
        try {
          await bot.equip(tableItem, 'hand')
          await bot.placeBlock(floor, require('vec3')(0, 1, 0))
          await new Promise(r => setTimeout(r, 300))
          placed = true
          break
        } catch (e) {
          continue
        }
      }
    }

    if (!placed) return `Could not place crafting table — no solid floor nearby`

    // Re-find the placed table
    table = bot.findBlock({ matching: tableId, maxDistance: 6 })
    if (!table) return `Placed crafting table but could not find it`
  }

  // Pathfind close to the table before using it
  try {
    await bot.pathfinder.goto(new GoalNear(table.position.x, table.position.y, table.position.z, 1))
  } catch (e) {
    // Check if close enough anyway
    const dist = bot.entity.position.distanceTo(table.position)
    if (dist > 4) return `Cannot reach crafting table (${dist.toFixed(0)} blocks away)`
  }

  // Look at the table to ensure interaction works
  await bot.lookAt(table.position.offset(0.5, 0.5, 0.5))

  recipes = bot.recipesFor(itemData.id, null, 1, table)
  if (!recipes.length) return `No recipe for ${item} (check materials — need crafting table nearby for 3x3 recipes)`

  const perRecipe = recipes[0].result.count || 1
  const repeats = Math.ceil(count / perRecipe)
  const before = bot.inventory.count(itemData.id)
  await bot.craft(recipes[0], repeats, table)
  const after = bot.inventory.count(itemData.id)
  return `Crafted ${after - before} ${item}`
}

module.exports.meta = {
  name: "craft",
  description: "Craft an item. Auto-places crafting table if needed.",
  params: { item: "string - item name to craft", count: "number (default 1) - desired number of items" },
  requires: "Crafting materials in inventory. Crafting table nearby or in inventory for 3x3 recipes.",
  provides: "Crafted item in inventory"
}
