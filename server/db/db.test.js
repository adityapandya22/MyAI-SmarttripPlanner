import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, closeDb, getDb } from './index.mjs'
import { migrateFileTripsToDb } from './migrate-files.mjs'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Database & Migrations', () => {
  beforeEach(() => {
    initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  it('initializes in-memory database and creates all required tables', () => {
    const db = getDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name)

    expect(tables).toContain('users')
    expect(tables).toContain('sessions')
    expect(tables).toContain('trips')
    expect(tables).toContain('audit_log')
    expect(tables).toContain('settings')
    expect(tables).toContain('places_cache')
    expect(tables).toContain('fx_rates')
    expect(tables).toContain('_migrations')
  })

  it('enforces foreign key constraints on trips and sessions', () => {
    const db = getDb()
    expect(() => {
      db.prepare(`
        INSERT INTO trips (id, user_id, title, data_json, created_at, updated_at)
        VALUES ('trip-1', 'nonexistent-user', 'Test Trip', '{}', '2026-01-01', '2026-01-01')
      `).run()
    }).toThrow(/FOREIGN KEY/)

    expect(() => {
      db.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
        VALUES ('sess-1', 'nonexistent-user', 'hash-1', '2026-01-01', '2026-01-02')
      `).run()
    }).toThrow(/FOREIGN KEY/)
  })

  it('enforces role CHECK constraint on users table', () => {
    const db = getDb()
    expect(() => {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, created_at)
        VALUES ('u1', 'test@example.com', 'scrypt_hash', 'superadmin', '2026-01-01')
      `).run()
    }).toThrow(/CHECK constraint/)
  })

  it('migrates legacy file trips into database correctly', () => {
    const db = getDb()
    const tempDir = join(tmpdir(), 'ulisse-migrate-test-' + Date.now())
    const tripsDir = join(tempDir, 'trips')
    mkdirSync(tripsDir, { recursive: true })

    const sampleTrip = {
      id: 'goa-trip-1',
      title: 'Goa Coastal Adventure',
      days: [{ dayNumber: 1, theme: 'Beaches', items: [] }],
    }
    writeFileSync(join(tripsDir, 'goa--goa-trip-1.json'), JSON.stringify(sampleTrip))

    const res = migrateFileTripsToDb(db, tempDir, 'admin-1')
    expect(res.imported).toBe(1)

    const row = db.prepare('SELECT * FROM trips WHERE id = ?').get('goa-trip-1')
    expect(row).toBeDefined()
    expect(row.user_id).toBe('admin-1')
    expect(row.title).toBe('Goa Coastal Adventure')

    // Clean up
    rmSync(tempDir, { recursive: true, force: true })
  })
})
