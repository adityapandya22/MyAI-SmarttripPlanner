// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createAuthRouter } from './routes.mjs'
import { createTripRouter } from '../trips/routes.mjs'
import { initDb, closeDb } from '../db/index.mjs'

function createMockRes() {
  let statusCode = 200
  let headers = {}
  let body = ''

  return {
    writeHead(code, h = {}) {
      statusCode = code
      headers = { ...headers, ...h }
    },
    setHeader(k, v) {
      headers[k] = v
    },
    end(data) {
      if (data) body += data
    },
    get statusCode() {
      return statusCode
    },
    get headers() {
      return headers
    },
    json() {
      return body ? JSON.parse(body) : null
    },
  }
}

describe('Feature 1: Customer Login, Auth, Profile & Data Isolation', () => {
  let db
  let authRouter
  let tripRouter
  const dbPath = path.join(process.cwd(), 'server', 'db', 'test_customer_auth.db')

  beforeEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    db = initDb(dbPath)
    authRouter = createAuthRouter(db)
    tripRouter = createTripRouter(db)
  })

  afterEach(() => {
    closeDb()
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('1. validates registration fields and creates customer profile', async () => {
    const resFailEmail = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      resFailEmail,
      '/api/auth/register',
      { email: 'bad-email', password: 'ValidPassword123!' }
    )
    expect(resFailEmail.statusCode).toBe(400)
    expect(resFailEmail.json().error).toMatch(/valid email/)

    const resFailPw = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      resFailPw,
      '/api/auth/register',
      { email: 'user@example.com', password: 'short' }
    )
    expect(resFailPw.statusCode).toBe(400)

    // Successful registration
    const resSuccess = createMockRes()
    await authRouter(
      { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } },
      resSuccess,
      '/api/auth/register',
      {
        fullName: 'Aarav Sharma',
        email: 'aarav@example.com',
        phone: '+91 9876543210',
        homeCity: 'Mumbai',
        travelStyle: 'adventure',
        budgetPref: 'luxury',
        password: 'AaravSecurePass2026!',
      }
    )
    expect(resSuccess.statusCode).toBe(201)
    const user = resSuccess.json().user
    expect(user.displayName).toBe('Aarav Sharma')
    expect(user.email).toBe('aarav@example.com')
    expect(user.phone).toBe('+91 9876543210')
    expect(user.homeCity).toBe('Mumbai')
    expect(user.travelStyle).toBe('adventure')
    expect(user.budgetPref).toBe('luxury')
    expect(resSuccess.headers['Set-Cookie']).toMatch(/sid=[a-f0-9]{64}/)
  })

  it('2. customer login with rememberMe creates persistent session', async () => {
    // Register user first
    const regRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      regRes,
      '/api/auth/register',
      {
        fullName: 'Pooja Verma',
        email: 'pooja@example.com',
        password: 'PoojaPassword123!',
      }
    )
    expect(regRes.statusCode).toBe(201)

    // Login with rememberMe = true
    const loginRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } },
      loginRes,
      '/api/auth/login',
      {
        email: 'pooja@example.com',
        password: 'PoojaPassword123!',
        rememberMe: true,
      }
    )
    expect(loginRes.statusCode).toBe(200)
    expect(loginRes.json().success).toBe(true)
    const cookie = loginRes.headers['Set-Cookie']
    expect(cookie).toMatch(/sid=([a-f0-9]{64})/)
    // 30 days session
    expect(cookie).toMatch(/Max-Age=2592000/)

    const token = cookie.match(/sid=([a-f0-9]{64})/)[1]

    // Verify session persistence via /api/auth/me
    const meRes = createMockRes()
    await authRouter(
      { method: 'GET', headers: { cookie: `sid=${token}` } },
      meRes,
      '/api/auth/me',
      null
    )
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().authenticated).toBe(true)
    expect(meRes.json().user.email).toBe('pooja@example.com')
  })

  it('3. updates customer profile and changes password securely', async () => {
    // Register
    const regRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      regRes,
      '/api/auth/register',
      {
        fullName: 'Karan Patel',
        email: 'karan@example.com',
        password: 'KaranOldPassword123!',
      }
    )
    const token = regRes.headers['Set-Cookie'].match(/sid=([a-f0-9]{64})/)[1]

    // Update profile
    const putProfileRes = createMockRes()
    await authRouter(
      { method: 'PUT', headers: { cookie: `sid=${token}` } },
      putProfileRes,
      '/api/auth/profile',
      {
        name: 'Karan J. Patel',
        phone: '+91 9988776655',
        homeCity: 'Ahmedabad',
        travelStyle: 'cultural',
        budgetPref: 'medium',
        avatarUrl: 'https://example.com/karan.jpg',
      }
    )
    expect(putProfileRes.statusCode).toBe(200)
    const updated = putProfileRes.json().user
    expect(updated.displayName).toBe('Karan J. Patel')
    expect(updated.phone).toBe('+91 9988776655')
    expect(updated.homeCity).toBe('Ahmedabad')
    expect(updated.travelStyle).toBe('cultural')
    expect(updated.avatarUrl).toBe('https://example.com/karan.jpg')

    // Change password
    const pwRes = createMockRes()
    await authRouter(
      { method: 'PUT', headers: { cookie: `sid=${token}` } },
      pwRes,
      '/api/auth/password',
      {
        currentPassword: 'KaranOldPassword123!',
        newPassword: 'KaranNewPassword987!',
      }
    )
    expect(pwRes.statusCode).toBe(200)
    expect(pwRes.json().success).toBe(true)

    // Old password should fail login
    const failLoginRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      failLoginRes,
      '/api/auth/login',
      { email: 'karan@example.com', password: 'KaranOldPassword123!' }
    )
    expect(failLoginRes.statusCode).toBe(401)

    // New password succeeds
    const okLoginRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      okLoginRes,
      '/api/auth/login',
      { email: 'karan@example.com', password: 'KaranNewPassword987!' }
    )
    expect(okLoginRes.statusCode).toBe(200)
  })

  it('4. strictly isolates trips per user (userId ownership)', async () => {
    // Register User A
    const regA = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      regA,
      '/api/auth/register',
      { fullName: 'User A', email: 'usera@example.com', password: 'PasswordUserA1!' }
    )
    const tokenA = regA.headers['Set-Cookie'].match(/sid=([a-f0-9]{64})/)[1]

    // Register User B
    const regB = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      regB,
      '/api/auth/register',
      { fullName: 'User B', email: 'userb@example.com', password: 'PasswordUserB2!' }
    )
    const tokenB = regB.headers['Set-Cookie'].match(/sid=([a-f0-9]{64})/)[1]

    // User A creates a trip
    const createTripRes = createMockRes()
    await tripRouter(
      { method: 'POST', headers: { cookie: `sid=${tokenA}` } },
      createTripRes,
      '/api/trips',
      { id: 'trip-alpha', title: 'Secret Himachal Mountain Trip', days: [] }
    )
    expect(createTripRes.statusCode).toBe(201)

    // User B tries to read User A's trip -> MUST return 404 Not Found
    const readByB = createMockRes()
    await tripRouter(
      { method: 'GET', headers: { cookie: `sid=${tokenB}` } },
      readByB,
      '/api/trips/trip-alpha',
      null
    )
    expect(readByB.statusCode).toBe(404)

    // User B tries to update User A's trip -> MUST return 404
    const editByB = createMockRes()
    await tripRouter(
      { method: 'PUT', headers: { cookie: `sid=${tokenB}` } },
      editByB,
      '/api/trips/trip-alpha',
      { title: 'Hacked Trip Title' }
    )
    expect(editByB.statusCode).toBe(404)

    // User B tries to delete User A's trip -> MUST return 404
    const delByB = createMockRes()
    await tripRouter(
      { method: 'DELETE', headers: { cookie: `sid=${tokenB}` } },
      delByB,
      '/api/trips/trip-alpha',
      null
    )
    expect(delByB.statusCode).toBe(404)

    // User B's trip list should be empty
    const listB = createMockRes()
    await tripRouter(
      { method: 'GET', headers: { cookie: `sid=${tokenB}` } },
      listB,
      '/api/trips',
      null
    )
    expect(listB.statusCode).toBe(200)
    expect(listB.json().trips).toHaveLength(0)

    // User A's trip list should have exactly their 1 trip
    const listA = createMockRes()
    await tripRouter(
      { method: 'GET', headers: { cookie: `sid=${tokenA}` } },
      listA,
      '/api/trips',
      null
    )
    expect(listA.statusCode).toBe(200)
    expect(listA.json().trips).toHaveLength(1)
    expect(listA.json().trips[0].title).toBe('Secret Himachal Mountain Trip')
  })

  it('5. handles duplicate signup, wrong password, and logout lifecycle', async () => {
    // Register
    const regRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      regRes,
      '/api/auth/register',
      { fullName: 'Test User', email: 'testflow@example.com', password: 'ValidPassword123!' }
    )
    expect(regRes.statusCode).toBe(201)

    // Duplicate signup should fail with 409
    const dupRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      dupRes,
      '/api/auth/register',
      { fullName: 'Test User', email: 'testflow@example.com', password: 'ValidPassword123!' }
    )
    expect(dupRes.statusCode).toBe(409)
    expect(dupRes.json().error).toMatch(/already exists/)

    // Wrong password should fail with 401
    const badPwRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      badPwRes,
      '/api/auth/login',
      { email: 'testflow@example.com', password: 'WrongPassword999!' }
    )
    expect(badPwRes.statusCode).toBe(401)
    expect(badPwRes.json().error).toMatch(/Invalid email or password/)

    // Correct password login succeeds
    const okLoginRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } },
      okLoginRes,
      '/api/auth/login',
      { email: 'testflow@example.com', password: 'ValidPassword123!' }
    )
    expect(okLoginRes.statusCode).toBe(200)
    expect(okLoginRes.json().success).toBe(true)
    const token = okLoginRes.headers['Set-Cookie'].match(/sid=([a-f0-9]{64})/)[1]

    // Logout destroys session and clears cookie
    const logoutRes = createMockRes()
    await authRouter(
      { method: 'POST', headers: { cookie: `sid=${token}` } },
      logoutRes,
      '/api/auth/logout',
      null
    )
    expect(logoutRes.statusCode).toBe(200)
    expect(logoutRes.headers['Set-Cookie']).toMatch(/Max-Age=0/)

    // Subsequent /api/auth/me should return authenticated: false
    const meRes = createMockRes()
    await authRouter(
      { method: 'GET', headers: { cookie: `sid=${token}` } },
      meRes,
      '/api/auth/me',
      null
    )
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().authenticated).toBe(false)
  })

  it('6. protects admin endpoints with role check (user gets 403, admin gets 200)', async () => {
    const { createAdminRouter } = await import('../admin/routes.mjs')
    const adminRouter = createAdminRouter(db)

    // Register a standard user
    const userReg = createMockRes()
    await authRouter(
      { method: 'POST', headers: {} },
      userReg,
      '/api/auth/register',
      { fullName: 'Standard Traveler', email: 'regular@example.com', password: 'TravelerPass123!' }
    )
    const userToken = userReg.headers['Set-Cookie'].match(/sid=([a-f0-9]{64})/)[1]

    // Normal user attempts to access admin overview -> 403 Forbidden
    const userOverviewRes = createMockRes()
    await adminRouter(
      { method: 'GET', headers: { cookie: `sid=${userToken}` } },
      userOverviewRes,
      '/api/admin/overview',
      null
    )
    expect(userOverviewRes.statusCode).toBe(403)
    expect(userOverviewRes.json().error).toMatch(/Administrator access required/)

    // Create an admin user directly
    const { hashPassword } = await import('./password.mjs')
    const { createSession } = await import('./session.mjs')
    const adminHash = await hashPassword('AdminPassSecret2026!')
    db.prepare(`
      INSERT INTO users (id, email, display_name, password_hash, role, is_active, created_at)
      VALUES ('admin-test-id', 'admin@example.com', 'Admin User', ?, 'admin', 1, ?)
    `).run(adminHash, new Date().toISOString())

    const adminSession = createSession(db, { id: 'admin-test-id', role: 'admin' })

    // Admin accesses overview -> 200 OK
    const adminOverviewRes = createMockRes()
    await adminRouter(
      { method: 'GET', headers: { cookie: `sid=${adminSession.token}` } },
      adminOverviewRes,
      '/api/admin/overview',
      null
    )
    expect(adminOverviewRes.statusCode).toBe(200)
    expect(adminOverviewRes.json().stats).toBeDefined()
  })

  it('7. seeds demo user traveler@example.com and admin on startup', async () => {
    const { bootstrapAdmin, bootstrapDemoUser } = await import('./bootstrap.mjs')
    const adminRes = await bootstrapAdmin(db)
    expect(adminRes.created).toBe(true)

    const demoRes = await bootstrapDemoUser(db)
    expect(demoRes.created).toBe(true)
    expect(demoRes.email).toBe('traveler@example.com')

    const demoUser = db.prepare('SELECT * FROM users WHERE email = ?').get('traveler@example.com')
    expect(demoUser).toBeDefined()
    expect(demoUser.role).toBe('user')

    // Confirm sample trips seeded for demo user
    const sampleTrip = db.prepare('SELECT * FROM trips WHERE user_id = ?').get(demoUser.id)
    expect(sampleTrip).toBeDefined()
    expect(sampleTrip.title).toBe('Himachal Mountain Escape')
  })
})

