import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function migrateFileTripsToDb(db, dataDir, defaultUserId = 'local-user') {
  const tripsDir = join(dataDir, 'trips')
  if (!existsSync(tripsDir)) {
    return { imported: 0, skipped: 0 }
  }

  // Ensure default user exists if not already present
  const checkUser = db.prepare('SELECT id FROM users WHERE id = ?').get(defaultUserId)
  if (!checkUser) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, display_name, password_hash, role, home_currency, locale, is_active, created_at)
      VALUES (?, ?, ?, ?, 'admin', 'INR', 'en-IN', 1, ?)
    `).run(
      defaultUserId,
      'admin@mytripplanner.local',
      'Local Administrator',
      'bootstrap_scrypt_placeholder',
      new Date().toISOString()
    )
  }

  const files = readdirSync(tripsDir).filter((f) => f.endsWith('.json'))
  const checkTrip = db.prepare('SELECT id FROM trips WHERE id = ?')
  const insertTrip = db.prepare(`
    INSERT INTO trips (id, user_id, title, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  let imported = 0
  let skipped = 0

  for (const file of files) {
    try {
      const fullPath = join(tripsDir, file)
      const raw = readFileSync(fullPath, 'utf8')
      const trip = JSON.parse(raw)
      const tripId = trip.id || file.replace(/\.json$/, '').split('--').pop()
      const title = trip.title || 'Untitled Trip'

      if (checkTrip.get(tripId)) {
        skipped++
        continue
      }

      const now = new Date().toISOString()
      insertTrip.run(tripId, defaultUserId, title, JSON.stringify(trip), trip.createdAt || now, trip.updatedAt || now)
      imported++
    } catch {
      skipped++
    }
  }

  return { imported, skipped }
}
