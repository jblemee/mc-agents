// Dig an emergency shelter 3 blocks deep and seal the top. Use at dusk (timeOfDay ~11500).
// Checks if shelter is actually needed first — skips if area is lit or already underground.
module.exports = async function(bot, { depth = 3 } = {}) {
  const Vec3 = require('vec3')
  const pos = bot.entity.position.floored()

  // Check if area is already lit (torches nearby = probably safe)
  const standingBlock = bot.blockAt(pos)
  if (standingBlock && standingBlock.light >= 8) {
    return `Area is lit (light=${standingBlock.light}), no shelter needed`
  }

  // Check if already underground (solid block above head)
  const aboveHead = bot.blockAt(pos.offset(0, 2, 0))
  if (aboveHead && aboveHead.name !== 'air' && aboveHead.name !== 'water'
      && aboveHead.boundingBox === 'block') {
    return `Already sheltered underground (${aboveHead.name} above)`
  }

  // Try up to 3 positions to dig a safe shelter
  const candidates = [
    pos,
    pos.offset(2, 0, 0),
    pos.offset(0, 0, 2),
  ]

  const DANGEROUS = ['lava', 'water', 'flowing_lava', 'flowing_water', 'air']

  for (const start of candidates) {
    // Pre-check: scan the column for dangers
    let safe = true
    for (let i = 1; i <= depth + 1; i++) {
      const target = bot.blockAt(start.offset(0, -i, 0))
      if (!target) { safe = false; break }
      // Check the block below each dig target for lava/water/air (cave)
      if (i <= depth) {
        const below = bot.blockAt(start.offset(0, -i - 1, 0))
        if (below && DANGEROUS.includes(below.name)) { safe = false; break }
      }
    }
    if (!safe) continue

    // Move to the candidate position if not already there
    if (start.x !== pos.x || start.z !== pos.z) {
      const { goals: { GoalNear } } = require('mineflayer-pathfinder')
      await bot.pathfinder.goto(new GoalNear(start.x, start.y, start.z, 1)).catch(() => {})
    }

    // Dig down depth+1 blocks (creates a 2-block-tall chamber at the bottom)
    for (let i = 1; i <= depth + 1; i++) {
      const b = bot.blockAt(start.offset(0, -i, 0))
      if (b && b.name !== 'air' && bot.canDigBlock(b)) {
        await bot.dig(b).catch(() => {})
        await new Promise(r => setTimeout(r, 200))
      }
    }

    // Wait for bot to fall down
    await new Promise(r => setTimeout(r, 600))

    // Find a block to seal with
    const sealItem = bot.inventory.items().find(i =>
      ['dirt','cobblestone','stone','gravel','sand','oak_planks','spruce_planks','birch_planks',
       'deepslate','cobbled_deepslate','netherrack','andesite','diorite','granite'].includes(i.name)
    )
    if (!sealItem) return `Sheltered ${depth} blocks deep at (${start.x},${start.y - depth},${start.z}) — no block to seal with, stay put`

    await bot.equip(sealItem, 'hand')

    // Bot is now at the bottom of the hole. Seal the entrance from below.
    // The entrance is at start.y, we need to place a block there.
    // Look for a solid wall block adjacent to the entrance at start.y level
    // to use as a reference for placing.
    const entranceY = start.y
    const botPos = bot.entity.position.floored()

    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const wallRef = bot.blockAt(new Vec3(start.x + dx, entranceY, start.z + dz))
      if (wallRef && wallRef.name !== 'air' && wallRef.name !== 'water' && wallRef.name !== 'lava') {
        try {
          await bot.placeBlock(wallRef, new Vec3(-dx, 0, -dz))
          return `Emergency shelter sealed at y=${start.y - depth}. Safe until dawn (~23000).`
        } catch (e) {}
      }
    }

    // Fallback: try placing on top of a block below the entrance
    const belowEntrance = bot.blockAt(new Vec3(start.x, entranceY - 1, start.z))
    if (belowEntrance && belowEntrance.name !== 'air') {
      try {
        await bot.placeBlock(belowEntrance, new Vec3(0, 1, 0))
        return `Emergency shelter sealed at y=${start.y - depth}. Safe until dawn (~23000).`
      } catch (e) {}
    }

    return `Sheltered ${depth} blocks deep but could not seal entrance — stay still`
  }

  return `Could not find safe spot to dig shelter — ground has lava, water, or caves below`
}

module.exports.meta = {
  name: "shelter",
  description: "Dig emergency shelter 3 blocks deep and seal the top",
  params: { depth: "number (default 3)" },
  requires: "Blocks to seal with (dirt, cobblestone, stone) in inventory",
  provides: "Underground shelter safe from mobs"
}
