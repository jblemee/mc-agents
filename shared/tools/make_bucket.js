// Craft an iron bucket (requires 3 iron ingots). Optionally fills it with water immediately.
// Params:
//   fill (boolean, default false) — if true, find water source and fill the bucket after crafting
// Example: await tools.make_bucket({ fill: true })
module.exports = async function(bot, { fill = false } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  // Check if already have a bucket
  const existing = bot.inventory.items().find(i => i.name === 'bucket' || i.name === 'water_bucket')
  if (existing) {
    if (!fill || existing.name === 'water_bucket') return `Already have ${existing.name}`
  }

  if (!existing) {
    // Need 3 iron ingots
    const iron = bot.inventory.items().find(i => i.name === 'iron_ingot')
    if (!iron || iron.count < 3) return `Need 3 iron ingots to craft bucket (have ${iron?.count || 0})`

    const bucketData = mcData.itemsByName['bucket']
    const tableId = mcData.blocksByName['crafting_table'].id
    let table = bot.findBlock({ matching: tableId, maxDistance: 6 })

    if (!table) {
      const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
      if (tableItem) {
        const moves = new Movements(bot)
        bot.pathfinder.setMovements(moves)
        const floor = bot.blockAt(bot.entity.position.offset(1, -1, 0))
        if (floor && floor.name !== 'air') {
          await bot.equip(tableItem, 'hand')
          await bot.placeBlock(floor, require('vec3')(0, 1, 0))
          await new Promise(r => setTimeout(r, 300))
          table = bot.findBlock({ matching: tableId, maxDistance: 6 })
        }
      }
    }
    if (!table) return `No crafting table to craft bucket`

    const moves = new Movements(bot)
    bot.pathfinder.setMovements(moves)
    await bot.pathfinder.goto(new GoalNear(table.position.x, table.position.y, table.position.z, 2)).catch(() => {})
    const recipes = bot.recipesFor(bucketData.id, null, 1, table)
    if (!recipes.length) return `No bucket recipe found`
    await bot.craft(recipes[0], 1, table)
  }

  if (!fill) return `Crafted bucket`

  // Fill with water — find a source block (not flowing)
  const waterId = mcData.blocksByName['water'].id
  const waterPositions = bot.findBlocks({ matching: waterId, maxDistance: 32, count: 20 })

  let sourceBlock = null
  for (const pos of waterPositions) {
    const b = bot.blockAt(pos)
    if (!b) continue
    // Source water has level 0; check via properties or metadata
    const props = b.getProperties?.() || b._properties || {}
    const level = props.level ?? b.metadata
    if (level === 0 || level === '0') {
      sourceBlock = b
      break
    }
  }
  if (!sourceBlock) return `Crafted bucket but no water source block found nearby (only flowing water)`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)
  await bot.pathfinder.goto(new GoalNear(sourceBlock.position.x, sourceBlock.position.y, sourceBlock.position.z, 2)).catch(() => {})

  const bucketItem = bot.inventory.items().find(i => i.name === 'bucket')
  if (!bucketItem) return `Bucket disappeared from inventory`
  await bot.equip(bucketItem, 'hand')
  await bot.activateBlock(sourceBlock)
  await new Promise(r => setTimeout(r, 500))
  return `Crafted and filled water bucket`
}

module.exports.meta = {
  name: "make_bucket",
  description: "Craft an iron bucket and optionally fill with water",
  params: { fill: "boolean (default false) - fill with water after crafting" },
  requires: "3 iron_ingot + crafting_table (for crafting). Water source nearby (for filling).",
  provides: "Bucket or water_bucket in inventory"
}
