import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')

export function runMigrations(db) {
  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const appliedRows = db.prepare('SELECT id FROM _migrations').all()
  const appliedSet = new Set(appliedRows.map((r) => r.id))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const insertMigration = db.prepare(
    'INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)'
  )

  let count = 0
  for (const file of files) {
    const migrationId = file.replace(/\.sql$/, '')
    if (!appliedSet.has(migrationId)) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      db.exec(sql)
      insertMigration.run(migrationId, file, new Date().toISOString())
      count++
    }
  }

  return count
}
