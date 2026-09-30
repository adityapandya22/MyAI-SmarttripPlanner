import { WebSocket } from 'ws'

const ws = new WebSocket('ws://127.0.0.1:5200/agent', {
  headers: {
    origin: 'http://localhost:5199',
    cookie: 'sid=demo-session-token'
  }
})

ws.on('open', () => {
  console.log('[test] Connected to ws')
  // Send chat message
  ws.send(JSON.stringify({
    type: 'chat',
    text: 'bali trip',
    model: 'smart-planner',
    engine: 'free',
    mode: 'interview',
    currency: 'INR',
    language: 'en'
  }))
})

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.type === 'assistant_stream') {
    process.stdout.write(msg.chunk)
  } else {
    console.log('\n[test] Received event:', msg.type, msg.name || '', JSON.stringify(msg.args || msg.text || msg.error || ''))
  }

  // If server calls browser tool, simulate browser behavior
  if (msg.type === 'tool_call') {
    console.log('[test] Got tool_call:', msg.id, msg.name, msg.args)
    // Send tool result back
    ws.send(JSON.stringify({
      type: 'tool_result',
      id: msg.id,
      result: { ok: true }
    }))
  }
})

ws.on('close', (code, reason) => {
  console.log('\n[test] WS closed:', code, reason.toString())
  process.exit(0)
})

ws.on('error', (err) => {
  console.error('\n[test] WS error:', err)
})

setTimeout(() => {
  console.log('\n[test] Timeout reached (30s)')
  process.exit(1)
}, 30000)
