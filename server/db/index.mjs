import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { runMigrations } from './migrate.mjs'

let dbInstance = null
let currentDbPath = null

export function initDb(dbPath = ':memory:') {
  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance
  }

  if (dbInstance) {
    try {
      dbInstance.close()
    } catch {
      // ignore
    }
    dbInstance = null
  }

  if (dbPath !== ':memory:') {
    const dir = join(dbPath, '..')
    mkdirSync(dir, { recursive: true })
  }

  const db = new DatabaseSync(dbPath)
  // Enable foreign key constraints
  db.exec('PRAGMA foreign_keys = ON;')
  if (dbPath !== ':memory:') {
    try {
      db.exec('PRAGMA journal_mode = WAL;')
    } catch {
      // WAL might not be supported on all file systems, ignore if fails
    }
  }

  runMigrations(db)
  dbInstance = db
  currentDbPath = dbPath
  return dbInstance
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return dbInstance
}

export function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close()
    } catch {
      // ignore
    }
    dbInstance = null
    currentDbPath = null
  }
}
