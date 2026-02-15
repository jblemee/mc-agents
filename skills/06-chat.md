### Send a chat message

```js
bot.chat('Hello everyone!')
return 'Message sent'
```

### Send a private message

```js
bot.chat('/msg Steve Hey, want to trade?')
return 'Whisper sent'
```

### Read recent chat messages

```js
const messages = []
const listener = (username, message) => {
  if (username !== bot.username) messages.push(`${username}: ${message}`)
}
bot.on('chat', listener)
await new Promise(r => setTimeout(r, 5000))
bot.removeListener('chat', listener)
return messages.length ? messages.join('\n') : 'No messages received'
```
