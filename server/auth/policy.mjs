/**
 * Central RBAC Access Policy Table
 * Default: DENY
 */

export const HTTP_POLICIES = [
  // Public authentication & health endpoints
  { method: 'GET', path: '/health', role: 'public' },
  { method: 'POST', path: '/api/auth/register', role: 'public' },
  { method: 'POST', path: '/api/auth/login', role: 'public' },
  { method: 'POST', path: '/api/auth/admin-login', role: 'public' },
  { method: 'POST', path: '/api/auth/logout', role: 'public' },
  { method: 'GET', path: '/api/auth/me', role: 'public' },

  // Public/shared lookup endpoints
  { method: 'GET', path: '/api/places/suggest', role: 'public' },
  { method: 'GET', path: '/api/places/resolve', role: 'public' },
  { method: 'GET', path: '/api/pricing/rates', role: 'public' },

  // Authenticated user endpoints (User or Admin)
  { method: 'PUT', path: '/api/auth/password', role: 'user' },
  { method: 'PUT', path: '/api/auth/profile', role: 'user' },
  { method: 'DELETE', path: '/api/auth/account', role: 'user' },

  // Trips CRUD (Row-level ownership enforced in handler: user can only see/mutate own trips)
  { method: 'GET', path: '/api/trips', role: 'user' },
  { method: 'POST', path: '/api/trips', role: 'user' },
  { method: 'GET', path: '/api/trips/:id', role: 'user' },
  { method: 'PUT', path: '/api/trips/:id', role: 'user' },
  { method: 'DELETE', path: '/api/trips/:id', role: 'user' },

  // Admin-only endpoints
  { method: 'GET', path: '/api/admin/overview', role: 'admin' },
  { method: 'GET', path: '/api/admin/users', role: 'admin' },
  { method: 'POST', path: '/api/admin/users/:id/status', role: 'admin' },
  { method: 'POST', path: '/api/admin/users/:id/reset-password', role: 'admin' },
  { method: 'DELETE', path: '/api/admin/users/:id', role: 'admin' },
  { method: 'GET', path: '/api/admin/trips', role: 'admin' },
  { method: 'GET', path: '/api/admin/settings', role: 'admin' },
  { method: 'POST', path: '/api/admin/settings', role: 'admin' },
  { method: 'GET', path: '/api/admin/audit', role: 'admin' },
  { method: 'POST', path: '/api/admin/cache/clear', role: 'admin' },
  { method: 'POST', path: '/api/admin/rates/refresh', role: 'admin' },
]

export const WS_POLICIES = {
  // Chat & agent execution: any authenticated user
  chat: 'user',
  stop: 'user',
  reset: 'user',
  status: 'user',

  // Admin configuration & inspection: admin only
  admin_get_config: 'admin',
  admin_set_config: 'admin',
  admin_test_keys: 'admin',
  admin_audit_query: 'admin',
}

export function checkWsMessagePermission(messageType, session) {
  const requiredRole = WS_POLICIES[messageType]
  if (!requiredRole) {
    // Unknown or unlisted messages default to DENY
    return { allowed: false, error: `Unauthorized message type: ${messageType}` }
  }

  if (!session || !session.user_id) {
    return { allowed: false, error: 'Authentication required' }
  }

  if (requiredRole === 'admin' && session.role !== 'admin') {
    return { allowed: false, error: 'Admin role required' }
  }

  return { allowed: true }
}
