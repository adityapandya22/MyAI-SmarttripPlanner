import crypto from 'node:crypto'
import { generateToken, hashToken } from './crypto.mjs'

const USER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days sliding
const ADMIN_SESSION_TTL_MS = 60 * 60 * 1000 // 60 minutes idle

export function parseCookies(cookieHeader) {
  const cookies = {}
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies
  const pairs = cookieHeader.split(';')
  for (const pair of pairs) {
    const idx = pair.indexOf('=')
    if (idx < 0) continue
    const key = pair.slice(0, idx).trim()
    const val = pair.slice(idx + 1).trim()
    try {
      cookies[key] = decodeURIComponent(val)
    } catch {
      cookies[key] = val
    }
  }
  return cookies
}

export function serializeSessionCookie(token, role = 'user', isSecure = false) {
  const maxAgeSeconds = role === 'admin'
    ? Math.floor(ADMIN_SESSION_TTL_MS / 1000)
    : Math.floor(USER_SESSION_TTL_MS / 1000)

  let cookie = `sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  if (isSecure || process.env.NODE_ENV === 'production') {
    cookie += '; Secure'
  }
  return cookie
}

export function serializeClearSessionCookie(isSecure = false) {
  let cookie = 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  if (isSecure || process.env.NODE_ENV === 'production') {
    cookie += '; Secure'
  }
  return cookie
}

export function createSession(db, user, ip = null, userAgent = null) {
  const token = generateToken()
  const tokenHashed = hashToken(token)
  const sessionId = crypto.randomUUID()
  const now = new Date()
  const ttlMs = user.role === 'admin' ? ADMIN_SESSION_TTL_MS : USER_SESSION_TTL_MS
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString()

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, user.id, tokenHashed, now.toISOString(), expiresAt, ip, userAgent)

  return { token, sessionId, expiresAt }
}

export function getSession(db, token) {
  if (!token) return null
  const tokenHashed = hashToken(token)
  const nowIso = new Date().toISOString()

  const row = db.prepare(`
    SELECT s.id AS session_id, s.user_id, s.expires_at,
           u.email, u.display_name, u.role, u.home_currency, u.locale, u.is_active, u.must_change_pw
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
  `).get(tokenHashed, nowIso)

  if (!row) return null

  // Slide expiration for active user sessions
  if (row.role !== 'admin') {
    const newExpires = new Date(Date.now() + USER_SESSION_TTL_MS).toISOString()
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(newExpires, row.session_id)
    row.expires_at = newExpires
  }

  return row
}

export function destroySession(db, token) {
  if (!token) return false
  const tokenHashed = hashToken(token)
  const res = db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHashed)
  return res.changes > 0
}

export function destroyAllUserSessions(db, userId) {
  if (!userId) return false
  const res = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  return res.changes > 0
}
