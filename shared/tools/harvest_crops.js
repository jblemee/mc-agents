// Harvest all mature crops in a radius and optionally replant immediately.
// Only harvests fully grown crops (stage 7 for wheat/beetroot, any for carrots/potatoes).
// Params:
//   radius (number, default 20) — search radius
//   replant (boolean, default true) — automatically replant after harvesting
//   cropType (string, default 'any') — filter by crop: 'wheat', 'carrots', 'potatoes', 'beetroots', 'any'
// Example: await tools.harvest_crops({ radius: 20, replant: true, cropType: 'wheat' })
module.exports = async function(bot, { radius = 20, replant = true, cropType = 'any' } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const CROPS = {
    wheat:    { block: 'wheat',    mature: 7, seed: 'wheat_seeds' },
    carrots:  { block: 'carrots',  mature: 7, seed: 'carrot' },
    potatoes: { block: 'potatoes', mature: 7, seed: 'potato' },
    beetroots:{ block: 'beetroots',mature: 3, seed: 'beetroot_seeds' },
  }

  const toHarvest = cropType === 'any' ? Object.values(CROPS) : [CROPS[cropType]].filter(Boolean)
  if (!toHarvest.length) return `Unknown crop type: ${cropType}`

  const matchingIds = toHarvest.map(c => mcData.blocksByName[c.block]?.id).filter(Boolean)
  if (!matchingIds.length) return `Could not find crop block IDs`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  let harvested = 0
  let replanted = 0

  const blocks = bot.findBlocks({ matching: matchingIds, maxDistance: radius, count: 200 })

  for (const pos of blocks) {
    const block = bot.blockAt(pos)
    if (!block) continue

    // Find crop info and check maturity
    const cropInfo = toHarvest.find(c => mcData.blocksByName[c.block]?.id === block.type)
    if (!cropInfo) continue

    // Check growth stage — use modern API first, fallback chain
    const props = block.getProperties?.() || block._properties || {}
    const age = props.age ?? block.metadata ?? 0
    if (age < cropInfo.mature) continue // not mature yet

    try {
      await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 2))
      await bot.dig(block)
      harvested++
      await new Promise(r => setTimeout(r, 150))

      // Replant
      if (replant) {
        const seedItem = bot.inventory.items().find(i => i.name === cropInfo.seed)
        if (seedItem) {
          const farmland = bot.blockAt(pos) // now it's farmland again
          if (farmland?.name === 'farmland') {
            await bot.equip(seedItem, 'hand')
            await bot.activateBlock(farmland)
            replanted++
          }
        }
      }
    } catch (e) {}
  }

  return `Harvested ${harvested} crops${replant ? `, replanted ${replanted}` : ''}`
}

module.exports.meta = {
  name: "harvest_crops",
  description: "Harvest mature crops and optionally replant",
  params: { radius: "number (default 20)", replant: "boolean (default true)", cropType: "string (default 'any') - 'wheat','carrots','potatoes','beetroots','any'" },
  requires: "Mature crops nearby. Seeds for replanting (auto-collected from harvest).",
  provides: "Harvested crops in inventory, replanted fields"
}
