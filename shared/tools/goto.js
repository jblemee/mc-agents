// Navigate to XYZ coordinates using pathfinder
module.exports = async function(bot, { x, y, z, range = 2 } = {}) {
  // Validate parameters
  if (x === undefined || y === undefined || z === undefined ||
      typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' ||
      isNaN(x) || isNaN(y) || isNaN(z)) {
    return `goto requires x, y, z coordinates (got x=${x}, y=${y}, z=${z})`
  }

  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')
  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)
  await bot.pathfinder.goto(new GoalNear(x, y, z, range))
  const pos = bot.entity.position
  return `Arrived at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`
}

module.exports.meta = {
  name: "goto",
  description: "Navigate to XYZ coordinates using pathfinder",
  params: { x: "number", y: "number", z: "number", range: "number (default 2)" },
  requires: "Nothing",
  provides: "Bot moved to target location"
}
