/**
 * Scored whole-word destination matcher for India states & UTs.
 *
 * Replaces the old loose-substring findDestination() in freeAgent.mjs.
 * Exported as a standalone module so it can be unit-tested independently.
 */

import { INDIA_STATES } from '../src/data/indiaStates.js'

/**
 * Normalise: lower-case, strip diacritics, strip punctuation, collapse whitespace.
 * @param {string} s
 * @returns {string}
 */
export const norm = (s = '') =>
  s == null
    ? ''
    : String(s)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

import { ALIASES } from '../src/data/destinationAliases.js'
export { ALIASES }

/**
 * True if the whole word `word` appears in string `haystack`.
 * Both inputs should already be norm()-ed.
 * @param {string} haystack
 * @param {string} word
 */
export const hasWord = (haystack, word) => {
  if (!word) return false
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(haystack)
}

/**
 * Compute a relevance score for a single INDIA_STATES entry against query text.
 * Higher is better; 0 means no match.
 * @param {string} text  raw user query
 * @param {object} s     one entry from INDIA_STATES
 * @returns {number}
 */
export function scoreDestination(text, s) {
  const q = norm(text)
  let score = 0

  // Full state name match (highest priority)
  const name = norm(s.name)
  if (hasWord(q, name)) score += 100

  // ID match (e.g. "himachal pradesh")
  const idAsWords = norm(s.id?.replace(/-/g, ' ') ?? '')
  if (idAsWords && hasWord(q, idAsWords)) score += 90

  // First word of name (only if longer than 3 chars to avoid false positives like "old")
  const head = name.split(' ')[0]
  if (head.length > 3 && hasWord(q, head)) score += 80

  // Aliases
  for (const alias of ALIASES[s.id] ?? []) {
    if (hasWord(q, norm(alias))) score += 70
  }

  // Capital city — use full name up to " or " or ","
  const cap = norm(s.capital ?? '').split(/ or |,/)[0].trim()
  if (cap && hasWord(q, cap)) score += 60

  // Full attraction names only (no first-word tricks)
  for (const attraction of s.topAttractions ?? []) {
    const attName = typeof attraction === 'string' ? attraction : attraction?.name
    if (attName && hasWord(q, norm(attName))) score += 40
  }

  return score
}

/**
 * Find the best-matching state/UT for a raw query string.
 * Returns null if no match is strong enough (score < 60).
 * This prevents silent fallback to a wrong destination.
 *
 * @param {string} text  raw user query
 * @returns {object|null}
 */
export function findDestination(text = '') {
  let best = null
  let bestScore = 0

  for (const s of INDIA_STATES) {
    const sc = scoreDestination(text, s)
    if (sc > bestScore) {
      best = s
      bestScore = sc
    }
  }

  return bestScore >= 60 ? best : null
}
