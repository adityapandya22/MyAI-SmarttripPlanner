import { ALIASES as DEFAULT_ALIASES } from '../data/destinationAliases.js'

/**
 * Trie (prefix tree) for autocomplete over state names, capitals, aliases, and attractions.
 *
 * DSA implementation with clean insert / search / startsWith methods.
 * Used by IndiaStatesModal and dashboard prompt input for autocomplete.
 */

class TrieNode {
  constructor() {
    /** @type {Map<string, TrieNode>} */
    this.children = new Map()
    /** @type {boolean} */
    this.isEnd = false
    /**
     * Metadata attached to the end of a complete term.
     * Can hold { stateId, type } for filtering suggestions.
     * @type {object|null}
     */
    this.meta = null
  }
}

export class Trie {
  constructor() {
    this._root = new TrieNode()
  }

  /**
   * Insert a word into the Trie.
   * @param {string} word   – normalised (lower-case, trimmed)
   * @param {object} [meta] – optional metadata to attach at the leaf
   */
  insert(word, meta = null) {
    if (!word) return
    let node = this._root
    for (const ch of word) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new TrieNode())
      }
      node = node.children.get(ch)
    }
    node.isEnd = true
    node.meta = meta
  }

  /**
   * Returns true if `word` is an exact term in the Trie.
   * @param {string} word
   * @returns {boolean}
   */
  search(word) {
    const node = this._traverse(word)
    return node !== null && node.isEnd
  }

  /**
   * Returns true if any term in the Trie starts with `prefix`.
   * @param {string} prefix
   * @returns {boolean}
   */
  startsWith(prefix) {
    return this._traverse(prefix) !== null
  }

  /**
   * Return up to `limit` autocomplete suggestions for a prefix.
   * Each suggestion is { term: string, meta: object|null }.
   * @param {string} prefix
   * @param {number} [limit=10]
   * @returns {Array<{term: string, meta: object|null}>}
   */
  autocomplete(prefix, limit = 10) {
    const node = this._traverse(prefix)
    if (!node) return []

    const results = []
    this._dfs(node, prefix, results, limit)
    return results
  }

  /** @private */
  _traverse(prefix) {
    let node = this._root
    for (const ch of prefix) {
      if (!node.children.has(ch)) return null
      node = node.children.get(ch)
    }
    return node
  }

  /** @private */
  _dfs(node, prefix, results, limit) {
    if (results.length >= limit) return
    if (node.isEnd) results.push({ term: prefix, meta: node.meta })
    for (const [ch, child] of node.children) {
      if (results.length >= limit) break
      this._dfs(child, prefix + ch, results, limit)
    }
  }
}

/**
 * Build and return a Trie populated with all state names, capitals,
 * aliases, and attraction names from the INDIA_STATES dataset.
 *
 * @param {object[]} INDIA_STATES  – array from indiaStates.js
 * @param {object}   [ALIASES]     – alias map from destinationAliases.js
 * @returns {Trie}
 */
export function buildDestinationTrie(INDIA_STATES, ALIASES = DEFAULT_ALIASES) {
  const trie = new Trie()
  const norm = (s = '') => String(s).toLowerCase().trim().replace(/\s+/g, ' ')

  for (const s of INDIA_STATES) {
    const meta = { stateId: s.id, stateName: s.name }

    // State name
    trie.insert(norm(s.name), meta)

    // ID as words
    trie.insert(norm(s.id.replace(/-/g, ' ')), meta)

    // Capital (first alternative)
    const cap = norm(s.capital).split(/ or |,/)[0].trim()
    if (cap) trie.insert(cap, meta)

    // Aliases
    for (const alias of ALIASES[s.id] || []) {
      trie.insert(norm(alias), meta)
    }

    // Top attraction names
    for (const att of s.topAttractions || []) {
      const name = typeof att === 'string' ? att : att?.name
      if (name) trie.insert(norm(name), meta)
    }
  }

  return trie
}
