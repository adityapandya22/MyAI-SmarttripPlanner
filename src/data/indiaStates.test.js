import { describe, it, expect } from 'vitest'
import { INDIA_STATES, INDIA_REGIONS } from './indiaStates'

describe('India States & UTs Dataset Validation', () => {
  it('contains exactly 36 entries (28 States + 8 Union Territories)', () => {
    expect(INDIA_STATES.length).toBe(36)
    const states = INDIA_STATES.filter((s) => s.type === 'State')
    const uts = INDIA_STATES.filter((s) => s.type === 'Union Territory')
    expect(states.length).toBe(28)
    expect(uts.length).toBe(8)
  })

  it('has no duplicate ids', () => {
    const ids = INDIA_STATES.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(INDIA_STATES.length)
  })

  it('has all required fields present for every state/UT', () => {
    for (const item of INDIA_STATES) {
      expect(item.id).toBeTruthy()
      expect(typeof item.id).toBe('string')
      expect(item.name).toBeTruthy()
      expect(typeof item.name).toBe('string')
      expect(item.capital).toBeTruthy()
      expect(typeof item.capital).toBe('string')
      expect(INDIA_REGIONS).toContain(item.region)
      expect(['State', 'Union Territory']).toContain(item.type)
      expect(item.coords).toBeDefined()
      expect(typeof item.coords.lat).toBe('number')
      expect(typeof item.coords.lng).toBe('number')
      expect(typeof item.suggestedDays).toBe('number')
      expect(item.suggestedDays).toBeGreaterThan(0)
      expect(item.tagline).toBeTruthy()
      expect(item.bestTime).toBeTruthy()
      expect(item.promptTemplate).toBeTruthy()
      expect(Array.isArray(item.topAttractions)).toBe(true)
      expect(item.topAttractions.length).toBeGreaterThan(0)
    }
  })

  it('verifies all coordinates fall within India bounding box (lat 6.0-37.5, lng 68.0-97.5)', () => {
    for (const item of INDIA_STATES) {
      const { lat, lng } = item.coords
      expect(lat).toBeGreaterThanOrEqual(6.0)
      expect(lat).toBeLessThanOrEqual(37.5)
      expect(lng).toBeGreaterThanOrEqual(68.0)
      expect(lng).toBeLessThanOrEqual(97.5)
    }
  })

  it('verifies Himachal Pradesh coordinates fall specifically in lat 30.4-33.2, lng 75.6-79.0', () => {
    const himachal = INDIA_STATES.find((s) => s.id === 'himachal-pradesh')
    expect(himachal).toBeDefined()
    expect(himachal.name).toBe('Himachal Pradesh')
    expect(himachal.coords.lat).toBeGreaterThanOrEqual(30.4)
    expect(himachal.coords.lat).toBeLessThanOrEqual(33.2)
    expect(himachal.coords.lng).toBeGreaterThanOrEqual(75.6)
    expect(himachal.coords.lng).toBeLessThanOrEqual(79.0)
  })
})
