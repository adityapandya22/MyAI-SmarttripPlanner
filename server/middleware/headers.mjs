export function applySecurityHeaders(res) {
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://upload.wikimedia.org https://commons.wikimedia.org",
    "connect-src 'self' ws: wss: https://*.tile.openstreetmap.org https://photon.komoot.io https://nominatim.openstreetmap.org https://api.open-meteo.com https://router.project-osrm.org https://frankfurter.dev https://api.frankfurter.dev https://open.er-api.com",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')

  res.setHeader('Content-Security-Policy', csp)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}
