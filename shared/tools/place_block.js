// Place a block from inventory at a given position.
// Params:
//   item (string) — name of the block to place (e.g. 'torch', 'chest', 'crafting_table')
//   x, y, z (number) — coordinates where to place it
//   face (string, default 'top') — which face to place on: 'top', 'bottom', 'north', 'south', 'east', 'west'
// Example: await tools.place_block({ item: 'torch', x: 10, y: 64, z: 20 })
module.exports = async function(bot, { item, x, y, z, face = 'top' } = {}) {
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')
  const Vec3 = require('vec3')

  const blockItem = bot.inventory.items().find(i => i.name === item)
  if (!blockItem) return `No ${item} in inventory`

  const FACES = {
    top:    new Vec3(0, 1, 0),
    bottom: new Vec3(0, -1, 0),
    north:  new Vec3(0, 0, -1),
    south:  new Vec3(0, 0, 1),
    east:   new Vec3(1, 0, 0),
    west:   new Vec3(-1, 0, 0),
  }
  const faceVec = FACES[face] || FACES.top

  // The reference block is the one adjacent to where we want to place
  const refPos = new Vec3(x, y, z).minus(faceVec)
  const refBlock = bot.blockAt(refPos)
  if (!refBlock || refBlock.name === 'air') return `No solid block at reference position (${refPos.x},${refPos.y},${refPos.z})`

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  try {
    await bot.pathfinder.goto(new GoalNear(x, y, z, 3))
  } catch (e) {
    const dist = bot.entity.position.distanceTo(new Vec3(x, y, z))
    if (dist > 5) return `Cannot reach placement position (${x},${y},${z}) — too far (${dist.toFixed(1)} blocks away)`
    // Close enough, try to place anyway
  }

  await bot.equip(blockItem, 'hand')
  await bot.placeBlock(refBlock, faceVec)
  return `Placed ${item} at (${x}, ${y}, ${z})`
}

module.exports.meta = {
  name: "place_block",
  description: "Place a block from inventory at given coordinates",
  params: { item: "string - block name", x: "number", y: "number", z: "number", face: "string (default 'top')" },
  requires: "Block item in inventory, solid reference block adjacent to target position",
  provides: "Block placed at specified position"
}
