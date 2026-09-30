/**
 * Database Seed Script for MyAI-SmarttripPlanner.
 * Populates demo customer accounts, preferences, and sample customer trips.
 *
 * Run with: node server/db/seed.mjs
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { initDb } from './index.mjs'
import { runMigrations } from './migrate.mjs'
import { hashPassword } from '../auth/password.mjs'

const dataDir = process.env.ULISSE_DATA_DIR || join(homedir(), 'Documents', 'Ulisse')
const dbPath = process.env.DB_PATH || join(dataDir, 'ulisse.db')

console.log(`[seed] Initializing database at ${dbPath}...`)
const db = initDb(dbPath)
const migrationsApplied = runMigrations(db)
console.log(`[seed] Migrations applied: ${migrationsApplied}`)

async function seed() {
  const customerId = 'usr-demo-customer'
  const customerEmail = 'traveler@example.com'
  const customerPassword = 'Traveler123!'
  const passwordHash = await hashPassword(customerPassword)
  const now = new Date().toISOString()

  const existingCustomer = db.prepare('SELECT id FROM users WHERE email = ?').get(customerEmail)
  if (existingCustomer) {
    console.log(`[seed] Demo user ${customerEmail} already exists. Updating credentials...`)
    db.prepare(`
      UPDATE users
      SET display_name = ?,
          password_hash = ?,
          phone = ?,
          home_city = ?,
          travel_style = ?,
          budget_pref = ?,
          preferences_json = ?,
          is_active = 1
      WHERE id = ?
    `).run(
      'Aarav Sharma',
      passwordHash,
      '+91 98765 43210',
      'Mumbai',
      'adventure',
      'medium',
      JSON.stringify({ foodPreference: 'vegetarian', preferredCurrency: 'INR', pace: 'moderate' }),
      existingCustomer.id
    )
  } else {
    console.log(`[seed] Creating demo customer: ${customerEmail}`)
    db.prepare(`
      INSERT INTO users (
        id, email, display_name, password_hash, role,
        home_currency, locale, is_active, phone, home_city,
        travel_style, budget_pref, preferences_json, created_at
      ) VALUES (?, ?, ?, ?, 'user', 'INR', 'en-IN', 1, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      customerEmail,
      'Aarav Sharma',
      passwordHash,
      '+91 98765 43210',
      'Mumbai',
      'adventure',
      'medium',
      JSON.stringify({ foodPreference: 'vegetarian', preferredCurrency: 'INR', pace: 'moderate' }),
      now
    )
  }

  // Seed sample trips linked to customer
  const targetUserId = existingCustomer ? existingCustomer.id : customerId
  const trip1Id = 'trip-himachal-demo'
  const trip2Id = 'trip-goa-demo'

  const sampleTrip1 = {
    id: trip1Id,
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

  const sampleTrip2 = {
    id: trip2Id,
    title: 'Sunny Goa Coastal Retreat',
    subtitle: 'Sunsets, Portuguese heritage & beachside shacks',
    startDate: '2026-11-20',
    phase: 'active',
    currency: 'INR',
    days: [
      {
        id: 'day-g1',
        title: 'North Goa Beaches & Sunset',
        night: 'Anjuna',
        color: '#f59e0b',
        items: [
          { id: 'act-g1', type: 'activity', title: 'Anjuna Flea Market & Beach Walk', time: '11:00', dur: 120, price: 300, lat: 15.5733, lng: 73.7411 },
          { id: 'act-g2', type: 'food', title: 'Curlies Beach Shack Dinner', time: '19:00', dur: 120, price: 1500, lat: 15.5689, lng: 73.7425 }
        ]
      }
    ],
    checklist: [
      { id: 'c-g1', text: 'Rent a scooter at Dabolim airport', done: true }
    ],
    suggestions: []
  }

  const upsertTrip = (trip) => {
    const existing = db.prepare('SELECT id FROM trips WHERE id = ?').get(trip.id)
    if (existing) {
      db.prepare('UPDATE trips SET user_id = ?, title = ?, data_json = ?, updated_at = ? WHERE id = ?')
        .run(targetUserId, trip.title, JSON.stringify(trip), now, trip.id)
    } else {
      db.prepare('INSERT INTO trips (id, user_id, title, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(trip.id, targetUserId, trip.title, JSON.stringify(trip), now, now)
    }
  }

  upsertTrip(sampleTrip1)
  upsertTrip(sampleTrip2)

  console.log('============================================================')
  console.log('[seed] Database seeded successfully!')
  console.log('Customer Email:    ' + customerEmail)
  console.log('Customer Password: ' + customerPassword)
  console.log('Sample Trips:      2 trips linked to ' + customerEmail)
  console.log('============================================================')
}

seed().catch((err) => {
  console.error('[seed] Error seeding database:', err)
  process.exit(1)
})
