// Scan nearby area: returns object with {position, time, health, food, entities, ores, chests, water, inventory}
// Example: const s = await tools.scan({ radius: 30 }); if (s.time > 11500) { /* shelter */ }
module.exports = async function(bot, { radius = 20 } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const pos = bot.entity.position

  const entities = Object.values(bot.entities)
    .filter(e => e !== bot.entity)
    .filter(e => { try { return e.position.distanceTo(pos) < radius } catch { return false } })
    .map(e => {
      try { return `${e.name || e.username || '?'} (${e.type}) ${e.position.distanceTo(pos).toFixed(0)}m` }
      catch { return `${e.name || '?'} (${e.type})` }
    })

  const oreNames = ['coal_ore','iron_ore','gold_ore','diamond_ore','redstone_ore','copper_ore','lapis_ore','deepslate_iron_ore','deepslate_diamond_ore']
  const oreIds = oreNames.map(n => mcData.blocksByName[n]?.id).filter(Boolean)
  const ores = bot.findBlocks({ matching: oreIds, maxDistance: radius, count: 10 })
    .map(p => { const b = bot.blockAt(p); return b?.name })
    .filter(Boolean)
    .reduce((acc, n) => { acc[n] = (acc[n] || 0) + 1; return acc }, {})

  const chestId = mcData.blocksByName['chest']?.id
  const chests = chestId ? bot.findBlocks({ matching: chestId, maxDistance: radius, count: 5 }) : []

  const waterId = mcData.blocksByName['water']?.id
  const water = waterId ? bot.findBlocks({ matching: waterId, maxDistance: radius, count: 1 }) : []

  return {
    position: { x: pos.x.toFixed(0), y: pos.y.toFixed(0), z: pos.z.toFixed(0) },
    time: bot.time.timeOfDay,
    health: bot.health,
    food: bot.food,
    entities: entities.slice(0, 10),
    ores,
    chests: chests.length,
    water: water.length > 0,
    inventory: bot.inventory.items().map(i => `${i.name} x${i.count}`),
  }
}

module.exports.meta = {
  name: "scan",
  description: "Scan nearby area for entities, ores, chests, water, and inventory",
  params: { radius: "number (default 20) - scan radius in blocks" },
  requires: "Nothing",
  provides: "Object with position, time, health, food, entities, ores, chests, water, inventory"
}
