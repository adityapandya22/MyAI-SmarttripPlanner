import crypto from 'node:crypto'
import { parseCookies, getSession } from '../auth/session.mjs'

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function createTripRouter(db) {
  return async function handleTripRoute(req, res, pathname, body) {
    if (!pathname.startsWith('/api/trips')) {
      return null
    }

    const cookies = parseCookies(req.headers.cookie)
    const token = cookies.sid
    const session = getSession(db, token)

    if (!session || !session.user_id) {
      return sendJson(res, 401, { error: 'Authentication required' })
    }

    const userId = session.user_id

    // GET /api/trips (List own trips)
    if (req.method === 'GET' && pathname === '/api/trips') {
      const rows = db.prepare(`
        SELECT id, title, data_json, created_at, updated_at
        FROM trips
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `).all(userId)

      const trips = rows.map((r) => {
        try {
          const parsed = JSON.parse(r.data_json)
          return { ...parsed, id: r.id, title: r.title, updatedAt: r.updated_at, createdAt: r.created_at }
        } catch {
          return { id: r.id, title: r.title, updatedAt: r.updated_at, createdAt: r.created_at }
        }
      })
      return sendJson(res, 200, { trips })
    }

    // POST /api/trips (Create trip)
    if (req.method === 'POST' && pathname === '/api/trips') {
      const tripData = body || {}
      const tripId = tripData.id || 'trip-' + crypto.randomUUID().slice(0, 10)
      const title = tripData.title || 'Untitled Trip'
      const now = new Date().toISOString()

      const fullTrip = { ...tripData, id: tripId, title, createdAt: now, updatedAt: now }

      db.prepare(`
        INSERT INTO trips (id, user_id, title, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(tripId, userId, title, JSON.stringify(fullTrip), now, now)

      return sendJson(res, 201, { trip: fullTrip })
    }

    // Single trip operations: /api/trips/:id
    const tripMatch = pathname.match(/^\/api\/trips\/([^/]+)$/)
    if (tripMatch) {
      const tripId = tripMatch[1]

      // GET /api/trips/:id (Row-level ownership: returns 404 if not found or belongs to another user)
      if (req.method === 'GET') {
        const row = db.prepare('SELECT data_json FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId)
        if (!row) {
          return sendJson(res, 404, { error: 'Trip not found' })
        }
        try {
          return sendJson(res, 200, { trip: JSON.parse(row.data_json) })
        } catch {
          return sendJson(res, 500, { error: 'Trip data corruption' })
        }
      }

      // PUT /api/trips/:id
      if (req.method === 'PUT') {
        const existing = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId)
        if (!existing) {
          return sendJson(res, 404, { error: 'Trip not found' })
        }

        const updateData = body || {}
        const now = new Date().toISOString()
        const fullTrip = { ...updateData, id: tripId, updatedAt: now }
        const title = updateData.title || 'Untitled Trip'

        db.prepare(`
          UPDATE trips
          SET title = ?, data_json = ?, updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(title, JSON.stringify(fullTrip), now, tripId, userId)

        return sendJson(res, 200, { trip: fullTrip })
      }

      // DELETE /api/trips/:id
      if (req.method === 'DELETE') {
        const resDel = db.prepare('DELETE FROM trips WHERE id = ? AND user_id = ?').run(tripId, userId)
        if (resDel.changes === 0) {
          return sendJson(res, 404, { error: 'Trip not found' })
        }
        return sendJson(res, 200, { success: true })
      }
    }

    return null
  }
}
