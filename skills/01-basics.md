### Look around

```js
// Nearby blocks within a radius of 16
const blocks = bot.findBlocks({
  matching: (block) => block.name !== 'air',
  maxDistance: 16,
  count: 50,
})
const summary = {}
blocks.forEach(pos => {
  const name = bot.blockAt(pos).name
  summary[name] = (summary[name] || 0) + 1
})
return JSON.stringify(summary)
```

### Position and environment

```js
const pos = bot.entity.position
const biome = bot.blockAt(pos)?.biome?.name
const timeOfDay = bot.time.timeOfDay  // 0=sunrise, 6000=noon, 12000=sunset, 18000=midnight
const isDay = timeOfDay < 13000
return `Position: ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)} | Biome: ${biome} | ${isDay ? 'Day' : 'Night'} (${timeOfDay})`
```

### See nearby entities (mobs, players)

```js
const entities = Object.values(bot.entities)
  .filter(e => e !== bot.entity)
  .filter(e => e.position.distanceTo(bot.entity.position) < 32)
  .map(e => `${e.name || e.username || 'unknown'} (${e.type}) ${e.position.distanceTo(bot.entity.position).toFixed(0)}m away`)
return entities.join('\n') || 'No nearby entities'
```

### Inventory

```js
const items = bot.inventory.items().map(i => `${i.name} x${i.count}`)
return items.join(', ') || 'Empty inventory'
```
