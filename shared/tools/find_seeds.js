// Break grass to collect wheat seeds. Works on tall_grass, short_grass, grass, fern, large_fern.
// Params:
//   radius (number, default 30) — search radius in blocks
//   minSeeds (number, default 10) — stop early when this many seeds collected
//   maxBlocks (number, default 200) — max grass blocks to break in one run
// Example: await tools.find_seeds({ radius: 40, minSeeds: 20 })
module.exports = async function(bot, { radius = 30, minSeeds = 10, maxBlocks = 200 } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear }, Movements } = require('mineflayer-pathfinder')

  // Include all grass variants — name changed to 'short_grass' in 1.20+
  const grassNames = ['tall_grass', 'grass', 'short_grass', 'fern', 'large_fern']
  const matching = grassNames.map(n => mcData.blocksByName[n]?.id).filter(Boolean)
  if (!matching.length) return `Could not find grass block IDs`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  const startSeeds = bot.inventory.items().find(i => i.name === 'wheat_seeds')?.count || 0

  // Collect all grass positions in radius at once
  const positions = bot.findBlocks({ matching, maxDistance: radius, count: maxBlocks })
  if (!positions.length) return `No grass found within ${radius} blocks`

  let broken = 0
  for (const pos of positions) {
    // Stop early if we have enough seeds
    const seeds = bot.inventory.items().find(i => i.name === 'wheat_seeds')?.count || 0
    if (seeds - startSeeds >= minSeeds) break

    const block = bot.blockAt(pos)
    if (!block || block.name === 'air') continue

    try {
      await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 2))
      await bot.dig(block)
      broken++
      await new Promise(r => setTimeout(r, 100))
    } catch (e) {}
  }

  const totalSeeds = bot.inventory.items().find(i => i.name === 'wheat_seeds')?.count || 0
  return `Broke ${broken}/${positions.length} grass blocks. Seeds in inventory: ${totalSeeds}`
}

module.exports.meta = {
  name: "find_seeds",
  description: "Break grass blocks to collect wheat seeds",
  params: { radius: "number (default 30)", minSeeds: "number (default 10) - stop when collected", maxBlocks: "number (default 200)" },
  requires: "Grass blocks nearby (tall_grass, short_grass, fern)",
  provides: "Wheat seeds in inventory"
}
