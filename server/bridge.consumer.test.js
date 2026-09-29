import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { createBridge } from './bridge.mjs'
import { createAgent } from './agent.mjs'
import { createAuth } from './auth.mjs'
import { initDb, closeDb } from './db/index.mjs'
import { createSession } from './auth/session.mjs'

describe('Bridge Consumer & Session Modes', () => {
  let db
  let server
  let _bridge
  let port

  beforeEach(async () => {
    db = initDb(':memory:')
    server = createServer((req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port
        _bridge = createBridge(server, { db, port })
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    closeDb()
  })

  it('accepts connection from authorized origin http://localhost:5199', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
      headers: { origin: 'http://localhost:5199' },
    })

    const helloMsg = await new Promise((resolve, reject) => {
      ws.on('error', reject)
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'hello') resolve(parsed)
      })
    })

    expect(helloMsg).toBeDefined()
    expect(helloMsg.user.role).toBe('user')
    ws.close()
  })

  it('rejects connection from unauthorized origin http://evil.com with 403', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
      headers: { origin: 'http://evil.com' },
    })

    const err = await new Promise((resolve) => {
      ws.on('error', resolve)
      ws.on('unexpected-response', (req, res) => resolve(res.statusCode))
    })
    expect(err).toBe(403)
  })

  it('rejects connection from unauthorized cross-origin', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
      headers: { origin: 'https://malicious-site.example.com' },
    })

    const err = await new Promise((resolve) => {
      ws.on('error', resolve)
      ws.on('unexpected-response', (req, res) => resolve(res.statusCode))
    })
    expect(err).toBe(403)
  })

  it('allows unauthenticated consumer connection without session cookie', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
      headers: { origin: `http://localhost:${port}` },
    })

    const helloMsg = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'hello') resolve(parsed)
      })
    })

    expect(helloMsg).toBeDefined()
    expect(helloMsg.user.id).toBe('anonymous')
    expect(helloMsg.user.role).toBe('user')

    // Normal consumer can request models
    ws.send(JSON.stringify({ type: 'models_get' }))
    // Consumer cannot invoke admin methods
    ws.send(JSON.stringify({ type: 'admin_set_config', keys: {} }))

    const errorMsg = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'error' && parsed.code === 'FORBIDDEN') resolve(parsed)
      })
    })

    expect(errorMsg.error).toContain('Admin role required')
    ws.close()
  })

  it('authenticates admin session when valid cookie is provided', async () => {
    const adminUser = { id: 'admin-1', role: 'admin' }
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, created_at)
      VALUES ('admin-1', 'admin@local', 'hash', 'admin', ?)
    `).run(new Date().toISOString())
    const session = createSession(db, adminUser)

    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
      headers: {
        origin: `http://localhost:${port}`,
        cookie: `sid=${session.token}`,
      },
    })

    const helloMsg = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'hello') resolve(parsed)
      })
    })

    expect(helloMsg.user.id).toBe('admin-1')
    expect(helloMsg.user.role).toBe('admin')
    ws.close()
  })

  it('handles provider status and falls back gracefully when CLI is missing or not logged in', async () => {
    const auth = createAuth(_bridge, { codexBin: 'nonexistent-bin', getAuthPath: () => '/nonexistent' })
    createAgent(_bridge, { mcpPort: port, auth })

    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
      headers: { origin: 'http://localhost:5199' },
    })

    await new Promise((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'hello') resolve(parsed)
      })
    })

    // Request provider status
    ws.send(JSON.stringify({ type: 'providers_get' }))

    const providerStatusMsg = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'provider_status') resolve(parsed)
      })
    })

    expect(providerStatusMsg.providers).toBeDefined()
    expect(providerStatusMsg.providers.free.ready).toBe(true)

    // Send chat with codex which is not logged in / missing
    ws.send(JSON.stringify({
      type: 'chat',
      text: 'Plan a quick trip to Rome',
      engine: 'codex',
      model: 'gpt-5.4',
    }))

    const assistantMessages = []
    await new Promise((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'assistant_text') {
          assistantMessages.push(parsed.text)
        }
        if (parsed.type === 'turn_end') {
          resolve()
        }
      })
    })

    const combinedText = assistantMessages.join('')
    expect(combinedText).toContain('Switched to Free AI Agent')
    ws.close()
  })
})

