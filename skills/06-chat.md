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
Note: messages are captured by the bot. To read recent history,
we use a temporary listener. But in a short cycle, it's better to
check the status.json file which contains essential info.

```js
// Listen for messages for 5 seconds
const messages = []
const listener = (username, message) => {
  if (username !== bot.username) messages.push(`${username}: ${message}`)
}
bot.on('chat', listener)
await new Promise(r => setTimeout(r, 5000))
bot.removeListener('chat', listener)
return messages.length ? messages.join('\n') : 'No messages received'
```
