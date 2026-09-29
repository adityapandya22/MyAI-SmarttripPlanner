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
        user: {
          id: session.user_id,
          email: session.email,
          displayName: session.display_name,
          role: session.role,
          homeCurrency: session.home_currency,
          locale: session.locale,
          mustChangePw: Boolean(session.must_change_pw),
        },
      })
    }

    // POST /api/auth/register
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const { email, password, displayName, homeCurrency, locale } = body || {}
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

      db.prepare(`
        INSERT INTO users (id, email, display_name, password_hash, role, home_currency, locale, is_active, created_at)
        VALUES (?, ?, ?, ?, 'user', ?, ?, 1, ?)
      `).run(
        userId,
        normalizedEmail,
        (displayName || '').trim() || 'Traveler',
        passwordHash,
        homeCurrency || 'INR',
        locale || 'en-IN',
        now
      )

      const newUser = { id: userId, role: 'user' }
      const { token: sessionToken } = createSession(db, newUser, clientIp, userAgent)
      const cookieHeader = serializeSessionCookie(sessionToken, 'user')

      return sendJson(
        res,
        201,
        {
          success: true,
          user: {
            id: userId,
            email: normalizedEmail,
            displayName: (displayName || '').trim() || 'Traveler',
            role: 'user',
            homeCurrency: homeCurrency || 'INR',
            locale: locale || 'en-IN',
          },
        },
        { 'Set-Cookie': cookieHeader }
      )
    }

    // POST /api/auth/login (Standard User Login)
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const { email, password } = body || {}
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

      // Rotate session: invalidate old session if one existed
      if (token) {
        destroySession(db, token)
      }

      const { token: sessionToken } = createSession(db, user, clientIp, userAgent)
      const cookieHeader = serializeSessionCookie(sessionToken, user.role)

      return sendJson(
        res,
        200,
        {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            role: user.role,
            homeCurrency: user.home_currency,
            locale: user.locale,
            mustChangePw: Boolean(user.must_change_pw),
          },
        },
        { 'Set-Cookie': cookieHeader }
      )
    }

    // POST /api/auth/admin-login (Dedicated Admin Surface)
    if (req.method === 'POST' && pathname === '/api/auth/admin-login') {
      const { email, password } = body || {}
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required' })
      }

      const normalizedEmail = email.trim().toLowerCase()
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail)

      // Generic failure if user doesn't exist or is not an admin
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
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            role: 'admin',
            homeCurrency: user.home_currency,
            locale: user.locale,
            mustChangePw: Boolean(user.must_change_pw),
          },
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

      // Rotate session upon password change
      destroySession(db, token)
      const { token: newToken } = createSession(db, user, clientIp, userAgent)
      const cookieHeader = serializeSessionCookie(newToken, user.role)

      return sendJson(res, 200, { success: true, message: 'Password updated successfully' }, { 'Set-Cookie': cookieHeader })
    }

    return null // Not handled by auth router
  }
}
