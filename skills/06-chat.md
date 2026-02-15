### Envoyer un message dans le chat

```js
bot.chat('Bonjour tout le monde !')
return 'Message envoyé'
```

### Envoyer un message privé

```js
bot.chat('/msg Steve Salut, tu veux échanger ?')
return 'Whisper envoyé'
```

### Lire les derniers messages du chat
Note: les messages sont capturés par le bot. Pour lire l'historique récent,
on utilise un listener temporaire. Mais dans un cycle court, mieux vaut
vérifier le fichier status.json qui contient les infos essentielles.

```js
// Écouter les messages pendant 5 secondes
const messages = []
const listener = (username, message) => {
  if (username !== bot.username) messages.push(`${username}: ${message}`)
}
bot.on('chat', listener)
await new Promise(r => setTimeout(r, 5000))
bot.removeListener('chat', listener)
return messages.length ? messages.join('\n') : 'Aucun message reçu'
```
