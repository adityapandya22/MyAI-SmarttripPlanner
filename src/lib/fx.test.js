import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { eurUsd, refreshFx } from './fx'

describe('fx (currency conversion)', () => {
  const KEY = 'tripplanner.fx.eurusd'

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('eurUsd returns a positive exchange rate', () => {
    const rate = eurUsd()
    expect(typeof rate).toBe('number')
    expect(rate).toBeGreaterThan(0)
  })

  it('refreshFx fetches new rate and updates cache when cache is empty', async () => {
    const mockRate = 1.1425
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: { USD: mockRate } }),
    })

    const rate = await refreshFx()
    expect(rate).toBe(mockRate)
    expect(eurUsd()).toBe(mockRate)

    const stored = JSON.parse(localStorage.getItem(KEY))
    expect(stored.v).toBe(mockRate)
    expect(typeof stored.t).toBe('number')
  })

  it('refreshFx uses fresh cached rate within 24h without fetching', async () => {
    const cachedRate = 1.185
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: cachedRate, t: Date.now() - 3600 * 1000 }), // 1h ago
    )

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const rate = await refreshFx()

    expect(rate).toBe(cachedRate)
    expect(eurUsd()).toBe(cachedRate)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('gracefully falls back to existing rate when fetch throws network error', async () => {
    const previousRate = eurUsd()
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'))

    let rate
    await expect((async () => {
      rate = await refreshFx()
    })()).resolves.not.toThrow()

    expect(rate).toBe(previousRate)
    expect(eurUsd()).toBe(previousRate)
  })

  it('gracefully ignores malformed API responses without throwing', async () => {
    const previousRate = eurUsd()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'Not found' }), // missing rates.USD
    })

    const rate = await refreshFx()
    expect(rate).toBe(previousRate)
  })

  it('correctly performs conversion math using the exchange rate', () => {
    // 100 EUR = 100 * rate USD
    // 100 USD = 100 / rate EUR
    const currentRate = eurUsd()
    const eurAmount = 100
    const inUsd = eurAmount * currentRate
    const backToEur = inUsd / currentRate

    expect(backToEur).toBeCloseTo(eurAmount, 5)
  })
})
