// Lure a nearby animal to a target position by holding food and walking away.
// Animals follow the player when they hold the right food item.
module.exports = async function(bot, { animal, food, targetX = null, targetZ = null, maxDistance = 32, timeout = 20000 } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear, GoalXZ } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const foodItem = bot.inventory.items().find(i => i.name === food)
  if (!foodItem) return `No ${food} in inventory`

  const target = Object.values(bot.entities).find(e =>
    e.name === animal &&
    e.position.distanceTo(bot.entity.position) < maxDistance
  )
  if (!target) return `No ${animal} found within ${maxDistance} blocks`

  // Remember where we started so we can lead back
  const startPos = bot.entity.position.clone()
  const startDist = target.position.distanceTo(startPos).toFixed(0)

  // Equip food so the animal can see it
  await bot.equip(foodItem, 'hand')

  const moves = new Movements(bot)
  moves.canDig = false
  bot.pathfinder.setMovements(moves)

  // Step 1: Walk close to the animal to get its attention
  await bot.pathfinder.goto(new GoalNear(target.position.x, target.position.y, target.position.z, 3)).catch(() => {})

  // Re-equip food (pathfinding may have changed held item)
  const foodItem2 = bot.inventory.items().find(i => i.name === food)
  if (foodItem2) await bot.equip(foodItem2, 'hand')

  // Brief pause so the animal notices the food
  await new Promise(r => setTimeout(r, 1500))

  // Step 2: Walk AWAY toward target destination (animal follows because we hold food)
  let goalX, goalZ
  if (targetX !== null && targetZ !== null) {
    goalX = targetX
    goalZ = targetZ
  } else {
    // No target specified — walk back to starting position
    goalX = startPos.x
    goalZ = startPos.z
  }

  // Walk to destination slowly so animal can follow
  await bot.pathfinder.goto(new GoalXZ(goalX, goalZ)).catch(() => {})

  // Wait a moment for the animal to catch up
  const remaining = Math.max(0, timeout - 5000)
  await new Promise(r => setTimeout(r, Math.min(remaining, 5000)))

  const endDist = target.isValid ? target.position.distanceTo(bot.entity.position).toFixed(0) : '?'
  const status = target.isValid && target.position.distanceTo(bot.entity.position) < 6
    ? 'animal is following'
    : 'animal may have lost interest'

  return `Lured ${animal} from ${startDist}m to ${endDist}m away. ${status}`
}

module.exports.meta = {
  name: "lure_animal",
  description: "Lure a nearby animal to a target position by holding food and walking away",
  params: { animal: "string - animal name", food: "string - food item name", targetX: "number or null - X coord to lead animal to", targetZ: "number or null - Z coord to lead animal to", maxDistance: "number (default 32)", timeout: "number (default 20000) ms" },
  requires: "Appropriate food in inventory (wheat for cows/sheep, carrots for pigs, seeds for chickens)",
  provides: "Animal lured to target position"
}
