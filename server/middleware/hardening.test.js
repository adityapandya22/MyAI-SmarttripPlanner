import { describe, it, expect } from 'vitest'
import { applySecurityHeaders } from './headers.mjs'
import { RateLimiter } from './rateLimit.mjs'
import { attachRequestId, handleServerError } from './errorHandler.mjs'
import { RegisterSchema, LoginSchema, AdminSettingsSchema, validateSchema } from './validation.mjs'
import { searchHotels } from '../booking.mjs'
import { searchRestaurants } from '../places.mjs'

function createMockRes() {
  const headers = {}
  return {
    statusCode: 200,
    headers,
    setHeader(name, value) {
      headers[name] = value
    },
    writeHead(status, hdrs = {}) {
      this.statusCode = status
      Object.assign(headers, hdrs)
    },
    end(data) {
      this.data = data
    },
  }
}

describe('PART 3 — Server Hardening & Security Middleware', () => {
  describe('Security Headers', () => {
    it('sets CSP, nosniff, DENY frame options, and permissions policy', () => {
      const res = createMockRes()
      applySecurityHeaders(res)

      expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
      expect(res.headers['X-Frame-Options']).toBe('DENY')
      expect(res.headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
      expect(res.headers['Permissions-Policy']).toContain('camera=()')
      expect(res.headers['Content-Security-Policy']).toContain("default-src 'self'")
      expect(res.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'")
    })
  })

  describe('Rate Limiter', () => {
    it('enforces maximum request limits within time window', () => {
      const limiter = new RateLimiter({ windowMs: 1000, max: 3, name: 'test' })
      const key = '192.168.1.1'

      expect(limiter.consume(key).allowed).toBe(true)
      expect(limiter.consume(key).allowed).toBe(true)
      expect(limiter.consume(key).allowed).toBe(true)

      const blocked = limiter.consume(key)
      expect(blocked.allowed).toBe(false)
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Error Handling & Request IDs', () => {
    it('attaches unique X-Request-Id header to incoming requests', () => {
      const req = { headers: {} }
      const res = createMockRes()
      const reqId = attachRequestId(req, res)

      expect(reqId).toBeDefined()
      expect(req.id).toBe(reqId)
      expect(res.headers['X-Request-Id']).toBe(reqId)
    })

    it('returns sanitized error response with request ID', () => {
      const req = { id: 'test-req-123', method: 'GET', url: '/api/test' }
      const res = createMockRes()
      const clientErr = new Error('Invalid query parameter')
      clientErr.statusCode = 400

      handleServerError(clientErr, req, res)
      expect(res.statusCode).toBe(400)
      const parsed = JSON.parse(res.data)
      expect(parsed.error).toBe('Invalid query parameter')
      expect(parsed.requestId).toBe('test-req-123')
    })
  })

  describe('Zod Input Validation', () => {
    it('validates registration input properly and returns detailed errors on invalid data', () => {
      const invalid = validateSchema(RegisterSchema, {
        email: 'not-an-email',
        password: 'short',
      })
      expect(invalid.valid).toBe(false)
      expect(invalid.details.email).toBeDefined()
      expect(invalid.details.password).toBeDefined()

      const valid = validateSchema(RegisterSchema, {
        email: 'traveler@test.com',
        password: 'StrongValidPassword123!',
        homeCurrency: 'EUR',
      })
      expect(valid.valid).toBe(true)
    })

    it('validates login and settings schemas', () => {
      expect(validateSchema(LoginSchema, { email: 'user@test.com', password: 'pw' }).valid).toBe(true)
      expect(validateSchema(LoginSchema, { email: 'bad' }).valid).toBe(false)

      expect(validateSchema(AdminSettingsSchema, { key: 'GEMINI_KEY', value: '123' }).valid).toBe(true)
      expect(validateSchema(AdminSettingsSchema, { key: '', value: '123' }).valid).toBe(false)
    })
  })

  describe('Scraper Gating', () => {
    it('disables Booking.com scraping by default when ULISSE_ENABLE_SCRAPERS is not 1', async () => {
      const originalEnv = process.env.ULISSE_ENABLE_SCRAPERS
      delete process.env.ULISSE_ENABLE_SCRAPERS

      const result = await searchHotels({
        location: 'Rome',
        checkin: '2026-10-01',
        checkout: '2026-10-05',
      })

      expect(result.properties).toEqual([])
      expect(result.hint).toContain('ULISSE_ENABLE_SCRAPERS=1')
      process.env.ULISSE_ENABLE_SCRAPERS = originalEnv
    })

    it('disables Google Maps restaurant scraping by default when ULISSE_ENABLE_SCRAPERS is not 1', async () => {
      const originalEnv = process.env.ULISSE_ENABLE_SCRAPERS
      delete process.env.ULISSE_ENABLE_SCRAPERS

      const result = await searchRestaurants({
        location: 'Rome',
        query: 'pasta',
      })

      expect(result.restaurants).toEqual([])
      expect(result.hint).toContain('ULISSE_ENABLE_SCRAPERS=1')
      process.env.ULISSE_ENABLE_SCRAPERS = originalEnv
    })
  })
})
