// Collect smelted items from the last used furnace
module.exports = async function(bot, {} = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  // Find furnace: try stored location first, then search nearby
  const furnaceId = mcData.blocksByName['furnace'].id
  let furnaceBlock = null

  if (bot._lastFurnace) {
    const moves = new Movements(bot)
    bot.pathfinder.setMovements(moves)
    await bot.pathfinder.goto(new GoalNear(bot._lastFurnace.x, bot._lastFurnace.y, bot._lastFurnace.z, 2)).catch(() => {})
    furnaceBlock = bot.blockAt(bot._lastFurnace)
    if (!furnaceBlock || furnaceBlock.name !== 'furnace') furnaceBlock = null
  }

  if (!furnaceBlock) {
    furnaceBlock = bot.findBlock({ matching: furnaceId, maxDistance: 32 })
  }
  if (!furnaceBlock) return `No furnace found nearby`

  const furnace = await bot.openFurnace(furnaceBlock)

  const output = furnace.outputItem()
  if (!output) {
    // Check if still smelting
    const input = furnace.inputItem()
    const fuel = furnace.fuelItem()
    furnace.close()
    if (input) return `Still smelting — ${input.count} ${input.name} remaining. Try again later.`
    return `Furnace is empty — nothing to collect`
  }

  const name = output.name
  const count = output.count
  try {
    await furnace.takeOutput()
  } catch (e) {
    furnace.close()
    return `Failed to take output: ${e.message}`
  }

  // Also grab any leftover input/fuel
  const leftInput = furnace.inputItem()
  if (leftInput) {
    try { await furnace.takeInput() } catch (e) {}
  }
  const leftFuel = furnace.fuelItem()
  if (leftFuel) {
    try { await furnace.takeFuel() } catch (e) {}
  }

  furnace.close()
  return `Collected ${count} ${name} from furnace`
}

module.exports.meta = {
  name: "collect_smelt",
  description: "Pick up smelted items from the furnace. Call after smelt() has had time to finish.",
  params: {},
  requires: "A furnace with finished items (call smelt first, wait, then collect)",
  provides: "Smelted items in inventory"
}
