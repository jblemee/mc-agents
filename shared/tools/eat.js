// Eat ONE food item from inventory to restore hunger. Returns immediately after eating.
module.exports = async function(bot, { minFood = 14 } = {}) {
  if (bot.food >= minFood) return `Food ok (${bot.food}/20)`

  const PRIORITY = [
    'cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken',
    'cooked_salmon','cooked_cod','bread','baked_potato',
    'carrot','apple','melon_slice','potato','beetroot',
    'cookie','pumpkin_pie','mushroom_stew','suspicious_stew',
    'rabbit_stew','golden_carrot','golden_apple',
  ]

  // Approximate food restoration values per item
  const RESTORE = {
    cooked_beef: 8, cooked_porkchop: 8, cooked_mutton: 8,
    cooked_chicken: 6, cooked_salmon: 6, cooked_cod: 6,
    bread: 5, baked_potato: 5,
    carrot: 3, golden_carrot: 3,
    apple: 4, golden_apple: 4,
    melon_slice: 2, cookie: 2,
    potato: 1, beetroot: 1,
    pumpkin_pie: 8, mushroom_stew: 6, suspicious_stew: 6, rabbit_stew: 10,
  }

  // Find best food in inventory (first match in priority order)
  for (const name of PRIORITY) {
    const item = bot.inventory.items().find(i => i.name === name)
    if (!item) continue

    await bot.equip(item, 'hand')
    bot.activateItem()
    await new Promise(r => setTimeout(r, 1600)) // eating animation duration
    bot.deactivateItem()

    const points = RESTORE[name] || 2
    const estimate = Math.min(20, bot.food + points)
    return `Ate ${name} (+${points} food). Food now: ~${estimate}/20`
  }

  return `No food in inventory! Food: ${bot.food}/20`
}

module.exports.meta = {
  name: "eat",
  description: "Eat food from inventory to restore hunger",
  params: { minFood: "number (default 14) - eat only if food below this" },
  requires: "Food in inventory (cooked meat, bread, baked potato, carrot, apple, etc.)",
  provides: "Restored hunger level"
}
