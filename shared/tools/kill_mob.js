// Find and kill the nearest mob of a given type. Uses PVP plugin.
module.exports = async function(bot, { mob, maxDistance = 20, timeout = 15000 } = {}) {
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  // Find ALL matching mobs and pick the nearest one
  const candidates = Object.values(bot.entities).filter(e =>
    (e.name === mob || e.mobType === mob) &&
    e.type === 'mob' &&
    e.position.distanceTo(bot.entity.position) < maxDistance
  )
  if (candidates.length === 0) return `No ${mob} found within ${maxDistance} blocks`

  candidates.sort((a, b) =>
    a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
  )
  const target = candidates[0]

  // Equip best weapon: swords first, then axes (axes deal more damage in 1.9+)
  const WEAPON_TIERS = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden']
  let equipped = false
  for (const tier of WEAPON_TIERS) {
    const sword = bot.inventory.items().find(i => i.name === `${tier}_sword`)
    if (sword) { await bot.equip(sword, 'hand').catch(() => {}); equipped = true; break }
  }
  if (!equipped) {
    for (const tier of WEAPON_TIERS) {
      const axe = bot.inventory.items().find(i => i.name === `${tier}_axe`)
      if (axe) { await bot.equip(axe, 'hand').catch(() => {}); equipped = true; break }
    }
  }

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  bot.pvp.attack(target)
  const start = Date.now()
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (!target.isValid || Date.now() - start > timeout) {
        bot.pvp.stop()
        clearInterval(check)
        resolve()
      }
    }, 200)
  })

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  if (!target.isValid) {
    return `Killed ${mob} in ${elapsed}s, loot should be nearby`
  } else {
    const dist = target.position.distanceTo(bot.entity.position).toFixed(0)
    return `Failed to kill ${mob} (timed out after ${elapsed}s), mob still alive at ${dist}m`
  }
}

module.exports.meta = {
  name: "kill_mob",
  description: "Find and kill the nearest mob of a given type using PVP plugin",
  params: { mob: "string - mob name", maxDistance: "number (default 20)", timeout: "number (default 15000) ms" },
  requires: "Weapon recommended (swords or axes). Target mob within range.",
  provides: "Mob killed, loot dropped nearby"
}
