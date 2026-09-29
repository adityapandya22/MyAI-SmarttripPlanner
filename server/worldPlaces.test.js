import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SimpleLRUCache,
  normalizeQuery,
  haversineKm,
  tourDistanceKm,
  clusterPOIs,
  optimizeDayRoute,
  deriveDayTheme,
  classifyCandidate,
  resolveCandidates,
  getCurrencyForCountry,
  getAttractionsForLocation,
  geocodeCache,
  poiCache,
  nominatimLimiter,
} from './worldPlaces.mjs'
import { runFreeAgent } from './freeAgent.mjs'

describe('World Places Service & DSA Algorithms', () => {
  beforeEach(() => {
    geocodeCache.clear()
    poiCache.clear()
    vi.restoreAllMocks()
  })

  describe('Haversine Distance & Route Optimization (DSA Viva)', () => {
    it('calculates accurate Haversine distance between coordinates', () => {
      // Paris Eiffel Tower (48.8584, 2.2945) to Louvre (48.8606, 2.3376) is ~3.16 km
      const d = haversineKm(48.8584, 2.2945, 48.8606, 2.3376)
      expect(d).toBeGreaterThan(2.9)
      expect(d).toBeLessThan(3.5)

      // Distance to itself is 0
      expect(haversineKm(48.8584, 2.2945, 48.8584, 2.2945)).toBe(0)
    })

    it('clusters POIs into N days using K-Means with close stops sharing a day', () => {
      // 6 points: 3 clustered near North Paris, 3 clustered near South Paris
      const northCluster = [
        { name: 'Montmartre', lat: 48.8867, lng: 2.3431 },
        { name: 'Sacré-Cœur', lat: 48.8870, lng: 2.3435 },
        { name: 'Moulin Rouge', lat: 48.8841, lng: 2.3323 },
      ]
      const southCluster = [
        { name: 'Catacombs', lat: 48.8338, lng: 2.3324 },
        { name: 'Montparnasse', lat: 48.8421, lng: 2.3219 },
        { name: 'Jardin du Luxembourg', lat: 48.8462, lng: 2.3372 },
      ]
      const allPoints = [...northCluster, ...southCluster]

      const clusters = clusterPOIs(allPoints, 2)
      expect(clusters.length).toBe(2)
      expect(clusters[0].length + clusters[1].length).toBe(6)

      // Verify points within the same cluster are geographically close
      const cluster0Names = clusters[0].map((p) => p.name)
      const allInNorth = northCluster.every((p) => cluster0Names.includes(p.name))
      const allInSouth = southCluster.every((p) => cluster0Names.includes(p.name))
      expect(allInNorth || allInSouth).toBe(true)
    })

    it('2-Opt optimization yields route distance <= initial order', () => {
      // Crossed/zigzagging points
      const points = [
        { name: 'A', lat: 48.8584, lng: 2.2945 },
        { name: 'B', lat: 48.8867, lng: 2.3431 },
        { name: 'C', lat: 48.8606, lng: 2.3376 },
        { name: 'D', lat: 48.8841, lng: 2.3323 },
      ]
      const initialDist = tourDistanceKm(points)
      const optimized = optimizeDayRoute(points)
      const optimizedDist = tourDistanceKm(optimized)

      expect(optimizedDist).toBeLessThanOrEqual(initialDist)
      expect(optimized.length).toBe(points.length)
    })

    it('derives contextual day themes based on stops', () => {
      const heritageStops = [{ name: 'Historic Palace', category: 'heritage' }]
      expect(deriveDayTheme(1, heritageStops, 'Rome')).toContain('Heritage')

      const museumStops = [{ name: 'Louvre Art Museum', category: 'museum' }]
      expect(deriveDayTheme(2, museumStops, 'Paris')).toContain('Museums')

      const beachStops = [{ name: 'Sunny Beach', category: 'beach' }]
      expect(deriveDayTheme(3, beachStops, 'Bali')).toContain('Beaches')
    })
  })

  describe('Query Normalization & Filler Word Stripping', () => {
    it('normalizes queries and extracts trip days', () => {
      expect(normalizeQuery('Plan a 5 days trip to Paris')).toEqual({
        cleaned: 'Paris',
        days: 5,
      })

      expect(normalizeQuery('8 to 10 days vacation in Tokyo')).toEqual({
        cleaned: 'Tokyo',
        days: 10,
      })

      expect(normalizeQuery('explore Rome for 3 days')).toEqual({
        cleaned: 'Rome',
        days: 3,
      })

      expect(normalizeQuery('trip to New York')).toEqual({
        cleaned: 'New York',
        days: null,
      })
    })
  })

  describe('Currency & Budget Mapping', () => {
    it('maps country codes to local currencies and daily budgets', () => {
      expect(getCurrencyForCountry('fr').code).toBe('EUR')
      expect(getCurrencyForCountry('us').code).toBe('USD')
      expect(getCurrencyForCountry('gb').code).toBe('GBP')
      expect(getCurrencyForCountry('jp').code).toBe('JPY')
      expect(getCurrencyForCountry('ae').code).toBe('AED')
      expect(getCurrencyForCountry('th').code).toBe('THB')
      expect(getCurrencyForCountry('id').code).toBe('IDR')
      expect(getCurrencyForCountry('in').code).toBe('INR')

      expect(getCurrencyForCountry('jp').symbol).toBe('¥')
      expect(getCurrencyForCountry('ae').symbol).toBe('AED')
      expect(getCurrencyForCountry('jp').dailyBudget).toBeGreaterThan(10000)
    })
  })

  describe('Nominatim Candidate Matching & Disambiguation', () => {
    it('resolves dominant candidate when importance gap is large (e.g. Paris, France)', () => {
      const candidates = [
        {
          name: 'Paris',
          display_name: 'Paris, Île-de-France, France',
          lat: '48.8566',
          lon: '2.3522',
          importance: 0.95,
          type: 'city',
        },
        {
          name: 'Paris',
          display_name: 'Paris, Lamar County, Texas, United States',
          lat: '33.6609',
          lon: '-95.5555',
          importance: 0.55,
          type: 'city',
        },
      ]

      const res = resolveCandidates(candidates, 'Paris')
      expect(res.status).toBe('single')
      expect(res.result.display_name).toContain('France')
    })

    it('triggers disambiguation when 2+ plausible candidates have similar importance', () => {
      const candidates = [
        {
          name: 'Paris',
          display_name: 'Paris, Île-de-France, France',
          lat: '48.8566',
          lon: '2.3522',
          importance: 0.65,
          type: 'city',
        },
        {
          name: 'Paris',
          display_name: 'Paris, Lamar County, Texas, United States',
          lat: '33.6609',
          lon: '-95.5555',
          importance: 0.62,
          type: 'city',
        },
      ]

      const res = resolveCandidates(candidates, 'Paris')
      expect(res.status).toBe('disambiguate')
      expect(res.candidates.length).toBe(2)
      expect(res.candidates[0].display_name).toContain('France')
      expect(res.candidates[1].display_name).toContain('Texas')
    })

    it('rejects candidate if searched text does not match display_name or name', () => {
      const candidates = [
        {
          name: 'Berlin',
          display_name: 'Berlin, Germany',
          lat: '52.52',
          lon: '13.40',
          importance: 0.8,
        },
      ]
      const res = resolveCandidates(candidates, 'Tokyo')
      expect(res.status).toBe('no_match')
    })

    it('classifies country/region vs city correctly', () => {
      expect(classifyCandidate({ type: 'country', addresstype: 'country' }).isCity).toBe(false)
      expect(classifyCandidate({ type: 'state', addresstype: 'state' }).isCity).toBe(false)
      expect(classifyCandidate({ type: 'city', addresstype: 'city' }).isCity).toBe(true)
      expect(classifyCandidate({ type: 'town', addresstype: 'town' }).isCity).toBe(true)
    })
  })

  describe('LRU Cache & Rate Limiter', () => {
    it('sets and gets cache entries with LRU eviction and TTL', () => {
      const cache = new SimpleLRUCache(2, 5000)
      cache.set('a', 1)
      cache.set('b', 2)
      expect(cache.get('a')).toBe(1)

      // Insert 3rd item; 'b' is least recently used because 'a' was read
      cache.set('c', 3)
      expect(cache.get('a')).toBe(1)
      expect(cache.get('b')).toBeNull()
      expect(cache.get('c')).toBe(3)
    })

    it('rate limiter serializes consecutive calls', async () => {
      let active = 0
      let maxActive = 0
      const work = async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 20))
        active--
        return true
      }

      await Promise.all([
        nominatimLimiter.schedule(work),
        nominatimLimiter.schedule(work),
      ])

      expect(maxActive).toBe(1)
    })
  })

  describe('Attraction Fallback Chain', () => {
    it('uses bundled offline attractions when Wikipedia and Overpass return nothing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const pois = await getAttractionsForLocation('Paris', 48.8566, 2.3522)
      expect(pois.length).toBeGreaterThanOrEqual(6)
      expect(pois.some((p) => p.name.includes('Eiffel Tower'))).toBe(true)
      expect(pois[0].source).toContain('Offline Guide')
    })

    it('returns empty array honestly when all fallbacks fail and city is not bundled', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const pois = await getAttractionsForLocation('UnknownFictionalCity99', 10.0, 20.0)
      expect(pois).toEqual([])
    })
  })

  describe('runFreeAgent Worldwide Integration Flow (Mocked Network)', () => {
    it('resolves Paris and generates an international itinerary in EUR', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url) => {
          const urlStr = String(url)
          if (urlStr.includes('nominatim.openstreetmap.org')) {
            return {
              ok: true,
              json: async () => [
                {
                  name: 'Paris',
                  display_name: 'Paris, Île-de-France, France',
                  lat: '48.8566',
                  lon: '2.3522',
                  importance: 0.95,
                  type: 'city',
                  address: { country_code: 'fr' },
                },
              ],
            }
          }
          return { ok: false, status: 500 }
        }),
      )

      const calledTools = []
      const broadcastEvents = []
      const mockBridge = {
        broadcast: (ev) => broadcastEvents.push(ev),
        callBrowser: async (name, args) => {
          calledTools.push({ name, args })
          return { ok: true, result: {} }
        },
      }

      await runFreeAgent('Plan a 4-day trip to Paris', {
        mode: 'interview',
        bridge: mockBridge,
        abortSignal: new AbortController().signal,
      })

      const metaCall = calledTools.find((c) => c.name === 'set_trip_meta')
      expect(metaCall).toBeTruthy()
      expect(metaCall.args.currency).toBe('EUR')
      expect(metaCall.args.title).toContain('Paris')

      const dayCalls = calledTools.filter((c) => c.name === 'add_day')
      expect(dayCalls.length).toBe(4)

      const actCalls = calledTools.filter((c) => c.name === 'add_activity')
      expect(actCalls.length).toBeGreaterThanOrEqual(12)

      const textEvent = broadcastEvents.find(
        (e) => e.type === 'assistant_text' && e.text.includes('Paris') && e.text.includes('EUR'),
      )
      expect(textEvent).toBeTruthy()
    })

    it('asks "Which city in Japan?" when user enters a country', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url) => {
          const urlStr = String(url)
          if (urlStr.includes('nominatim.openstreetmap.org')) {
            return {
              ok: true,
              json: async () => [
                {
                  name: 'Japan',
                  display_name: 'Japan',
                  lat: '36.2048',
                  lon: '138.2529',
                  importance: 0.92,
                  type: 'country',
                  addresstype: 'country',
                  address: { country_code: 'jp' },
                },
              ],
            }
          }
          return { ok: false }
        }),
      )

      const broadcastEvents = []
      const mockBridge = {
        broadcast: (ev) => broadcastEvents.push(ev),
        callBrowser: async () => ({ ok: true, result: {} }),
      }

      await runFreeAgent('I want to visit Japan for 7 days', {
        mode: 'interview',
        bridge: mockBridge,
        abortSignal: new AbortController().signal,
      })

      const textEvent = broadcastEvents.find((e) => e.type === 'assistant_text')
      expect(textEvent).toBeTruthy()
      expect(textEvent.text).toContain('Which city in')
      expect(textEvent.text).toContain('Japan')
      expect(textEvent.text).toContain('Tokyo')
    })

    it('handles multi-city trips like "Kyoto and Osaka"', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url) => {
          const urlStr = String(url)
          if (urlStr.includes('Kyoto')) {
            return {
              ok: true,
              json: async () => [
                {
                  name: 'Kyoto',
                  display_name: 'Kyoto, Kyoto Prefecture, Japan',
                  lat: '35.0116',
                  lon: '135.7681',
                  importance: 0.88,
                  type: 'city',
                  address: { country_code: 'jp' },
                },
              ],
            }
          }
          if (urlStr.includes('Osaka')) {
            return {
              ok: true,
              json: async () => [
                {
                  name: 'Osaka',
                  display_name: 'Osaka, Osaka Prefecture, Japan',
                  lat: '34.6937',
                  lon: '135.5023',
                  importance: 0.89,
                  type: 'city',
                  address: { country_code: 'jp' },
                },
              ],
            }
          }
          return { ok: false }
        }),
      )

      const calledTools = []
      const broadcastEvents = []
      const mockBridge = {
        broadcast: (ev) => broadcastEvents.push(ev),
        callBrowser: async (name, args) => {
          calledTools.push({ name, args })
          return { ok: true, result: {} }
        },
      }

      await runFreeAgent('Plan 6 days in Kyoto and Osaka', {
        mode: 'interview',
        bridge: mockBridge,
        abortSignal: new AbortController().signal,
      })

      const metaCall = calledTools.find((c) => c.name === 'set_trip_meta')
      expect(metaCall).toBeTruthy()
      expect(metaCall.args.currency).toBe('JPY')
      expect(metaCall.args.title).toContain('Kyoto')
      expect(metaCall.args.title).toContain('Osaka')

      const dayCalls = calledTools.filter((c) => c.name === 'add_day')
      expect(dayCalls.length).toBe(6)
    })

    it('still resolves India destinations to India state flow (Goa, Himachal Pradesh)', async () => {
      const calledTools = []
      const mockBridge = {
        broadcast: () => {},
        callBrowser: async (name, args) => {
          calledTools.push({ name, args })
          return { ok: true, result: {} }
        },
      }

      await runFreeAgent('Road trip to Shimla for 5 days', {
        mode: 'interview',
        bridge: mockBridge,
        abortSignal: new AbortController().signal,
      })

      const metaCall = calledTools.find((c) => c.name === 'set_trip_meta')
      expect(metaCall).toBeTruthy()
      expect(metaCall.args.currency).toBe('INR')
      expect(metaCall.args.title).toContain('Himachal Pradesh')
    })

    it('asks which destination when query is gibberish or fort tour without destination', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => [],
        }),
      )

      const broadcastEvents = []
      const mockBridge = {
        broadcast: (ev) => broadcastEvents.push(ev),
        callBrowser: async () => ({ ok: true }),
      }

      await runFreeAgent('fort tour', {
        mode: 'interview',
        bridge: mockBridge,
        abortSignal: new AbortController().signal,
      })

      const textEvent = broadcastEvents.find((e) => e.type === 'assistant_text')
      expect(textEvent).toBeTruthy()
      expect(textEvent.text).toContain('Which destination did you mean?')
    })

    it('handles non-Latin native spelling like 東京 gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url) => {
          const urlStr = String(url)
          if (urlStr.includes(encodeURIComponent('東京'))) {
            return {
              ok: true,
              json: async () => [
                {
                  name: '東京',
                  display_name: '東京都, 日本',
                  lat: '35.6895',
                  lon: '139.6917',
                  importance: 0.95,
                  type: 'city',
                  address: { country_code: 'jp' },
                },
              ],
            }
          }
          return { ok: false }
        }),
      )

      const calledTools = []
      const mockBridge = {
        broadcast: () => {},
        callBrowser: async (name, args) => {
          calledTools.push({ name, args })
          return { ok: true, result: {} }
        },
      }

      await runFreeAgent('東京 4 days', {
        mode: 'interview',
        bridge: mockBridge,
        abortSignal: new AbortController().signal,
      })

      const metaCall = calledTools.find((c) => c.name === 'set_trip_meta')
      expect(metaCall).toBeTruthy()
      expect(metaCall.args.currency).toBe('JPY')
    })
  })
})
