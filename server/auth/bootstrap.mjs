import crypto from 'node:crypto'
import { hashPassword } from './password.mjs'

export async function bootstrapAdmin(db) {
  // Check if any admin exists
  const existingAdmin = db.prepare("SELECT id, email FROM users WHERE role = 'admin'").get()
  if (existingAdmin) {
    return { created: false, adminId: existingAdmin.id, email: existingAdmin.email }
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mytripplanner.local'
  let adminPassword = process.env.ADMIN_PASSWORD
  let mustChangePw = 0

  if (!adminPassword) {
    adminPassword = crypto.randomBytes(15).toString('base64url').slice(0, 20)
    mustChangePw = 1
    console.warn('\n============================================================')
    console.warn('[SECURITY NOTICE] No ADMIN_PASSWORD provided.')
    console.warn('A temporary admin password has been automatically generated:')
    console.warn(`Admin Email:    ${adminEmail}`)
    console.warn(`Admin Password: ${adminPassword}`)
    console.warn('Please log in at /admin/login and change your password immediately.')
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
