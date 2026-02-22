// Breed two adults of the same animal type nearby. Requires food in inventory.
module.exports = async function(bot, { animal, food } = {}) {
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const foodItem = bot.inventory.items().find(i => i.name === food)
  if (!foodItem) return `No ${food} in inventory`

  // Filter adults: check metadata[16] for IsBaby flag (protocol index for living entities 1.14+)
  const adults = Object.values(bot.entities).filter(e => {
    if (e.name !== animal) return false
    if (e.position.distanceTo(bot.entity.position) >= 10) return false
    // Check IsBaby flag — metadata index 16 is the baby flag for living entities
    if (e.metadata && e.metadata[16] === true) return false
    return true
  })

  if (adults.length < 2) return `Need at least 2 adult ${animal} nearby (found ${adults.length})`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  let bred = 0
  for (const animalEntity of adults.slice(0, 2)) {
    try {
      // Re-equip food before each feeding (may have been unequipped during pathfinding)
      const currentFood = bot.inventory.items().find(i => i.name === food)
      if (!currentFood) return `Ran out of ${food} after feeding ${bred} ${animal}(s)`
      await bot.equip(currentFood, 'hand')

      // Use entity's current position for pathfinding (not the old snapshot)
      const pos = animalEntity.position
      await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 2))
      await bot.activateEntity(animalEntity)
      bred++
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {}
  }

  return `Fed ${bred} ${animal}(s) — breeding triggered if both were adults`
}

module.exports.meta = {
  name: "breed_animals",
  description: "Breed two adults of the same animal type nearby",
  params: { animal: "string - animal name", food: "string - food item name" },
  requires: "2+ adult animals nearby, appropriate food in inventory",
  provides: "Baby animal spawned"
}
