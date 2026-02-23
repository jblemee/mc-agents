// Collect dropped items on the ground nearby
module.exports = async function(bot, { radius = 16 } = {}) {
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  const items = Object.values(bot.entities).filter(e => {
    try {
      return (e.name === 'item' || (e.type === 'object' && e.objectType === 'Item')) &&
        e.position.distanceTo(bot.entity.position) <= radius
    } catch { return false }
  })

  if (!items.length) return `No dropped items within ${radius} blocks`

  let collected = 0
  for (const item of items) {
    // Check entity still exists
    if (!bot.entities[item.id]) continue
    try {
      await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 0))
      collected++
      await new Promise(r => setTimeout(r, 300))
    } catch (e) {
      // Item might have despawned or is unreachable
      continue
    }
  }
  return `Collected ${collected}/${items.length} dropped items`
}

module.exports.meta = {
  name: "collect_items",
  description: "Pick up dropped items on the ground nearby by walking to them",
  params: { radius: "number (default 16) - search radius in blocks" },
  requires: "Nothing",
  provides: "Dropped items picked up and added to inventory"
}
