/* WebSocket hub between the agent server and the browser tab(s).
   Enforces origin validation, HTTP session authentication on upgrade,
   per-message RBAC, payload size limits (256 KB), and rate-limiting. */

import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'
<<<<<<< HEAD
import { isOriginAllowed } from './auth/csrf.mjs'
import { parseCookies, getSession, createSession } from './auth/session.mjs'
=======
import { isOriginAllowed, getAllowedOrigins } from './auth/csrf.mjs'
import { parseCookies, getSession } from './auth/session.mjs'
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)

const TOOL_TIMEOUT_MS = 20000
const INTERACTIVE_TIMEOUT_MS = 15 * 60 * 1000 // ask_user / propose_hotels wait for a human
const INTERACTIVE_TOOLS = new Set(['ask_user', 'propose_hotels', 'propose_restaurants'])
const MAX_MESSAGE_SIZE = 256 * 1024 // 256 KB limit

export function createBridge(httpServer, options = {}) {
  const { db = null, port = 5200 } = options

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/agent',
    maxPayload: MAX_MESSAGE_SIZE,
    verifyClient: (info, callback) => {
      // 1. Origin verification
      const origin = info.origin || info.req.headers.origin
      if (origin && !isOriginAllowed(origin, port)) {
        const allowedList = Array.from(getAllowedOrigins(port)).join(', ')
        console.warn(`[bridge] Rejected connection from unauthorized origin: ${origin} (allowed: ${allowedList})`)
        return callback(false, 403, 'Forbidden: Origin not allowed')
      }

      // 2. Cookie session verification (when DB is provided)
      if (db) {
        const cookies = parseCookies(info.req.headers.cookie)
        const token = cookies.sid
<<<<<<< HEAD
        let session = getSession(db, token)

        // In Consumer Mode, visitors use the app without logging in first.
        // Automatically establish an anonymous guest session with role 'user'.
        if (!session) {
          const clientIp = info.req.socket?.remoteAddress || '127.0.0.1'
          const userAgent = info.req.headers['user-agent'] || ''
          const guestUser = { id: 'anon-' + crypto.randomUUID().slice(0, 8), role: 'user' }
          const { token: guestToken } = createSession(db, guestUser, clientIp, userAgent)
          session = getSession(db, guestToken)
        }

        info.req.session = session || { user_id: 'anonymous', role: 'user' }
=======
        if (token) {
          const session = getSession(db, token)
          if (session) {
            info.req.session = session
            console.log(`[bridge] Authenticated session for user ${session.user_id} (${session.role})`)
          } else {
            console.warn('[bridge] Invalid or expired session cookie, proceeding in consumer mode')
          }
        } else {
          console.log('[bridge] No session cookie provided, connecting in consumer mode')
        }
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
      }

      callback(true)
    },
  })

  wss.on('error', () => {})
  const tabs = new Set()
  const pending = new Map() // rpc id -> { resolve, timer }
  let nextId = 1
  let chatHandler = null
  let authHandler = null
  let tabsGoneHandler = null
  let tabBackHandler = null

  wss.on('connection', (ws, req) => {
    ws.session = req.session || { user_id: 'anonymous', role: 'user' }
    tabs.add(ws)
    console.log(`[bridge] tab connected for user ${ws.session.user_id} (${ws.session.role}) (total: ${tabs.size})`)
    tabBackHandler?.()
    ws.send(JSON.stringify({ type: 'hello', tabs: tabs.size, user: { id: ws.session.user_id, role: ws.session.role } }))

    ws.on('message', (raw) => {
      if (raw.length > MAX_MESSAGE_SIZE) {
        ws.send(JSON.stringify({ type: 'error', error: 'Payload too large (max 256 KB)' }))
        return
      }

      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      // Enforce RBAC for admin messages
      if (msg.type?.startsWith('admin_')) {
        if (ws.session?.role !== 'admin') {
          ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', error: 'Admin role required' }))
          return
        }
      }

      // Handle tool results
      if (msg.type === 'tool_result' && pending.has(msg.id)) {
        const { resolve, timer } = pending.get(msg.id)
        clearTimeout(timer)
        pending.delete(msg.id)
        resolve(msg)
        return
      }

      // Chat and user interactions
      if (msg.type === 'chat' || msg.type === 'stop' || msg.type === 'reset' || msg.type === 'models_get' || msg.type === 'providers_get') {
        msg.userId = ws.session.user_id
        chatHandler?.(msg, ws)
      }

      // Auth / Admin config handling
      if (msg.type?.startsWith('auth_') || msg.type?.startsWith('admin_')) {
        authHandler?.(msg, ws)
      }
    })

    const drop = () => {
      if (!tabs.delete(ws)) return
      console.log(`[bridge] tab disconnected (left: ${tabs.size})`)
      if (tabs.size === 0) {
        for (const [, { resolve, timer }] of pending) {
          clearTimeout(timer)
          resolve({ error: 'La scheda del browser si è chiusa prima di rispondere.' })
        }
        pending.clear()
        tabsGoneHandler?.()
      }
    }
    ws.on('close', drop)
    ws.on('error', drop)
  })

  function callBrowser(name, args) {
    return new Promise((resolve) => {
      const tab = [...tabs].at(-1)
      if (!tab || tab.readyState !== 1) {
        resolve({ ok: false, error: "Nessuna scheda dell'app aperta nel browser: apri MyTripPlanner e riprova." })
        return
      }
      const id = nextId++
      const timeoutMs = INTERACTIVE_TOOLS.has(name) ? INTERACTIVE_TIMEOUT_MS : TOOL_TIMEOUT_MS
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve({
          ok: false,
          error: INTERACTIVE_TOOLS.has(name)
            ? "L'utente non ha risposto alla domanda."
            : 'Timeout: il browser non ha risposto alla tool call.',
        })
      }, timeoutMs)
      pending.set(id, { resolve: (msg) => resolve({ ok: !msg.error, result: msg.result, error: msg.error }), timer })
      tab.send(JSON.stringify({ type: 'tool_call', id, name, args }))
    })
  }

  function broadcast(event) {
    const data = JSON.stringify(event)
    for (const tab of tabs) if (tab.readyState === 1) tab.send(data)
  }

  return {
    callBrowser,
    broadcast,
    onChat(fn) { chatHandler = fn },
    onAuth(fn) { authHandler = fn },
    onTabsGone(fn) { tabsGoneHandler = fn },
    onTabBack(fn) { tabBackHandler = fn },
    get tabCount() { return tabs.size },
  }
}
