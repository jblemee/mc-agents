// Smelt items in a furnace. Places furnace from inventory if none nearby.
module.exports = async function(bot, { item, count = 1, fuel = null } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')
  const Vec3 = require('vec3')

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  const furnaceId = mcData.blocksByName['furnace'].id
  let furnaceBlock = bot.findBlock({ matching: furnaceId, maxDistance: 8 })

  // Place furnace from inventory if needed
  if (!furnaceBlock) {
    const furnaceItem = bot.inventory.items().find(i => i.name === 'furnace')
    if (!furnaceItem) return `No furnace nearby and none in inventory`

    const offsets = [[1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1], [1, -1, 1], [-1, -1, -1]]
    for (const [dx, dy, dz] of offsets) {
      const floor = bot.blockAt(bot.entity.position.offset(dx, dy, dz))
      const above = bot.blockAt(bot.entity.position.offset(dx, 0, dz))
      if (floor && floor.name !== 'air' && floor.name !== 'water' && floor.name !== 'lava'
          && floor.boundingBox === 'block'
          && above && above.name === 'air') {
        try {
          await bot.equip(furnaceItem, 'hand')
          await bot.placeBlock(floor, new Vec3(0, 1, 0))
          await new Promise(r => setTimeout(r, 400))
          furnaceBlock = bot.findBlock({ matching: furnaceId, maxDistance: 8 })
          if (furnaceBlock) break
        } catch (e) { continue }
      }
    }
    if (!furnaceBlock) return `Failed to place furnace — no clear spot nearby`
  }

  await bot.pathfinder.goto(new GoalNear(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z, 2)).catch(() => {})

  // Find fuel with priority chain: exact match > coal > charcoal > _planks > _log
  function findFuel() {
    const inv = bot.inventory.items()
    if (fuel) {
      const exact = inv.find(i => i.name === fuel)
      if (exact) return exact
    }
    const coal = inv.find(i => i.name === 'coal')
    if (coal) return coal
    const charcoal = inv.find(i => i.name === 'charcoal')
    if (charcoal) return charcoal
    const planks = inv.find(i => i.name.includes('_planks'))
    if (planks) return planks
    const log = inv.find(i => i.name.includes('_log') || i.name.includes('_wood'))
    if (log) return log
    return null
  }

  const fuelItem = findFuel()
  if (!fuelItem) return `No fuel available (need coal, charcoal, planks, or logs)`

  const furnace = await bot.openFurnace(furnaceBlock)

  // Add fuel
  try {
    await furnace.putFuel(fuelItem.type, null, Math.min(fuelItem.count, count + 2))
  } catch (e) {
    furnace.close()
    return `Failed to add fuel: ${e.message}`
  }

  // Add input
  const inputItem = bot.inventory.items().find(i => i.name === item || i.name === `raw_${item}`)
  if (!inputItem) { furnace.close(); return `No ${item} to smelt` }
  const inputCount = Math.min(inputItem.count, count)
  try {
    await furnace.putInput(inputItem.type, null, inputCount)
  } catch (e) {
    furnace.close()
    return `Failed to add input: ${e.message}`
  }

  furnace.close()

  // Store furnace location so collect_smelt can find it
  bot._lastFurnace = furnaceBlock.position.clone()

  const estSeconds = inputCount * 10
  return `Smelting ${inputCount} ${item} started — come back in ~${estSeconds}s. Use tools.collect_smelt({}) to pick up results.`
}

module.exports.meta = {
  name: "smelt",
  description: "Start smelting items in a furnace (non-blocking). Returns immediately. Use collect_smelt({}) later to pick up results.",
  params: { item: "string - item to smelt", count: "number (default 1)", fuel: "string or null (default null) - fuel item name, auto-detects if null" },
  requires: "Furnace nearby or in inventory, fuel (coal/wood), items to smelt",
  provides: "Starts smelting — call collect_smelt to get results"
}
