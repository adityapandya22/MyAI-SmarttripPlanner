import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getProviderMode,
  getHotelProvider,
  getRestaurantProvider,
  BookingScraperProvider,
  GoogleMapsScraperProvider,
  MockHotelProvider,
  MockRestaurantProvider,
  searchHotels,
  searchRestaurants,
} from './index.mjs'
import { makeToolHandler } from '../tools.mjs'

describe('Provider Abstraction and Factory', () => {
  const originalEnv = process.env.ULISSE_PLACES_PROVIDER

  beforeEach(() => {
    delete process.env.ULISSE_PLACES_PROVIDER
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ULISSE_PLACES_PROVIDER = originalEnv
    } else {
      delete process.env.ULISSE_PLACES_PROVIDER
    }
  })

  describe('getProviderMode', () => {
    it('defaults to live mode when env var is unset', () => {
      expect(getProviderMode()).toBe('live')
    })

    it('returns mock when ULISSE_PLACES_PROVIDER is "mock"', () => {
      process.env.ULISSE_PLACES_PROVIDER = 'mock'
      expect(getProviderMode()).toBe('mock')
    })

    it('is case-insensitive and trims whitespace', () => {
      process.env.ULISSE_PLACES_PROVIDER = '  MOCK  '
      expect(getProviderMode()).toBe('mock')
    })

    it('respects explicit mode override', () => {
      process.env.ULISSE_PLACES_PROVIDER = 'mock'
      expect(getProviderMode('live')).toBe('live')
      expect(getProviderMode('mock')).toBe('mock')
    })
  })

  describe('getHotelProvider and getRestaurantProvider', () => {
    it('returns scraper providers in live mode', () => {
      const hotelProv = getHotelProvider('live')
      const restProv = getRestaurantProvider('live')

      expect(hotelProv).toBeInstanceOf(BookingScraperProvider)
      expect(restProv).toBeInstanceOf(GoogleMapsScraperProvider)
    })

    it('returns mock providers when ULISSE_PLACES_PROVIDER=mock', () => {
      process.env.ULISSE_PLACES_PROVIDER = 'mock'
      const hotelProv = getHotelProvider()
      const restProv = getRestaurantProvider()

      expect(hotelProv).toBeInstanceOf(MockHotelProvider)
      expect(restProv).toBeInstanceOf(MockRestaurantProvider)
    })
  })
})

describe('MockHotelProvider', () => {
  const provider = new MockHotelProvider()

  it('throws when location is missing', async () => {
    await expect(provider.searchHotels({})).rejects.toThrow('location mancante.')
    await expect(provider.searchHotels({ location: '   ' })).rejects.toThrow('location mancante.')
  })

  it('throws on invalid date formats', async () => {
    await expect(
      provider.searchHotels({ location: 'Rome', checkin: '2026/06/01', checkout: '2026-06-05' }),
    ).rejects.toThrow('checkin/checkout devono essere date YYYY-MM-DD.')

    await expect(
      provider.searchHotels({ location: 'Rome', checkin: '2026-06-01', checkout: 'invalid' }),
    ).rejects.toThrow('checkin/checkout devono essere date YYYY-MM-DD.')
  })

  it('throws when checkout is before or equal to checkin', async () => {
    await expect(
      provider.searchHotels({ location: 'Rome', checkin: '2026-06-05', checkout: '2026-06-01' }),
    ).rejects.toThrow('checkout deve essere successivo a checkin.')

    await expect(
      provider.searchHotels({ location: 'Rome', checkin: '2026-06-05', checkout: '2026-06-05' }),
    ).rejects.toThrow('checkout deve essere successivo a checkin.')
  })

  it('returns valid hotel search result matching booking.mjs schema', async () => {
    const res = await provider.searchHotels({
      location: 'Florence',
      checkin: '2026-06-10',
      checkout: '2026-06-14',
      adults: 2,
      rooms: 1,
      currency: 'EUR',
      max_results: 4,
    })

    expect(res).toMatchObject({
      location: 'Florence',
      resolved_as: 'Florence',
      checkin: '2026-06-10',
      checkout: '2026-06-14',
      nights: 4,
      adults: 2,
      rooms: 1,
    })
    expect(res.search_url).toContain('Florence')
    expect(res.properties).toHaveLength(4)

    for (const prop of res.properties) {
      expect(typeof prop.name).toBe('string')
      expect(typeof prop.available).toBe('boolean')
      expect(typeof prop.url).toBe('string')
      if (prop.available) {
        expect(prop.price_per_night).toBeGreaterThan(0)
        expect(prop.total_price).toBe(prop.price_per_night * 4)
      } else {
        expect(prop.price_per_night).toBeNull()
        expect(prop.total_price).toBeNull()
      }
      expect(prop.currency).toBe('EUR')
      expect(typeof prop.review_score).toBe('number')
      expect(typeof prop.review_count).toBe('number')
      expect(typeof prop.lat).toBe('number')
      expect(typeof prop.lng).toBe('number')
    }
  })

  it('scales price and currency for USD requests', async () => {
    const res = await provider.searchHotels({
      location: 'Venice',
      checkin: '2026-07-01',
      checkout: '2026-07-03',
      currency: 'USD',
      max_results: 3,
    })

    expect(res.properties[0].currency).toBe('USD')
  })
})

describe('MockRestaurantProvider', () => {
  const provider = new MockRestaurantProvider()

  it('throws when location is missing', async () => {
    await expect(provider.searchRestaurants({})).rejects.toThrow('location is required.')
    await expect(provider.searchRestaurants({ location: '   ' })).rejects.toThrow('location is required.')
  })

  it('returns valid restaurant search result matching places.mjs schema', async () => {
    const res = await provider.searchRestaurants({
      location: 'Jaipur',
      query: 'biryani',
      max_results: 3,
    })

    expect(res).toMatchObject({
      location: 'Jaipur',
      query: 'biryani in Jaipur',
    })
    expect(res.search_url).toContain('Jaipur')
    expect(res.places).toHaveLength(3)

    for (const place of res.places) {
      expect(typeof place.name).toBe('string')
      expect(typeof place.rating).toBe('number')
      expect(place.rating).toBeGreaterThanOrEqual(1)
      expect(place.rating).toBeLessThanOrEqual(5)
      expect(typeof place.review_count).toBe('number')
      expect(typeof place.price_range).toBe('string')
      expect(typeof place.category).toBe('string')
      expect(typeof place.address).toBe('string')
      expect(typeof place.lat).toBe('number')
      expect(typeof place.lng).toBe('number')
      expect(typeof place.url).toBe('string')
    }
  })

  it('defaults query to restaurants in location when unspecified', async () => {
    const res = await provider.searchRestaurants({
      location: 'Goa',
      max_results: 2,
    })

    expect(res.query).toBe('restaurants in Goa')
    expect(res.places).toHaveLength(2)
  })
})

describe('Tool Handler Integration with Mock Provider', () => {
  const originalEnv = process.env.ULISSE_PLACES_PROVIDER

  beforeEach(() => {
    process.env.ULISSE_PLACES_PROVIDER = 'mock'
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ULISSE_PLACES_PROVIDER = originalEnv
    } else {
      delete process.env.ULISSE_PLACES_PROVIDER
    }
  })

  it('delegates search_hotels to MockHotelProvider via searchHotels export', async () => {
    const res = await searchHotels({
      location: 'Jaipur',
      checkin: '2026-08-10',
      checkout: '2026-08-12',
      max_results: 2,
    })

    expect(res.location).toBe('Jaipur')
    expect(res.properties).toHaveLength(2)
    expect(res.note).toContain('[MOCK]')
  })

  it('delegates search_restaurants to MockRestaurantProvider via searchRestaurants export', async () => {
    const res = await searchRestaurants({
      location: 'Goa',
      query: 'seafood',
      max_results: 2,
    })

    expect(res.location).toBe('Goa')
    expect(res.places).toHaveLength(2)
    expect(res.note).toContain('[MOCK]')
  })

  it('makeToolHandler executes search_hotels with mock provider without opening browser', async () => {
    const handler = makeToolHandler(null, 'search_hotels')
    const response = await handler({
      location: 'Shimla',
      checkin: '2026-09-01',
      checkout: '2026-09-03',
      max_results: 3,
    })

    expect(response.isError).toBe(false)
    const payload = JSON.parse(response.content[0].text)
    expect(payload.location).toBe('Shimla')
    expect(payload.properties).toHaveLength(3)
  })

  it('makeToolHandler executes search_restaurants with mock provider without opening browser', async () => {
    const handler = makeToolHandler(null, 'search_restaurants')
    const response = await handler({
      location: 'Manali',
      query: 'local food',
      max_results: 2,
    })

    expect(response.isError).toBe(false)
    const payload = JSON.parse(response.content[0].text)
    expect(payload.location).toBe('Manali')
    expect(payload.places).toHaveLength(2)
  })
})

// ── INR + India coordinate assertions ────────────────────────────────────────

describe('Mock providers – INR prices and India-centred coordinates', () => {
  it('MockHotelProvider returns INR prices for Indian destinations', async () => {
    const provider = new MockHotelProvider()
    const res = await provider.searchHotels({
      location: 'Shimla',
      checkin: '2026-10-01',
      checkout: '2026-10-02',
      currency: 'INR',
    })

    expect(res.properties.length).toBeGreaterThan(0)
    for (const prop of res.properties) {
      expect(prop.currency).toBe('INR')
      if (prop.available) {
        // INR prices should be in reasonable India hotel range (500 - 30000 per night)
        expect(prop.price_per_night).toBeGreaterThan(500)
        expect(prop.price_per_night).toBeLessThan(30000)
      }
    }
  })

  it('MockHotelProvider coordinates fall within India bounds (lat 6-37, lng 65-100)', async () => {
    const provider = new MockHotelProvider()
    const res = await provider.searchHotels({
      location: 'Jaipur',
      checkin: '2026-10-01',
      checkout: '2026-10-03',
      currency: 'INR',
    })

    for (const prop of res.properties) {
      expect(prop.lat).toBeGreaterThan(6)
      expect(prop.lat).toBeLessThan(37)
      expect(prop.lng).toBeGreaterThan(65)
      expect(prop.lng).toBeLessThan(100)
    }
  })

  it('MockRestaurantProvider returns INR price ranges by default', async () => {
    const provider = new MockRestaurantProvider()
    const res = await provider.searchRestaurants({
      location: 'Kerala',
      currency: 'INR',
    })

    for (const place of res.places) {
      expect(place.price_range).toMatch(/\u20b9/)  // ₹ symbol
    }
  })

  it('MockRestaurantProvider coordinates fall within India bounds (lat 6-37, lng 65-100)', async () => {
    const provider = new MockRestaurantProvider()
    const res = await provider.searchRestaurants({
      location: 'Goa',
      max_results: 4,
    })

    for (const place of res.places) {
      expect(place.lat).toBeGreaterThan(6)
      expect(place.lat).toBeLessThan(37)
      expect(place.lng).toBeGreaterThan(65)
      expect(place.lng).toBeLessThan(100)
    }
  })

  it('MockHotelProvider prices are deterministic (same result on repeated call)', async () => {
    const provider = new MockHotelProvider()
    const args = { location: 'Manali', checkin: '2026-11-01', checkout: '2026-11-02', currency: 'INR' }
    const r1 = await provider.searchHotels(args)
    const r2 = await provider.searchHotels(args)
    expect(r1.properties[0].price_per_night).toBe(r2.properties[0].price_per_night)
    expect(r1.properties[0].lat).toBe(r2.properties[0].lat)
  })
})
