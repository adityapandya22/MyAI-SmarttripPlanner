export function getAllowedOrigins(port = 5200) {
  const vitePort = Number(process.env.VITE_PORT || 5199)
  const allowed = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
<<<<<<< HEAD
    `http://localhost:5199`,
    `http://127.0.0.1:5199`,
    `http://localhost:5173`,
    `http://127.0.0.1:5173`,
    `https://localhost:${port}`,
    `https://127.0.0.1:${port}`,
    `https://localhost:5199`,
    `https://127.0.0.1:5199`,
=======
    `https://localhost:${port}`,
    `https://127.0.0.1:${port}`,
    // Vite dev server ports
    'http://localhost:5199',
    'http://127.0.0.1:5199',
    `http://localhost:${vitePort}`,
    `http://127.0.0.1:${vitePort}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    // Site preview ports
    'http://localhost:5300',
    'http://127.0.0.1:5300',
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
  ])

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((origin) => allowed.add(origin))
  }

  return allowed
}

export function isOriginAllowed(origin, port = 5200) {
  if (!origin) return false
  const allowed = getAllowedOrigins(port)
  return allowed.has(origin)
}

export function verifyCsrf(req, port = 5200) {
  const method = req.method?.toUpperCase()
  // Safe HTTP methods do not require CSRF header check
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { ok: true }
  }

  // 1. Verify custom anti-CSRF header
  const xRequestedWith = req.headers['x-requested-with']
  if (xRequestedWith !== 'fetch' && xRequestedWith !== 'XMLHttpRequest') {
    return { ok: false, status: 403, error: 'Missing or invalid X-Requested-With header' }
  }

  // 2. Verify Origin header if present
  const origin = req.headers['origin']
  if (origin && !isOriginAllowed(origin, port)) {
    return { ok: false, status: 403, error: 'Origin not allowed' }
  }

  return { ok: true }
}
