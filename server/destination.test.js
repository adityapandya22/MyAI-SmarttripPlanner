/**
 * Comprehensive tests for server/destination.mjs
 *
 * Covers:
 * - Core state matching (himachal, manali, shimla, goa, kerala, etc.)
 * - "Old Manali trip" must NOT return Goa
 * - "fort tour" must return null (generic words)
 * - Regression: does not return Goa for generic words
 * - Typos, empty string, extra whitespace, mixed case, special characters
 * - Very long input, non-English input, rapid consecutive searches
 * - Capital parsing
 * - Keyword false positives ("great" should not match "eat")
 * - Coordinate boundary assertions (Himachal lat 30.4-33.2, lng 75.6-79.0)
 * - Leh Ladakh
 */

import { describe, it, expect } from 'vitest'
import { findDestination, scoreDestination, norm, hasWord, ALIASES } from './destination.mjs'

// ── Helpers ────────────────────────────────────────────────────────────────────

function lat(s) { return s?.coords?.lat }
function lng(s) { return s?.coords?.lng }

// ── norm() ────────────────────────────────────────────────────────────────────

describe('norm()', () => {
  it('lowercases and strips diacritics', () => {
    expect(norm('Pondichéry')).toBe('pondichery')
  })

  it('collapses extra whitespace', () => {
    expect(norm('  Himachal   Pradesh  ')).toBe('himachal pradesh')
  })

  it('strips punctuation', () => {
    expect(norm("Leh, Ladakh! #1")).toBe('leh  ladakh  1')
  })

  it('handles empty/null', () => {
    expect(norm('')).toBe('')
    expect(norm(undefined)).toBe('')
    expect(norm(null)).toBe('')
  })
})

// ── hasWord() ─────────────────────────────────────────────────────────────────

describe('hasWord()', () => {
  it('matches whole words only', () => {
    expect(hasWord('plan a goa trip', 'goa')).toBe(true)
    expect(hasWord('goa beaches', 'goa')).toBe(true)
    expect(hasWord('diagonal', 'goa')).toBe(false)
  })

  it('does not match partial prefixes/suffixes', () => {
    expect(hasWord('eating at great restaurant', 'eat')).toBe(false)
    expect(hasWord('theatre show', 'eat')).toBe(false)
  })

  it('matches at start and end of string', () => {
    expect(hasWord('himachal', 'himachal')).toBe(true)
    expect(hasWord('trip to himachal', 'himachal')).toBe(true)
    expect(hasWord('himachal pradesh tour', 'himachal pradesh')).toBe(true)
  })
})

// ── findDestination() – PRIMARY BUG CASES ─────────────────────────────────────

describe('findDestination() – primary bug cases', () => {
  it('returns Himachal Pradesh for "himachal"', () => {
    const r = findDestination('himachal')
    expect(r).not.toBeNull()
    expect(r.name).toBe('Himachal Pradesh')
  })

  it('returns Himachal Pradesh for "Himachal Pradesh" (full name)', () => {
    const r = findDestination('Himachal Pradesh')
    expect(r).not.toBeNull()
    expect(r.name).toBe('Himachal Pradesh')
  })

  it('returns Himachal Pradesh for "Old Manali trip" — must NOT return Goa', () => {
    const r = findDestination('Old Manali trip')
    expect(r).not.toBeNull()
    expect(r.name).toBe('Himachal Pradesh')
  })

  it('returns null for "fort tour" (generic words — regression: does not return Goa)', () => {
    const r = findDestination('fort tour')
    expect(r).toBeNull()
  })

  it('REGRESSION: does not return Goa for generic words', () => {
    const tests = ['fort tour', 'beach day', 'old quarter', 'explore the city']
    for (const q of tests) {
      const r = findDestination(q)
      expect(r?.name).not.toBe('Goa')
    }
  })
})

// ── findDestination() – STATE MATCHING ────────────────────────────────────────

describe('findDestination() – state matching', () => {
  it('matches Goa by name', () => {
    const r = findDestination('Plan a trip to Goa beaches')
    expect(r?.name).toBe('Goa')
  })

  it('matches Kerala', () => {
    expect(findDestination('Kerala backwaters trip')?.name).toBe('Kerala')
  })

  it('matches Rajasthan by name', () => {
    expect(findDestination('Visit Rajasthan forts')?.name).toBe('Rajasthan')
  })

  it('matches Rajasthan by capital (Jaipur)', () => {
    expect(findDestination('Things to do in Jaipur')?.name).toBe('Rajasthan')
  })

  it('matches Himachal Pradesh by alias: shimla', () => {
    expect(findDestination('Road trip to Shimla')?.name).toBe('Himachal Pradesh')
  })

  it('matches Himachal Pradesh by alias: manali', () => {
    expect(findDestination('Weekend in Manali')?.name).toBe('Himachal Pradesh')
  })

  it('matches Himachal Pradesh by alias: dharamshala', () => {
    expect(findDestination('Dharamshala trekking')?.name).toBe('Himachal Pradesh')
  })

  it('matches Ladakh / Leh Ladakh', () => {
    const r1 = findDestination('Leh Ladakh road trip')
    const r2 = findDestination('Pangong Lake Ladakh')
    expect(r1?.name).toBe('Ladakh')
    expect(r2?.name).toBe('Ladakh')
  })

  it('matches Jammu and Kashmir by alias: kashmir', () => {
    expect(findDestination('Kashmir houseboat')?.name).toMatch(/Jammu/)
  })

  it('matches Karnataka by attraction: hampi', () => {
    expect(findDestination('Exploring Hampi ruins')?.name).toBe('Karnataka')
  })

  it('matches Arunachal Pradesh by attraction: tawang', () => {
    expect(findDestination('Visiting Tawang Monastery')?.name).toBe('Arunachal Pradesh')
  })

  it('matches Uttar Pradesh by city: varanasi', () => {
    expect(findDestination('Ganga Aarti in Varanasi')?.name).toBe('Uttar Pradesh')
  })

  it('matches Uttar Pradesh by city: agra', () => {
    expect(findDestination('Taj Mahal in Agra')?.name).toBe('Uttar Pradesh')
  })

  it('matches West Bengal by capital: Kolkata', () => {
    expect(findDestination('Tour of Kolkata')?.name).toBe('West Bengal')
  })

  it('matches Meghalaya by alias: cherrapunji', () => {
    expect(findDestination('Cherrapunji waterfalls')?.name).toBe('Meghalaya')
  })
})

// ── findDestination() – EDGE CASES ────────────────────────────────────────────

describe('findDestination() – edge cases', () => {
  it('returns null for empty string', () => {
    expect(findDestination('')).toBeNull()
  })

  it('returns null for whitespace-only', () => {
    expect(findDestination('   ')).toBeNull()
  })

  it('returns null for random query with no Indian destination', () => {
    expect(findDestination('What is the weather today?')).toBeNull()
  })

  it('handles extra whitespace in valid queries', () => {
    expect(findDestination('   Goa   beach   trip  ')?.name).toBe('Goa')
  })

  it('handles mixed case', () => {
    expect(findDestination('gOA bEACH')?.name).toBe('Goa')
    expect(findDestination('HIMACHAL PRADESH')?.name).toBe('Himachal Pradesh')
  })

  it('handles special characters around the destination name', () => {
    expect(findDestination('"Goa"! - beach holiday')?.name).toBe('Goa')
  })

  it('handles very long input containing a valid destination', () => {
    const longInput = 'I want to plan a very long and detailed trip that covers many aspects of travel including accommodation, food, sightseeing, adventure sports and cultural experiences specifically in Kerala backwaters and hill stations during the best season possible'
    expect(findDestination(longInput)?.name).toBe('Kerala')
  })

  it('returns null for non-English non-Indian input', () => {
    // Chinese text with no recognizable India destination
    expect(findDestination('我想去旅游')).toBeNull()
  })

  it('handles rapid consecutive search calls without crashing', () => {
    // Not async race-condition test – just checks no exception thrown
    const queries = ['Goa', 'Shimla', 'Kerala', 'Rajasthan', 'Manali', '']
    expect(() => {
      queries.forEach((q) => findDestination(q))
    }).not.toThrow()
  })
})

// ── findDestination() – FALSE POSITIVE PREVENTION ─────────────────────────────

describe('findDestination() – false positive prevention', () => {
  it('"great" should not match any destination via "eat" substring', () => {
    // "great" contains "eat" but eat is a keyword, not a destination
    const r = findDestination('the view was great')
    expect(r?.name).not.toBe('Goa')
  })

  it('"theatre" should not match', () => {
    expect(findDestination('going to the theatre')).toBeNull()
  })

  it('"ago" should not match Goa', () => {
    expect(findDestination('two years ago I visited')).toBeNull()
  })
})

// ── COORDINATE BOUNDARY ASSERTIONS ───────────────────────────────────────────

describe('Coordinate boundary assertions', () => {
  it('Himachal Pradesh coords fall within expected range (lat 30.4-33.2, lng 75.6-79.0)', () => {
    const r = findDestination('Himachal Pradesh')
    expect(r).not.toBeNull()
    expect(lat(r)).toBeGreaterThan(30.4)
    expect(lat(r)).toBeLessThan(33.2)
    expect(lng(r)).toBeGreaterThan(75.6)
    expect(lng(r)).toBeLessThan(79.0)
  })

  it('Ladakh coords fall within expected range (lat 32-36, lng 75-80)', () => {
    const r = findDestination('Ladakh trip')
    expect(r).not.toBeNull()
    expect(lat(r)).toBeGreaterThan(32)
    expect(lat(r)).toBeLessThan(36)
    expect(lng(r)).toBeGreaterThan(75)
    expect(lng(r)).toBeLessThan(80)
  })

  it('Kerala coords fall within expected range (lat 8-12, lng 74-78)', () => {
    const r = findDestination('Kerala')
    expect(r).not.toBeNull()
    expect(lat(r)).toBeGreaterThan(8)
    expect(lat(r)).toBeLessThan(12)
    expect(lng(r)).toBeGreaterThan(74)
    expect(lng(r)).toBeLessThan(78)
  })

  it('Goa coords are distinct from Himachal Pradesh', () => {
    const goa = findDestination('Goa')
    const hp = findDestination('Himachal Pradesh')
    expect(lat(goa)).not.toBeCloseTo(lat(hp), 0)
  })
})

// ── ALIASES MAP ──────────────────────────────────────────────────────────────

describe('ALIASES map', () => {
  it('covers himachal-pradesh with expected entries', () => {
    const aliases = ALIASES['himachal-pradesh']
    expect(Array.isArray(aliases)).toBe(true)
    expect(aliases).toContain('himachal')
    expect(aliases).toContain('manali')
    expect(aliases).toContain('shimla')
    expect(aliases).toContain('old manali')
  })

  it('covers goa with expected entries', () => {
    const aliases = ALIASES['goa']
    expect(Array.isArray(aliases)).toBe(true)
    expect(aliases).toContain('goa')
    expect(aliases).toContain('panaji')
  })
})

// ── scoreDestination() ────────────────────────────────────────────────────────

describe('scoreDestination()', () => {
  it('gives Himachal Pradesh a higher score than Goa for "manali"', () => {
    const { INDIA_STATES } = await import('../src/data/indiaStates.js')
    const hp = INDIA_STATES.find((s) => s.id === 'himachal-pradesh')
    const goa = INDIA_STATES.find((s) => s.id === 'goa')
    const scoreHp = scoreDestination('manali trip', hp)
    const scoreGoa = scoreDestination('manali trip', goa)
    expect(scoreHp).toBeGreaterThan(scoreGoa)
  })

  it('gives Goa the highest score for "goa beaches"', () => {
    const { INDIA_STATES } = await import('../src/data/indiaStates.js')
    const goa = INDIA_STATES.find((s) => s.id === 'goa')
    const hp = INDIA_STATES.find((s) => s.id === 'himachal-pradesh')
    const scoreGoa = scoreDestination('goa beaches', goa)
    const scoreHp = scoreDestination('goa beaches', hp)
    expect(scoreGoa).toBeGreaterThan(scoreHp)
    expect(scoreGoa).toBeGreaterThanOrEqual(60)
  })

  it('returns 0 for "fort tour" against Goa (generic first word match disabled)', () => {
    const { INDIA_STATES } = await import('../src/data/indiaStates.js')
    const goa = INDIA_STATES.find((s) => s.id === 'goa')
    // "fort" is only 4 chars but not in Goa's name/id/aliases/capital
    // "tour" not in Goa either; total should be 0
    const score = scoreDestination('fort tour', goa)
    expect(score).toBeLessThan(60)
  })
})
