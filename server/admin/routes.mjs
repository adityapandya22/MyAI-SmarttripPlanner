import crypto from 'node:crypto'
import { hashPassword } from '../auth/password.mjs'
import { encryptData, decryptData, maskSecret } from '../auth/crypto.mjs'
import { parseCookies, getSession } from '../auth/session.mjs'

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function createAdminRouter(db) {
  return async function handleAdminRoute(req, res, pathname, body) {
    if (!pathname.startsWith('/api/admin')) {
      return null
    }

    const cookies = parseCookies(req.headers.cookie)
    const token = cookies.sid
    const session = getSession(db, token)

    if (!session || session.role !== 'admin') {
      return sendJson(res, 403, { error: 'Administrator access required' })
    }

    // GET /api/admin/overview
    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
      const tripCount = db.prepare('SELECT COUNT(*) AS count FROM trips').get().count
      const activeSessions = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?').get(new Date().toISOString()).count
      const cacheEntries = db.prepare('SELECT COUNT(*) AS count FROM places_cache').get().count

      return sendJson(res, 200, {
        stats: {
          users: userCount,
          trips: tripCount,
          activeSessions,
          cachedPlaces: cacheEntries,
          nodeVersion: process.version,
          uptimeSeconds: Math.floor(process.uptime()),
        },
        dataSources: {
          nominatim: { status: 'healthy', policy: '1 req/s' },
          photon: { status: 'healthy', policy: 'public typeahead' },
          overpass: { status: 'healthy', policy: 'places & stays' },
          openMeteo: { status: 'healthy', policy: 'weather forecast' },
          ecbFx: { status: 'healthy', policy: 'frankfurter.dev' },
        },
      })
    }

    // GET /api/admin/users
    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const users = db.prepare(`
        SELECT id, email, display_name, role, home_currency, locale, is_active, failed_logins, locked_until, created_at
        FROM users
        ORDER BY created_at DESC
      `).all()
      return sendJson(res, 200, { users })
    }

    // POST /api/admin/users/:id/status (enable/disable)
    const statusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/)
    if (req.method === 'POST' && statusMatch) {
      const targetUserId = statusMatch[1]
      if (targetUserId === session.user_id) {
        return sendJson(res, 400, { error: 'You cannot change your own active status' })
      }

      const { isActive } = body || {}
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, targetUserId)
      return sendJson(res, 200, { success: true })
    }

    // POST /api/admin/users/:id/reset-password
    const resetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/)
    if (req.method === 'POST' && resetMatch) {
      const targetUserId = resetMatch[1]
      const tempPassword = crypto.randomBytes(8).toString('hex') + '!Aa1'
      const hashed = await hashPassword(tempPassword)

      db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?').run(
        hashed,
        targetUserId
      )

      return sendJson(res, 200, { success: true, temporaryPassword: tempPassword })
    }

    // DELETE /api/admin/users/:id
    const deleteMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
    if (req.method === 'DELETE' && deleteMatch) {
      const targetUserId = deleteMatch[1]
      if (targetUserId === session.user_id) {
        return sendJson(res, 400, { error: 'You cannot delete your own admin account' })
      }

      const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetUserId)
      if (target?.role === 'admin') {
        const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count
        if (adminCount <= 1) {
          return sendJson(res, 400, { error: 'Cannot delete the last remaining administrator account' })
        }
      }

      db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId)
      return sendJson(res, 200, { success: true })
    }

    // GET /api/admin/trips (Privacy-safe metadata only)
    if (req.method === 'GET' && pathname === '/api/admin/trips') {
      const trips = db.prepare(`
        SELECT t.id, t.title, t.created_at, t.updated_at, u.email AS owner_email,
               LENGTH(t.data_json) AS size_bytes
        FROM trips t
        JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `).all()
      return sendJson(res, 200, { trips })
    }

    // GET /api/admin/settings (Masked API keys)
    if (req.method === 'GET' && pathname === '/api/admin/settings') {
      const rows = db.prepare('SELECT key, value_encrypted, updated_at FROM settings').all()
      const settings = {}
      for (const row of rows) {
        try {
          const decrypted = decryptData(row.value_encrypted)
          settings[row.key] = {
            masked: maskSecret(decrypted),
            hasValue: true,
            updatedAt: row.updated_at,
          }
        } catch {
          settings[row.key] = { masked: '***', hasValue: true, updatedAt: row.updated_at }
        }
      }
      return sendJson(res, 200, { settings })
    }

    // POST /api/admin/settings (AES-256-GCM Encrypted at rest)
    if (req.method === 'POST' && pathname === '/api/admin/settings') {
      const { key, value } = body || {}
      if (!key || typeof key !== 'string' || typeof value !== 'string') {
        return sendJson(res, 400, { error: 'Key and value must be valid strings' })
      }

      const encrypted = encryptData(value)
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO settings (key, value_encrypted, updated_by, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_encrypted = excluded.value_encrypted,
                                      updated_by = excluded.updated_by,
                                      updated_at = excluded.updated_at
      `).run(key, encrypted, session.user_id, now)

      return sendJson(res, 200, { success: true, key, masked: maskSecret(value) })
    }

    // GET /api/admin/audit
    if (req.method === 'GET' && pathname === '/api/admin/audit') {
      const logs = db.prepare(`
        SELECT id, actor_user_id, action, target, meta_json, ip, created_at
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT 100
      `).all()
      return sendJson(res, 200, { logs })
    }

    return null
  }
}
