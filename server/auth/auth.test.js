import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hashPassword, verifyPassword, validatePasswordStrength } from './password.mjs'
import { encryptData, decryptData, maskSecret } from './crypto.mjs'
import { initDb, closeDb } from '../db/index.mjs'
import { createSession, getSession, destroySession } from './session.mjs'
import { checkLockout, recordFailedLogin, resetFailedLogins } from './lockout.mjs'
import { isOriginAllowed, verifyCsrf } from './csrf.mjs'
import { checkWsMessagePermission } from './policy.mjs'
import { bootstrapAdmin } from './bootstrap.mjs'
import { createAuthRouter } from './routes.mjs'
import { createTripRouter } from '../trips/routes.mjs'
import { createAdminRouter } from '../admin/routes.mjs'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Mock HTTP response helper
function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(code, headers = {}) {
      this.statusCode = code
      Object.assign(this.headers, headers)
    },
    end(chunk) {
      if (chunk) this.body += chunk
    },
    json() {
      return JSON.parse(this.body || '{}')
    },
  }
}

describe('PART 2 — Server-Side Authentication & Hardening', () => {
  let db

  beforeEach(() => {
    db = initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  describe('Password Hashing & Strength', () => {
    it('hashes passwords using scrypt and verifies correctly', async () => {
      const password = 'StrongTravelerPassword2026!'
      const hash = await hashPassword(password)
      expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/)

      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)

      const isInvalid = await verifyPassword('WrongPassword123!', hash)
      expect(isInvalid).toBe(false)
    })

    it('rejects passwords shorter than 10 characters or common passwords', () => {
      expect(validatePasswordStrength('short').valid).toBe(false)
      expect(validatePasswordStrength('password123').valid).toBe(false)
      expect(validatePasswordStrength('admin12345').valid).toBe(false)
      expect(validatePasswordStrength('ValidSecurePassphrase2026').valid).toBe(true)
    })
  })

  describe('Crypto & Encryption', () => {
    it('encrypts and decrypts sensitive settings via AES-256-GCM', () => {
      const apiKey = 'sk-ant-api03-abcdef123456789'
      const encrypted = encryptData(apiKey)
      expect(encrypted).not.toBe(apiKey)
      expect(encrypted.split(':')).toHaveLength(3)

      const decrypted = decryptData(encrypted)
      expect(decrypted).toBe(apiKey)
    })

    it('masks sensitive secrets showing only the last 4 characters', () => {
      expect(maskSecret('secret123456')).toBe('...3456')
      expect(maskSecret('key')).toBe('****')
      expect(maskSecret('')).toBe('')
    })
  })

  describe('Account Lockout Protection', () => {
    it('locks account after 5 consecutive failed attempts', () => {
      const userId = 'u-lockout-test'
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, created_at)
        VALUES (?, 'locked@test.com', 'scrypt_placeholder', 'user', ?)
      `).run(userId, new Date().toISOString())

      let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
      expect(checkLockout(user).locked).toBe(false)

      for (let i = 1; i <= 4; i++) {
        recordFailedLogin(db, user)
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
        expect(checkLockout(user).locked).toBe(false)
      }

      // 5th failed attempt triggers 15-minute lock
      recordFailedLogin(db, user)
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
      const lockStatus = checkLockout(user)
      expect(lockStatus.locked).toBe(true)
      expect(lockStatus.error).toContain('temporarily locked')

      // Reset unlocks immediately
      resetFailedLogins(db, userId)
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
      expect(checkLockout(user).locked).toBe(false)
    })
  })

  describe('Session Management & Auth Router', () => {
    it('creates DB session with hashed token and sliding expiry', () => {
      const user = { id: 'user-1', role: 'user' }
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, created_at)
        VALUES ('user-1', 'u1@test.com', 'hash', 'user', ?)
      `).run(new Date().toISOString())

      const { token } = createSession(db, user, '127.0.0.1')
      expect(token).toHaveLength(64)

      const session = getSession(db, token)
      expect(session).toBeDefined()
      expect(session.user_id).toBe('user-1')
      expect(session.role).toBe('user')

      destroySession(db, token)
      expect(getSession(db, token)).toBeNull()
    })

    it('exercises user registration, login, and profile retrieval via createAuthRouter', async () => {
      const authRouter = createAuthRouter(db)
      const regRes = createMockRes()
      await authRouter(
        { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } },
        regRes,
        '/api/auth/register',
        {
          email: 'traveler@world.example',
          password: 'SuperSecretTripPass2026!',
          displayName: 'Explorer Alice',
          homeCurrency: 'USD',
        }
      )

      expect(regRes.statusCode).toBe(201)
      expect(regRes.json().success).toBe(true)
      const setCookie = regRes.headers['Set-Cookie']
      expect(setCookie).toMatch(/sid=[a-f0-9]{64}/)
      const token = setCookie.match(/sid=([a-f0-9]{64})/)[1]

      // Verify /api/auth/me returns active session
      const meRes = createMockRes()
      await authRouter({ method: 'GET', headers: { cookie: `sid=${token}` } }, meRes, '/api/auth/me', null)
      expect(meRes.statusCode).toBe(200)
      expect(meRes.json().authenticated).toBe(true)
      expect(meRes.json().user.email).toBe('traveler@world.example')
    })
  })

  describe('CSRF & Origin Verification', () => {
    it('allows valid local and configured origins, rejects unauthorized origins', () => {
      expect(isOriginAllowed('http://localhost:5200', 5200)).toBe(true)
      expect(isOriginAllowed('http://127.0.0.1:5200', 5200)).toBe(true)
      expect(isOriginAllowed('http://localhost:5173', 5200)).toBe(true)
      expect(isOriginAllowed('https://evil.example.com', 5200)).toBe(false)
    })

    it('requires X-Requested-With header on state-changing methods', () => {
      const reqGet = { method: 'GET', headers: {} }
      expect(verifyCsrf(reqGet, 5200).ok).toBe(true)

      const reqPostNoHeader = { method: 'POST', headers: {} }
      expect(verifyCsrf(reqPostNoHeader, 5200).ok).toBe(false)

      const reqPostEvilOrigin = {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch', origin: 'https://evil.example.com' },
      }
      expect(verifyCsrf(reqPostEvilOrigin, 5200).ok).toBe(false)

      const reqPostValid = {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch', origin: 'http://localhost:5200' },
      }
      expect(verifyCsrf(reqPostValid, 5200).ok).toBe(true)
    })
  })

  describe('RBAC & Policy', () => {
    it('enforces role check on WebSocket messages', () => {
      const userSession = { user_id: 'u1', role: 'user' }
      const adminSession = { user_id: 'a1', role: 'admin' }

      // Chat allowed for normal user and admin
      expect(checkWsMessagePermission('chat', userSession).allowed).toBe(true)
      expect(checkWsMessagePermission('chat', adminSession).allowed).toBe(true)

      // Admin config rejected for normal user, allowed for admin
      const userForbidden = checkWsMessagePermission('admin_set_config', userSession)
      expect(userForbidden.allowed).toBe(false)
      expect(userForbidden.error).toContain('Admin role required')

      expect(checkWsMessagePermission('admin_set_config', adminSession).allowed).toBe(true)
    })
  })

  describe('Row-Level Ownership Isolation', () => {
    it('prevents User A from reading, editing, or deleting User B trips (returns 404)', async () => {
      const tripRouter = createTripRouter(db)
      const now = new Date().toISOString()

      // Insert User A and User B
      db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES ('userA', 'a@test.com', 'h', 'user', ?)").run(now)
      db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES ('userB', 'b@test.com', 'h', 'user', ?)").run(now)

      const sessA = createSession(db, { id: 'userA', role: 'user' })
      const sessB = createSession(db, { id: 'userB', role: 'user' })

      // User A creates a trip
      const reqCreate = {
        method: 'POST',
        headers: { cookie: `sid=${sessA.token}` },
      }
      const resCreate = createMockRes()
      await tripRouter(reqCreate, resCreate, '/api/trips', { title: 'Trip of User A' })
      expect(resCreate.statusCode).toBe(201)
      const tripId = resCreate.json().trip.id

      // User B attempts to GET User A's trip -> returns 404
      const reqGetB = {
        method: 'GET',
        headers: { cookie: `sid=${sessB.token}` },
      }
      const resGetB = createMockRes()
      await tripRouter(reqGetB, resGetB, `/api/trips/${tripId}`, null)
      expect(resGetB.statusCode).toBe(404)

      // User B attempts to DELETE User A's trip -> returns 404
      const reqDelB = {
        method: 'DELETE',
        headers: { cookie: `sid=${sessB.token}` },
      }
      const resDelB = createMockRes()
      await tripRouter(reqDelB, resDelB, `/api/trips/${tripId}`, null)
      expect(resDelB.statusCode).toBe(404)

      // User A can successfully retrieve own trip
      const reqGetA = {
        method: 'GET',
        headers: { cookie: `sid=${sessA.token}` },
      }
      const resGetA = createMockRes()
      await tripRouter(reqGetA, resGetA, `/api/trips/${tripId}`, null)
      expect(resGetA.statusCode).toBe(200)
      expect(resGetA.json().trip.title).toBe('Trip of User A')
    })
  })

  describe('First Admin Bootstrap & Last Admin Protection', () => {
    it('bootstraps first admin without hardcoded credentials', async () => {
      const res = await bootstrapAdmin(db)
      expect(res.created).toBe(true)
      expect(res.adminId).toBeDefined()

      const admin = db.prepare("SELECT * FROM users WHERE role = 'admin'").get()
      expect(admin).toBeDefined()
    })

    it('protects against deleting the last remaining admin', async () => {
      const adminRouter = createAdminRouter(db)
      const now = new Date().toISOString()
      db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES ('admin1', 'adm@test.com', 'h', 'admin', ?)").run(now)
      db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES ('admin2', 'adm2@test.com', 'h', 'admin', ?)").run(now)

      const sessAdmin1 = createSession(db, { id: 'admin1', role: 'admin' })

      // Admin 1 deletes Admin 2 -> allowed (there are 2 admins)
      const reqDel = { method: 'DELETE', headers: { cookie: `sid=${sessAdmin1.token}` } }
      const resDel = createMockRes()
      await adminRouter(reqDel, resDel, '/api/admin/users/admin2', null)
      expect(resDel.statusCode).toBe(200)

      // Attempting to delete the last admin -> 400 rejection
      const resDelLast = createMockRes()
      await adminRouter(reqDel, resDelLast, '/api/admin/users/admin1', null)
      // Cannot delete self or last admin
      expect(resDelLast.statusCode).toBe(400)
    })
  })

  describe('No Hardcoded Credentials in Codebase', () => {
    it('verifies that admin123 does not exist in src/ or server/ (excluding test/password checks)', () => {
      function checkDir(dir) {
        const entries = readdirSync(dir)
        for (const entry of entries) {
          const fullPath = join(dir, entry)
          const stat = statSync(fullPath)
          if (stat.isDirectory()) {
            if (entry !== 'node_modules' && entry !== '.git' && entry !== 'dist') {
              checkDir(fullPath)
            }
          } else if (/\.(jsx?|mjs|tsx?)$/.test(entry) && !entry.endsWith('auth.test.js') && !entry.endsWith('password.mjs')) {
            const content = readFileSync(fullPath, 'utf8')
            expect(content).not.toContain('admin123')
          }
        }
      }

      checkDir(join(process.cwd(), 'src'))
      checkDir(join(process.cwd(), 'server'))
    })
  })
})
