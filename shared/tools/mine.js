// Mine N blocks of a given type, equipping the right tool automatically
module.exports = async function(bot, { block, count = 1, maxDistance = 64 } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const blockData = mcData.blocksByName[block]
  if (!blockData) return `Unknown block: ${block}`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  // Equip best tool for this block type
  const toolType = ['log','planks','wood'].some(t => block.includes(t)) ? 'axe'
    : ['dirt','sand','gravel','soul'].some(t => block.includes(t)) ? 'shovel'
    : 'pickaxe'
  const rank = ['netherite','diamond','iron','stone','wooden','golden']
  const tool = bot.inventory.items()
    .filter(i => i.name.includes(toolType))
    .sort((a, b) => {
      const aIdx = rank.findIndex(r => a.name.includes(r))
      const bIdx = rank.findIndex(r => b.name.includes(r))
      return (aIdx === -1 ? rank.length : aIdx) - (bIdx === -1 ? rank.length : bIdx)
    })[0]
  if (tool) await bot.equip(tool, 'hand').catch(() => {})

  let mined = 0
  let skipped = 0
  for (let i = 0; i < count; i++) {
    const found = bot.findBlock({ matching: blockData.id, maxDistance })
    if (!found) return `Mined ${mined}/${count} ${block} — none found nearby${skipped ? ` (skipped ${skipped} unreachable)` : ''}`

    // Navigate within dig range (4 blocks), dig, then pick up drops
    try {
      await bot.pathfinder.goto(new GoalNear(found.position.x, found.position.y, found.position.z, 4))
    } catch (e) {
      const dist = bot.entity.position.distanceTo(found.position)
      if (dist > 5) { skipped++; continue }
    }

    const b = bot.blockAt(found.position)
    if (!b || b.type !== blockData.id || !bot.canDigBlock(b)) { skipped++; continue }

    await bot.dig(b)
    mined++

    // Walk to block position to pick up dropped items
    await bot.pathfinder.goto(new GoalNear(found.position.x, found.position.y, found.position.z, 1)).catch(() => {})
    await new Promise(r => setTimeout(r, 300))
  }
  return `Mined ${mined} ${block}${skipped ? ` (skipped ${skipped} unreachable)` : ''}`
}

module.exports.meta = {
  name: "mine",
  description: "Mine N blocks of a given type, equipping the right tool automatically. NOTE: mine 'stone' to get cobblestone, mine 'oak_log'/'birch_log' for wood, mine 'iron_ore'/'coal_ore' for ores.",
  params: { block: "string - block type name (use 'stone' not 'cobblestone'. For wood: 'oak_log', 'birch_log', 'acacia_log', 'spruce_log' etc. — use whatever tree type is nearby)", count: "number (default 1)", maxDistance: "number (default 64)" },
  requires: "Pickaxe for stone/ore, axe for wood, shovel for dirt/sand. Works without tool but slower.",
  provides: "Mined blocks in inventory (stone→cobblestone, iron_ore→raw_iron)"
}
