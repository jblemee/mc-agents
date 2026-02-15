### Regarder autour de soi

```js
// Blocs proches dans un rayon de 16
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

### Position et environnement

```js
const pos = bot.entity.position
const biome = bot.blockAt(pos)?.biome?.name
const timeOfDay = bot.time.timeOfDay  // 0=lever, 6000=midi, 12000=coucher, 18000=minuit
const isDay = timeOfDay < 13000
return `Position: ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)} | Biome: ${biome} | ${isDay ? 'Jour' : 'Nuit'} (${timeOfDay})`
```

### Voir les entités proches (mobs, joueurs)

```js
const entities = Object.values(bot.entities)
  .filter(e => e !== bot.entity)
  .filter(e => e.position.distanceTo(bot.entity.position) < 32)
  .map(e => `${e.name || e.username || 'unknown'} (${e.type}) à ${e.position.distanceTo(bot.entity.position).toFixed(0)}m`)
return entities.join('\n') || 'Aucune entité proche'
```

### Inventaire

```js
const items = bot.inventory.items().map(i => `${i.name} x${i.count}`)
return items.join(', ') || 'Inventaire vide'
```
