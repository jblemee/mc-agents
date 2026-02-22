// Plant seeds on all farmland blocks within a radius. Supports multiple crop types.
// Params:
//   seed (string, default 'wheat_seeds') — item name to plant. Use:
//     'wheat_seeds' for wheat, 'carrot' for carrots, 'potato' for potatoes,
//     'beetroot_seeds' for beetroot, 'melon_seeds', 'pumpkin_seeds'
//   radius (number, default 20) — search radius for farmland
//   count (number, default 64) — max blocks to plant before stopping
// Example: await tools.plant_crops({ seed: 'wheat_seeds', radius: 20, count: 80 })
module.exports = async function(bot, { seed = 'wheat_seeds', radius = 20, count = 64 } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  // Initial check — do we have seeds at all?
  const initialSeed = bot.inventory.items().find(i => i.name === seed)
  if (!initialSeed) return `No ${seed} in inventory`

  const farmlandId = mcData.blocksByName['farmland']?.id
  if (!farmlandId) return `Could not find farmland block ID`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  let planted = 0
  const farmlandBlocks = bot.findBlocks({ matching: farmlandId, maxDistance: radius, count: Math.min(count, 200) })

  for (const pos of farmlandBlocks) {
    if (planted >= count) break

    // Check nothing is planted on this farmland yet
    const abovePos = pos.offset(0, 1, 0)
    const above = bot.blockAt(abovePos)
    if (above && above.name !== 'air') continue // already planted

    const block = bot.blockAt(pos)
    if (!block) continue

    // Re-find seed item each iteration to avoid stale references
    const currentSeed = bot.inventory.items().find(i => i.name === seed)
    if (!currentSeed) break // out of seeds

    try {
      await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 2))
      const seedToEquip = bot.inventory.items().find(i => i.name === seed)
      if (!seedToEquip) break
      await bot.equip(seedToEquip, 'hand')
      await bot.activateBlock(block) // right-click farmland with seeds = plant
      planted++
      await new Promise(r => setTimeout(r, 100))
    } catch (e) {}
  }

  return `Planted ${planted} ${seed} on farmland`
}

module.exports.meta = {
  name: "plant_crops",
  description: "Plant seeds on all empty farmland blocks within radius",
  params: { seed: "string (default 'wheat_seeds')", radius: "number (default 20)", count: "number (default 64)" },
  requires: "Seeds in inventory, farmland blocks nearby",
  provides: "Crops planted on farmland"
}
