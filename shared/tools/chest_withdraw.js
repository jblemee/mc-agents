// Withdraw items from the nearest chest.
module.exports = async function(bot, { item, count = 1, maxDistance = 8 } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')

  const chestId = mcData.blocksByName['chest'].id
  const chestBlock = bot.findBlock({ matching: chestId, maxDistance })
  if (!chestBlock) return `No chest found within ${maxDistance} blocks`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)
  await bot.pathfinder.goto(new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2)).catch(() => {})

  const chest = await bot.openContainer(chestBlock)
  const itemData = mcData.itemsByName[item]
  if (!itemData) { chest.close(); return `Unknown item: ${item}` }

  const chestItem = chest.containerItems().find(i => i.type === itemData.id)
  if (!chestItem) { chest.close(); return `${item} not found in chest` }

  const toWithdraw = Math.min(count, chestItem.count)
  const invCountBefore = bot.inventory.items().filter(i => i.type === itemData.id).reduce((s, i) => s + i.count, 0)

  try {
    await chest.withdraw(itemData.id, null, toWithdraw)
  } catch (e) {
    chest.close()
    return `Failed to withdraw ${item}: ${e.message}`
  }

  // Verify the item actually arrived in inventory
  const invCountAfter = bot.inventory.items().filter(i => i.type === itemData.id).reduce((s, i) => s + i.count, 0)
  const actualWithdrawn = invCountAfter - invCountBefore
  chest.close()

  if (actualWithdrawn <= 0) {
    return `Failed to withdraw ${item}: item did not appear in inventory`
  }
  return `Withdrew ${actualWithdrawn}x ${item}`
}

module.exports.meta = {
  name: "chest_withdraw",
  description: "Withdraw items from the nearest chest",
  params: { item: "string - item name", count: "number (default 1)", maxDistance: "number (default 8)" },
  requires: "Chest within range containing the requested item",
  provides: "Items moved from chest to inventory"
}
