const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export function checkLockout(user) {
  if (!user) return { locked: false }
  if (user.locked_until) {
    const lockedUntil = new Date(user.locked_until)
    if (lockedUntil > new Date()) {
      return {
        locked: true,
        lockedUntil: user.locked_until,
        error: 'Account temporarily locked due to multiple failed login attempts. Please try again later.',
      }
    }
  }
  return { locked: false }
}

export function recordFailedLogin(db, user) {
  if (!user) return
  const failed = (user.failed_logins || 0) + 1
  let lockedUntil = null

  if (failed >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
  }

  db.prepare(`
    UPDATE users
    SET failed_logins = ?, locked_until = ?
    WHERE id = ?
  `).run(failed, lockedUntil, user.id)

  return { failed, lockedUntil }
}

export function resetFailedLogins(db, userId) {
  if (!userId) return
  db.prepare(`
    UPDATE users
    SET failed_logins = 0, locked_until = NULL
    WHERE id = ?
  `).run(userId)
}
