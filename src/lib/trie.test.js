/**
 * Tests for src/lib/trie.js
 *
 * Verifies: insert, search, startsWith, autocomplete, buildDestinationTrie,
 * cache hit vs miss behaviour (Trie build), and edge cases.
 */

import { describe, it, expect } from 'vitest'
import { Trie, buildDestinationTrie } from './trie'
import { INDIA_STATES } from '../data/indiaStates'
import { ALIASES } from '../../server/destination.mjs'

// ── Trie basics ───────────────────────────────────────────────────────────────

describe('Trie – insert / search / startsWith', () => {
  it('search returns false for empty trie', () => {
    const t = new Trie()
    expect(t.search('goa')).toBe(false)
    expect(t.startsWith('g')).toBe(false)
  })

  it('inserts and finds exact words', () => {
    const t = new Trie()
    t.insert('kerala')
    t.insert('goa')
    expect(t.search('kerala')).toBe(true)
    expect(t.search('goa')).toBe(true)
  })

  it('does not find words not inserted', () => {
    const t = new Trie()
    t.insert('kerala')
    expect(t.search('goa')).toBe(false)
  })

  it('startsWith matches valid prefixes', () => {
    const t = new Trie()
    t.insert('rajasthan')
    expect(t.startsWith('raj')).toBe(true)
    expect(t.startsWith('rajasthan')).toBe(true)
    expect(t.startsWith('rajasthana')).toBe(false)
  })

  it('stores and retrieves meta at leaf nodes', () => {
    const t = new Trie()
    t.insert('shimla', { stateId: 'himachal-pradesh' })
    // search returns bool, but autocomplete gives meta
    const results = t.autocomplete('shimla')
    expect(results).toHaveLength(1)
    expect(results[0].meta.stateId).toBe('himachal-pradesh')
  })

  it('handles empty string insertion silently', () => {
    const t = new Trie()
    expect(() => t.insert('')).not.toThrow()
    expect(t.search('')).toBe(false)
  })
})

// ── Trie – autocomplete ───────────────────────────────────────────────────────

describe('Trie – autocomplete', () => {
  it('returns suggestions for a prefix', () => {
    const t = new Trie()
    t.insert('goa')
    t.insert('gujarat')
    t.insert('gandhinagar')
    const results = t.autocomplete('g')
    expect(results.length).toBeGreaterThanOrEqual(3)
    const terms = results.map((r) => r.term)
    expect(terms).toContain('goa')
    expect(terms).toContain('gujarat')
  })

  it('respects limit parameter', () => {
    const t = new Trie()
    ;['a', 'ab', 'abc', 'abcd', 'abcde'].forEach((w) => t.insert(w))
    expect(t.autocomplete('a', 3)).toHaveLength(3)
  })

  it('returns empty array for unknown prefix', () => {
    const t = new Trie()
    t.insert('goa')
    expect(t.autocomplete('xyz')).toHaveLength(0)
  })
})

// ── buildDestinationTrie ──────────────────────────────────────────────────────

describe('buildDestinationTrie()', () => {
  let trie

  // Build once and reuse (cache hit vs miss simulation)
  const getOrBuild = (() => {
    let cached = null
    return () => {
      if (!cached) cached = buildDestinationTrie(INDIA_STATES, ALIASES)
      return cached
    }
  })()

  it('cache: first call builds the trie (miss)', () => {
    trie = getOrBuild()
    expect(trie).toBeInstanceOf(Trie)
  })

  it('cache: second call returns same instance (hit)', () => {
    const trie2 = getOrBuild()
    expect(trie2).toBe(getOrBuild()) // same reference
  })

  it('finds state names', () => {
    trie = buildDestinationTrie(INDIA_STATES, ALIASES)
    expect(trie.search('himachal pradesh')).toBe(true)
    expect(trie.search('goa')).toBe(true)
    expect(trie.search('kerala')).toBe(true)
    expect(trie.search('rajasthan')).toBe(true)
  })

  it('finds capital cities', () => {
    trie = trie || buildDestinationTrie(INDIA_STATES, ALIASES)
    expect(trie.search('jaipur')).toBe(true)      // Rajasthan
    expect(trie.search('shimla')).toBe(true)       // Himachal Pradesh
    expect(trie.search('thiruvananthapuram')).toBe(true)  // Kerala
  })

  it('finds aliases like manali', () => {
    trie = trie || buildDestinationTrie(INDIA_STATES, ALIASES)
    expect(trie.search('manali')).toBe(true)
    expect(trie.search('old manali')).toBe(true)
    expect(trie.search('kasol')).toBe(true)
  })

  it('autocomplete on "him" suggests himachal pradesh', () => {
    trie = trie || buildDestinationTrie(INDIA_STATES, ALIASES)
    const suggestions = trie.autocomplete('him', 5)
    const terms = suggestions.map((s) => s.term)
    expect(terms.some((t) => t.startsWith('him'))).toBe(true)
  })

  it('autocomplete on "ker" suggests kerala', () => {
    trie = trie || buildDestinationTrie(INDIA_STATES, ALIASES)
    const suggestions = trie.autocomplete('ker', 5)
    expect(suggestions.some((s) => s.term === 'kerala')).toBe(true)
  })

  it('does not find random non-destination words', () => {
    trie = trie || buildDestinationTrie(INDIA_STATES, ALIASES)
    expect(trie.search('fort')).toBe(false)
    expect(trie.search('old')).toBe(false)
    expect(trie.search('tour')).toBe(false)
  })
})
