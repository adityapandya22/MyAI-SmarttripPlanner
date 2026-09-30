import crypto from 'node:crypto'
import { hashPassword } from './password.mjs'

export async function bootstrapAdmin(db) {
  // Check if any admin exists
  const existingAdmin = db.prepare("SELECT id, email FROM users WHERE role = 'admin'").get()
  if (existingAdmin) {
    if (process.env.ADMIN_PASSWORD) {
      const hashedPassword = await hashPassword(process.env.ADMIN_PASSWORD)
      db.prepare("UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?").run(hashedPassword, existingAdmin.id)
    }
    return { created: false, adminId: existingAdmin.id, email: existingAdmin.email }
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@mytripplanner.local').trim().toLowerCase()
  let adminPassword = process.env.ADMIN_PASSWORD
  let mustChangePw = 0

  if (!adminPassword) {
    if (process.env.NODE_ENV === 'test') {
      adminPassword = crypto.randomBytes(15).toString('base64url').slice(0, 20)
      mustChangePw = 1
    } else {
      adminPassword = 'AdminPass2026!'
      mustChangePw = 0
    }
    console.warn('\n============================================================')
    console.warn('[ADMIN BOOTSTRAP] Initial administrator account created:')
    console.warn(`Admin Email:    ${adminEmail}`)
    console.warn(`Admin Password: ${adminPassword}`)
    console.warn('============================================================\n')
  }

  const hashedPassword = await hashPassword(adminPassword)
  const adminId = 'admin-' + crypto.randomUUID().slice(0, 8)
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, role, home_currency, locale, is_active, must_change_pw, created_at)
    VALUES (?, ?, 'Administrator', ?, 'admin', 'INR', 'en-IN', 1, ?, ?)
  `).run(adminId, adminEmail, hashedPassword, mustChangePw, now)

  // Log in audit_log
  db.prepare(`
    INSERT INTO audit_log (id, actor_user_id, action, target, meta_json, ip, created_at)
    VALUES (?, ?, 'bootstrap_admin', ?, ?, '127.0.0.1', ?)
  `).run(
    crypto.randomUUID(),
    adminId,
    adminEmail,
    JSON.stringify({ note: 'Initial bootstrap admin account created' }),
    now
  )

  return { created: true, adminId, email: adminEmail, generatedPassword: mustChangePw ? adminPassword : null }
}

export async function bootstrapDemoUser(db) {
  const email = 'traveler@example.com'
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    if (process.env.DEMO_USER_PASSWORD) {
      const passwordHash = await hashPassword(process.env.DEMO_USER_PASSWORD)
      db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?').run(passwordHash, existing.id)
    }
    return { created: false, id: existing.id, email }
  }

  const userId = 'usr-demo-traveler'
  const password = process.env.DEMO_USER_PASSWORD || 'Traveler123!'
  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO users (
      id, email, display_name, password_hash, role,
      home_currency, locale, is_active, phone, home_city,
      travel_style, budget_pref, preferences_json, created_at
    ) VALUES (?, ?, 'Aarav Sharma', ?, 'user', 'INR', 'en-IN', 1, '+91 98765 43210', 'Mumbai', 'adventure', 'medium', ?, ?)
  `).run(
    userId,
    email,
    passwordHash,
    JSON.stringify({ foodPreference: 'vegetarian', preferredCurrency: 'INR', pace: 'moderate' }),
    now
  )

  // Seed initial sample trip for the demo user if missing
  const sampleTripId = 'trip-himachal-demo'
  const existingTrip = db.prepare('SELECT id FROM trips WHERE id = ?').get(sampleTripId)
  if (!existingTrip) {
    const sampleTrip = {
      id: sampleTripId,
      title: 'Himachal Mountain Escape',
      subtitle: 'Scenic Himalayan viewpoints, valleys and cafe trails',
      startDate: '2026-10-15',
      phase: 'active',
      currency: 'INR',
      days: [
        {
          id: 'day-1',
          title: 'Arrival in Manali & Old Manali Cafes',
          night: 'Manali',
          color: '#4f46e5',
          items: [
            { id: 'act-1', type: 'activity', title: 'Hadimba Devi Temple', time: '10:00', dur: 90, price: 100, lat: 32.2483, lng: 77.1802 },
            { id: 'act-2', type: 'food', title: 'Old Manali Cafe Trail & Trout Lunch', time: '13:00', dur: 90, price: 800, lat: 32.2541, lng: 77.1754 },
            { id: 'act-3', type: 'hotel', title: 'Himalayan River Resort', time: '18:00', dur: 60, price: 4200, lat: 32.2432, lng: 77.1892 }
          ]
        },
        {
          id: 'day-2',
          title: 'Solang Valley & Rohtang Pass Drive',
          night: 'Manali',
          color: '#059669',
          items: [
            { id: 'act-4', type: 'activity', title: 'Solang Valley Paragliding', time: '09:30', dur: 180, price: 2500, lat: 32.3167, lng: 77.1583 },
            { id: 'act-5', type: 'drive', title: 'Atal Tunnel Drive', time: '14:00', dur: 120, price: 500, lat: 32.3667, lng: 77.1400 }
          ]
        }
      ],
      checklist: [
        { id: 'c-1', text: 'Pack warm windproof jackets', done: true },
        { id: 'c-2', text: 'Confirm Solang Valley adventure permit', done: false }
      ],
      suggestions: []
    }

    db.prepare(`
      INSERT INTO trips (id, user_id, title, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sampleTrip.id, userId, sampleTrip.title, JSON.stringify(sampleTrip), now, now)
  }

  return { created: true, id: userId, email }
}
