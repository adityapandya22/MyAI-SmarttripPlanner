// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, apiRequest, ApiError } from './api'

describe('Central API Client (src/lib/api.js)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('always includes X-Requested-With, Accept, and credentials: include', async () => {
    let capturedUrl = null
    let capturedOptions = null

    global.fetch = vi.fn(async (url, opts) => {
      capturedUrl = url
      capturedOptions = opts
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      }
    })

    const res = await api.auth.me()

    expect(capturedUrl).toBe('/api/auth/me')
    expect(capturedOptions.method).toBe('GET')
    expect(capturedOptions.credentials).toBe('include')
    expect(capturedOptions.headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect(capturedOptions.headers['Accept']).toBe('application/json')
    expect(res).toEqual({ success: true })
  })

  it('sets Content-Type to application/json for POST bodies and serializes JSON', async () => {
    let capturedOptions = null

    global.fetch = vi.fn(async (url, opts) => {
      capturedOptions = opts
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, user: { email: 'traveler@example.com' } }),
      }
    })

    await api.auth.login('traveler@example.com', 'Pass1234!', true)

    expect(capturedOptions.method).toBe('POST')
    expect(capturedOptions.headers['Content-Type']).toBe('application/json')
    expect(capturedOptions.headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect(JSON.parse(capturedOptions.body)).toEqual({
      email: 'traveler@example.com',
      password: 'Pass1234!',
      rememberMe: true,
    })
  })

  it('extracts real server error messages on failed responses', async () => {
    global.fetch = vi.fn(async () => {
      return {
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'An account with this email already exists' }),
      }
    })

    await expect(api.auth.signup({ email: 'existing@example.com', password: 'Pass' }))
      .rejects.toThrow('An account with this email already exists')
  })

  it('supports trips and places domain helpers', async () => {
    global.fetch = vi.fn(async (url, opts) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ trips: [] }),
      }
    })

    const data = await api.trips.list()
    expect(data.trips).toEqual([])
  })
})
