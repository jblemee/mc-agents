// Dig an emergency shelter and seal the top. Use at dusk (timeOfDay ~11500).
module.exports = async function(bot, { depth = 3 } = {}) {
  const Vec3 = require('vec3')
  const startPos = bot.entity.position.floored()

  // Check if already underground (solid block above head)
  const aboveHead = bot.blockAt(startPos.offset(0, 2, 0))
  if (aboveHead && aboveHead.name !== 'air' && aboveHead.name !== 'water'
      && aboveHead.boundingBox === 'block') {
    return `Already sheltered underground (${aboveHead.name} above)`
  }

  // Equip best pickaxe for digging
  const rank = ['netherite','diamond','iron','stone','wooden']
  const pickaxe = bot.inventory.items()
    .filter(i => i.name.includes('pickaxe'))
    .sort((a, b) => {
      const aIdx = rank.findIndex(r => a.name.includes(r))
      const bIdx = rank.findIndex(r => b.name.includes(r))
      return (aIdx === -1 ? rank.length : aIdx) - (bIdx === -1 ? rank.length : bIdx)
    })[0]
  if (pickaxe) await bot.equip(pickaxe, 'hand').catch(() => {})

  const DANGEROUS = ['lava', 'flowing_lava', 'flowing_water']

  // Pre-check: scan column for lava
  for (let i = 1; i <= depth; i++) {
    const b = bot.blockAt(startPos.offset(0, -i, 0))
    if (!b) return `Could not find safe spot to dig shelter — void below`
    if (DANGEROUS.includes(b.name)) return `Could not find safe spot to dig shelter — ground has lava, water, or caves below`
  }

  // Dig down one block at a time, falling as we go
  let dugBlocks = 0
  for (let i = 0; i < depth; i++) {
    const feetPos = bot.entity.position.floored()
    const below = bot.blockAt(feetPos.offset(0, -1, 0))
    if (!below || below.name === 'air') { await new Promise(r => setTimeout(r, 300)); continue }
    if (DANGEROUS.includes(below.name)) break

    try {
      await bot.dig(below)
      dugBlocks++
    } catch (e) { break }

    // Wait for gravity
    await new Promise(r => setTimeout(r, 600))
  }

  if (dugBlocks === 0) return `Could not dig shelter — block below is unbreakable or empty`

  const finalY = Math.floor(bot.entity.position.y)

  // Find a block to seal with
  const sealItem = bot.inventory.items().find(i =>
    ['dirt','cobblestone','stone','gravel','sand','andesite','diorite','granite',
     'deepslate','cobbled_deepslate','netherrack',
     'oak_planks','spruce_planks','birch_planks','acacia_planks','jungle_planks'].includes(i.name)
  )
  if (!sealItem) return `Sheltered ${dugBlocks} blocks deep at y=${finalY} — no block to seal with, stay put`

  await bot.equip(sealItem, 'hand')

  // Seal at startPos.y - 1 (the first block we dug — top of shaft)
  // Wall blocks at this level are guaranteed solid in a 1-wide shaft
  const sealY = startPos.y - 1
  const sealTarget = new Vec3(startPos.x, sealY, startPos.z)

  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const wallBlock = bot.blockAt(new Vec3(sealTarget.x + dx, sealTarget.y, sealTarget.z + dz))
    if (wallBlock && wallBlock.name !== 'air' && wallBlock.boundingBox === 'block') {
      try {
        await bot.placeBlock(wallBlock, new Vec3(-dx, 0, -dz))
        return `Emergency shelter sealed at y=${finalY}. Safe until dawn (~23000).`
      } catch (e) {}
    }
  }

  // Fallback: try placing on top of the block directly below the seal position
  for (let dy = 0; dy < depth; dy++) {
    const ref = bot.blockAt(new Vec3(sealTarget.x, sealTarget.y - 1 - dy, sealTarget.z))
    if (ref && ref.name !== 'air' && ref.boundingBox === 'block') {
      try {
        await bot.placeBlock(ref, new Vec3(0, 1, 0))
        return `Emergency shelter sealed at y=${finalY}. Safe until dawn (~23000).`
      } catch (e) {}
    }
  }

  return `Sheltered ${dugBlocks} blocks deep at y=${finalY} but could not seal entrance — stay still`
}

module.exports.meta = {
  name: "shelter",
  description: "Dig emergency shelter and seal the top. Digs straight down one block at a time.",
  params: { depth: "number (default 3)" },
  requires: "Pickaxe (any) + blocks to seal with (dirt, cobblestone, planks, etc.) in inventory",
  provides: "Underground shelter safe from mobs"
}
