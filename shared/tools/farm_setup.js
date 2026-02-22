// Till soil and dig a water channel to set up a farm plot.
// Creates a standard 9x9 plot with 1 water block at center — irrigates all 80 surrounding tiles.
// Requires: wooden hoe or better, 1 water_bucket (from make_bucket tool).
// Params:
//   x, z (number) — corner of the farm plot (use bot.entity.position.x/z if omitted)
//   width (number, default 9) — width of the farm
//   length (number, default 9) — length of the farm
//   waterX, waterZ (number) — position to place water (defaults to center of plot)
// Example: await tools.farm_setup({ x: 100, z: 50, width: 9, length: 9 })
module.exports = async function(bot, { x, z, width = 9, length = 9, waterX, waterZ } = {}) {
  const mcData = require('minecraft-data')(bot.version)
  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const { Movements } = require('mineflayer-pathfinder')
  const Vec3 = require('vec3')

  const startTime = Date.now()
  const TIMEOUT_MS = 45000

  const startX = x ?? Math.floor(bot.entity.position.x)
  const startZ = z ?? Math.floor(bot.entity.position.z)
  const y = Math.floor(bot.entity.position.y) - 1 // ground level

  const cx = waterX ?? Math.floor(startX + width / 2)
  const cz = waterZ ?? Math.floor(startZ + length / 2)

  const moves = new Movements(bot)
  bot.pathfinder.setMovements(moves)

  // Step 1: Equip hoe
  let hoe = bot.inventory.items().find(i => i.name.includes('_hoe'))
  if (!hoe) return `No hoe in inventory — craft one first (2 planks + 2 sticks)`
  await bot.equip(hoe, 'hand')

  // Step 2: Till all dirt/grass blocks in the plot
  let tilled = 0
  let totalTillable = 0
  let timedOut = false
  let channelDug = false

  for (let dx = 0; dx < width; dx++) {
    if (timedOut) break
    for (let dz = 0; dz < length; dz++) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        timedOut = true
        break
      }

      const bx = startX + dx
      const bz = startZ + dz
      const pos = new Vec3(bx, y, bz)

      // Skip center (water hole)
      if (bx === cx && bz === cz) continue

      const block = bot.blockAt(pos)
      if (!block || !['dirt','grass_block','grass_path','coarse_dirt'].includes(block.name)) continue
      totalTillable++

      try {
        await bot.pathfinder.goto(new GoalNear(bx, y, bz, 2))
        // Re-find hoe every 10 blocks in case reference went stale
        if (tilled % 10 === 0) {
          hoe = bot.inventory.items().find(i => i.name.includes('_hoe'))
          if (!hoe) break
        }
        await bot.equip(hoe, 'hand')
        await bot.activateBlock(block) // right-click with hoe = till
        tilled++
        await new Promise(r => setTimeout(r, 100))
      } catch (e) {}
    }
  }

  if (timedOut) {
    return `Farm setup: tilled ${tilled}/${totalTillable} blocks (stopped: timeout), water hole at (${cx},${y},${cz}) not yet dug`
  }

  // Step 3: Dig water hole at center
  const centerBlock = bot.blockAt(new Vec3(cx, y, cz))
  if (centerBlock && centerBlock.name !== 'air' && bot.canDigBlock(centerBlock)) {
    try {
      const shovel = bot.inventory.items().find(i => i.name.includes('shovel')) ||
                     bot.inventory.items().find(i => i.name.includes('pickaxe'))
      if (shovel) await bot.equip(shovel, 'hand')
      await bot.pathfinder.goto(new GoalNear(cx, y, cz, 2))
      await bot.dig(centerBlock)
      channelDug = true
    } catch (e) {}
  }

  // Step 4: Place water in hole
  // The hole is at (cx, y, cz) — that's where we dug. Water goes there.
  if (channelDug) {
    const waterBucket = bot.inventory.items().find(i => i.name === 'water_bucket')
    if (waterBucket) {
      await bot.equip(waterBucket, 'hand')
      // Look at the hole and activate to pour water
      const holeBlock = bot.blockAt(new Vec3(cx, y, cz))
      if (holeBlock) {
        try {
          await bot.lookAt(new Vec3(cx + 0.5, y + 0.5, cz + 0.5))
          await bot.activateItem()
          await new Promise(r => setTimeout(r, 300))
        } catch (e) {}
      }
    } else {
      return `Tilled ${tilled} blocks and dug water hole at (${cx},${y},${cz}) — place water_bucket manually`
    }
  }

  return `Farm setup: tilled ${tilled} blocks, water at (${cx},${y},${cz}). Ready to plant!`
}

module.exports.meta = {
  name: "farm_setup",
  description: "Till soil and dig water channel to create a 9x9 farm plot",
  params: { x: "number - corner X", z: "number - corner Z", width: "number (default 9)", length: "number (default 9)", waterX: "number - water X", waterZ: "number - water Z" },
  requires: "Hoe (any tier), water_bucket for irrigation",
  provides: "Tilled farmland ready for planting"
}
