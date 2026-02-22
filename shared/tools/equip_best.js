// Equip the best available weapon, tool, or armor. type: 'sword', 'pickaxe', 'axe', 'shovel', 'armor'
module.exports = async function(bot, { type = 'sword' } = {}) {
  const TIERS = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden']

  if (type === 'armor') {
    const slots = [
      { dest: 'head', names: ['helmet'] },
      { dest: 'torso', names: ['chestplate'] },
      { dest: 'legs', names: ['leggings'] },
      { dest: 'feet', names: ['boots'] },
    ]
    const equipped = []
    for (const { dest, names } of slots) {
      for (const tier of TIERS) {
        const item = bot.inventory.items().find(i => names.some(n => i.name === `${tier}_${n}`))
        if (item) { await bot.equip(item, dest).catch(() => {}); equipped.push(item.name); break }
      }
    }
    return `Equipped armor: ${equipped.join(', ') || 'none found'}`
  }

  for (const tier of TIERS) {
    const item = bot.inventory.items().find(i => i.name === `${tier}_${type}`)
    if (item) {
      await bot.equip(item, 'hand')
      return `Equipped ${item.name}`
    }
  }
  return `No ${type} in inventory`
}

module.exports.meta = {
  name: "equip_best",
  description: "Equip the best available weapon, tool, or armor piece",
  params: { type: "string (default 'sword') - 'sword', 'pickaxe', 'axe', 'shovel', or 'armor'" },
  requires: "Item of requested type in inventory",
  provides: "Best tier item equipped"
}
