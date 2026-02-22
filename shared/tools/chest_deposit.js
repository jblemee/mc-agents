// Deposit items into the nearest chest. Optionally specify which items to deposit.
// When items=null and keepEssentials=true (default), keeps weapons, tools, armor, and food.
module.exports = async function(bot, { items = null, maxDistance = 8, keepEssentials = true } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const ESSENTIAL_PATTERNS = [
    'sword', 'pickaxe', 'axe', 'shovel', 'hoe',
    'helmet', 'chestplate', 'leggings', 'boots',
    'shield', 'bow', 'crossbow', 'arrow'
  ]
  const FOOD_NAMES = [
    'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
    'cooked_rabbit', 'cooked_salmon', 'cooked_cod', 'bread', 'baked_potato',
    'carrot', 'apple', 'golden_apple', 'enchanted_golden_apple',
    'melon_slice', 'sweet_berries', 'glow_berries', 'golden_carrot',
    'mushroom_stew', 'rabbit_stew', 'beetroot_soup', 'suspicious_stew',
    'pumpkin_pie', 'cake', 'cookie', 'dried_kelp'
  ]

  function isEssential(itemName) {
    if (ESSENTIAL_PATTERNS.some(p => itemName.includes(p))) return true
    if (FOOD_NAMES.includes(itemName)) return true
    return false
  }

  const chestId = mcData.blocksByName['chest'].id
  const chestBlock = bot.findBlock({ matching: chestId, maxDistance })
  if (!chestBlock) return `No chest found within ${maxDistance} blocks`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)
  await bot.pathfinder.goto(new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2)).catch(() => {})

  const chest = await bot.openContainer(chestBlock)
  const deposited = []
  const kept = []

  for (const invItem of [...bot.inventory.items()]) {
    // If specific items requested, only deposit those
    if (items && !items.includes(invItem.name)) continue

    // If no specific items and keepEssentials, skip essentials
    if (!items && keepEssentials && isEssential(invItem.name)) {
      kept.push(invItem.name)
      continue
    }

    try {
      await chest.deposit(invItem.type, null, invItem.count)
      deposited.push(`${invItem.name} x${invItem.count}`)
    } catch (e) {}
  }

  chest.close()
  const keptUnique = [...new Set(kept)]
  const keptStr = keptUnique.length ? ` (kept: ${keptUnique.join(', ')})` : ''
  return deposited.length ? `Deposited: ${deposited.join(', ')}${keptStr}` : `Nothing deposited${keptStr}`
}

module.exports.meta = {
  name: "chest_deposit",
  description: "Deposit items into the nearest chest",
  params: { items: "string[] or null (default null) - item names to deposit, null = all non-essential", maxDistance: "number (default 8)", keepEssentials: "boolean (default true) - when items=null, keep weapons/tools/armor/food" },
  requires: "Chest within range, items in inventory",
  provides: "Items moved from inventory to chest"
}
