import crypto from 'node:crypto'
import { hashPassword, verifyPassword, validatePasswordStrength } from './password.mjs'
import {
  createSession,
  getSession,
  destroySession,
  parseCookies,
  serializeSessionCookie,
  serializeClearSessionCookie,
} from './session.mjs'
import { checkLockout, recordFailedLogin, resetFailedLogins } from './lockout.mjs'

function sendJson(res, statusCode, data, headers = {}) {
  const payload = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

function formatUserResponse(user) {
  let prefs = {}
  if (user.preferences_json) {
    try {
      prefs = JSON.parse(user.preferences_json)
    } catch {
      prefs = {}
    }
  }
  return {
    id: user.id || user.user_id,
    email: user.email,
    displayName: user.display_name || 'Traveler',
    name: user.display_name || 'Traveler',
    role: user.role || 'user',
    phone: user.phone || '',
    homeCity: user.home_city || '',
    travelStyle: user.travel_style || 'balanced',
    budgetPref: user.budget_pref || 'medium',
    avatarUrl: user.avatar_url || '',
    homeCurrency: user.home_currency || 'INR',
    locale: user.locale || 'en-IN',
    preferences: prefs,
    mustChangePw: Boolean(user.must_change_pw),
    createdAt: user.created_at || null,
  }
}

export function createAuthRouter(db) {
  return async function handleAuthRoute(req, res, pathname, body) {
    const cookies = parseCookies(req.headers.cookie)
    const token = cookies.sid
    const session = getSession(db, token)
    const clientIp = req.socket?.remoteAddress || '127.0.0.1'
    const userAgent = req.headers['user-agent'] || ''

    // GET /api/auth/me
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      if (!session) {
        return sendJson(res, 200, { authenticated: false, user: null })
      }
      return sendJson(res, 200, {
        authenticated: true,
        user: formatUserResponse(session),
      })
    }

    // POST /api/auth/register
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const {
        email,
        password,
        displayName,
        fullName,
        name,
        phone,
        homeCity,
        travelStyle,
        budgetPref,
        homeCurrency,
        locale,
        preferences,
      } = body || {}

      const resolvedName = (fullName || displayName || name || '').trim() || 'Traveler'

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return sendJson(res, 400, { error: 'A valid email address is required' })
      }

      const pwCheck = validatePasswordStrength(password)
      if (!pwCheck.valid) {
        return sendJson(res, 400, { error: pwCheck.error })
      }

      const normalizedEmail = email.trim().toLowerCase()
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)
      if (existing) {
        return sendJson(res, 409, { error: 'An account with this email already exists' })
      }

      const passwordHash = await hashPassword(password)
      const userId = 'usr-' + crypto.randomUUID().slice(0, 8)
      const now = new Date().toISOString()
      const prefJson = preferences ? JSON.stringify(preferences) : null

      db.prepare(`
        INSERT INTO users (
          id, email, display_name, password_hash, role, home_currency, locale,
          is_active, phone, home_city, travel_style, budget_pref, preferences_json, created_at
        ) VALUES (?, ?, ?, ?, 'user', ?, ?, 1, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        normalizedEmail,
        resolvedName,
        passwordHash,
        homeCurrency || 'INR',
        locale || 'en-IN',
        phone ? String(phone).trim() : null,
        homeCity ? String(homeCity).trim() : null,
        travelStyle || 'balanced',
        budgetPref || 'medium',
        prefJson,
        now
      )

      const newUser = { id: userId, role: 'user' }
      const { token: sessionToken, ttlMs } = createSession(db, newUser, clientIp, userAgent)
      const cookieHeader = serializeSessionCookie(sessionToken, 'user', false, ttlMs)

      const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)

      return sendJson(
        res,
        201,
        {
          success: true,
          user: formatUserResponse(createdUser),
        },
        { 'Set-Cookie': cookieHeader }
      )
    }

    // POST /api/auth/login (Standard Customer Login)
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const { email, password, rememberMe } = body || {}
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required' })
      }

      const normalizedEmail = email.trim().toLowerCase()
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail)

      if (!user) {
        return sendJson(res, 401, { error: 'Invalid email or password' })
      }

      const lockout = checkLockout(user)
      if (lockout.locked) {
        return sendJson(res, 429, { error: lockout.error })
      }

      const valid = await verifyPassword(password, user.password_hash)
      if (!valid) {
        recordFailedLogin(db, user)
        return sendJson(res, 401, { error: 'Invalid email or password' })
      }

      if (!user.is_active) {
        return sendJson(res, 403, { error: 'Account has been disabled' })
      }

      resetFailedLogins(db, user.id)

      if (token) {
        destroySession(db, token)
      }

      // 30 days for rememberMe, 24 hours otherwise
      const sessionTtlMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
      const { token: sessionToken, ttlMs } = createSession(db, user, clientIp, userAgent, sessionTtlMs)
      const cookieHeader = serializeSessionCookie(sessionToken, user.role, false, ttlMs)

      return sendJson(
        res,
        200,
        {
          success: true,
          user: formatUserResponse(user),
        },
        { 'Set-Cookie': cookieHeader }
      )
    }

    // POST /api/auth/google (Continue with Google Integration)
    if (req.method === 'POST' && pathname === '/api/auth/google') {
      const { email, name, avatarUrl } = body || {}
      const targetEmail = (email || 'google.traveler@example.com').trim().toLowerCase()
      const targetName = (name || 'Google Traveler').trim()

      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(targetEmail)
      if (!user) {
        const userId = 'usr-g-' + crypto.randomUUID().slice(0, 8)
        const dummyPw = await hashPassword(crypto.randomUUID())
        const now = new Date().toISOString()
        db.prepare(`
          INSERT INTO users (
            id, email, display_name, password_hash, role, home_currency, locale,
            is_active, avatar_url, created_at
          ) VALUES (?, ?, ?, ?, 'user', 'INR', 'en-IN', 1, ?, ?)
        `).run(userId, targetEmail, targetName, dummyPw, avatarUrl || null, now)
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
      }

      if (token) {
        destroySession(db, token)
      }

      const { token: sessionToken, ttlMs } = createSession(db, user, clientIp, userAgent, 30 * 24 * 60 * 60 * 1000)
      const cookieHeader = serializeSessionCookie(sessionToken, user.role, false, ttlMs)

      return sendJson(
        res,
        200,
        {
          success: true,
          user: formatUserResponse(user),
        },
        { 'Set-Cookie': cookieHeader }
      )
    }

    // POST /api/auth/forgot-password
    if (req.method === 'POST' && pathname === '/api/auth/forgot-password') {
      const { email } = body || {}
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return sendJson(res, 400, { error: 'Please enter a valid email address' })
      }
      return sendJson(res, 200, {
        success: true,
        message: 'If an account exists with this email, password reset instructions have been sent.',
      })
    }

    // GET /api/auth/profile
    if (req.method === 'GET' && pathname === '/api/auth/profile') {
      if (!session) {
        return sendJson(res, 401, { error: 'Authentication required' })
      }
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id)
      if (!user) {
        return sendJson(res, 404, { error: 'User not found' })
      }
      return sendJson(res, 200, {
        user: formatUserResponse(user),
      })
    }

    // PUT /api/auth/profile (Update Customer Profile)
    if (req.method === 'PUT' && pathname === '/api/auth/profile') {
      if (!session) {
        return sendJson(res, 401, { error: 'Authentication required' })
      }

      const {
        displayName,
        name,
        phone,
        homeCity,
        travelStyle,
        budgetPref,
        avatarUrl,
        preferences,
      } = body || {}

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id)
      if (!user) {
        return sendJson(res, 404, { error: 'User not found' })
      }

      const newName = (displayName || name !== undefined ? (displayName || name) : user.display_name)?.trim() || user.display_name
      const newPhone = phone !== undefined ? String(phone).trim() : user.phone
      const newCity = homeCity !== undefined ? String(homeCity).trim() : user.home_city
      const newStyle = travelStyle !== undefined ? travelStyle : user.travel_style
      const newBudget = budgetPref !== undefined ? budgetPref : user.budget_pref
      const newAvatar = avatarUrl !== undefined ? avatarUrl : user.avatar_url
      const newPrefs = preferences !== undefined ? JSON.stringify(preferences) : user.preferences_json

      db.prepare(`
        UPDATE users
        SET display_name = ?,
            phone = ?,
            home_city = ?,
            travel_style = ?,
            budget_pref = ?,
            avatar_url = ?,
            preferences_json = ?
        WHERE id = ?
      `).run(newName, newPhone, newCity, newStyle, newBudget, newAvatar, newPrefs, session.user_id)

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id)

      return sendJson(res, 200, {
        success: true,
        user: formatUserResponse(updated),
      })
    }

    // POST /api/auth/admin-login (Dedicated Admin Surface)
    if (req.method === 'POST' && pathname === '/api/auth/admin-login') {
      const { email, password } = body || {}
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required' })
      }

      const normalizedEmail = email.trim().toLowerCase()
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail)

      if (!user || user.role !== 'admin') {
        if (user) recordFailedLogin(db, user)
        return sendJson(res, 401, { error: 'Invalid administrator credentials' })
      }

      const lockout = checkLockout(user)
      if (lockout.locked) {
        return sendJson(res, 429, { error: lockout.error })
      }

      const valid = await verifyPassword(password, user.password_hash)
      if (!valid) {
        recordFailedLogin(db, user)
        return sendJson(res, 401, { error: 'Invalid administrator credentials' })
      }

      if (!user.is_active) {
        return sendJson(res, 403, { error: 'Admin account has been disabled' })
      }

      resetFailedLogins(db, user.id)

      if (token) {
        destroySession(db, token)
      }

      const { token: sessionToken } = createSession(db, user, clientIp, userAgent)
      const cookieHeader = serializeSessionCookie(sessionToken, 'admin')

      return sendJson(
        res,
        200,
        {
          success: true,
          user: formatUserResponse(user),
        },
        { 'Set-Cookie': cookieHeader }
      )
    }

    // POST /api/auth/logout
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      if (token) {
        destroySession(db, token)
      }
      return sendJson(res, 200, { success: true }, { 'Set-Cookie': serializeClearSessionCookie() })
    }

    // PUT /api/auth/password (User or Admin password update)
    if (req.method === 'PUT' && pathname === '/api/auth/password') {
      if (!session) {
        return sendJson(res, 401, { error: 'Authentication required' })
      }

      const { currentPassword, newPassword } = body || {}
      if (!currentPassword || !newPassword) {
        return sendJson(res, 400, { error: 'Current password and new password are required' })
      }

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id)
      const valid = await verifyPassword(currentPassword, user.password_hash)
      if (!valid) {
        return sendJson(res, 400, { error: 'Current password is incorrect' })
      }

      const pwCheck = validatePasswordStrength(newPassword)
      if (!pwCheck.valid) {
        return sendJson(res, 400, { error: pwCheck.error })
      }

      const newHash = await hashPassword(newPassword)
      db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?').run(
        newHash,
        session.user_id
      )

      destroySession(db, token)
      const { token: newToken } = createSession(db, user, clientIp, userAgent)
      const cookieHeader = serializeSessionCookie(newToken, user.role)

      return sendJson(res, 200, { success: true, message: 'Password updated successfully' }, { 'Set-Cookie': cookieHeader })
    }

    return null
  }
}

