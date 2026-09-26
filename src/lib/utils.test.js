import { describe, it, expect } from 'vitest'
import {
  uid,
  DAY_COLORS,
  LEGACY_HOTEL_PRICES,
  normalizeTrip,
  fuelCost,
  costByType,
  tripStats,
  dayDate,
  fmtDur,
  tripUsesCar,
  hostOf,
  fmtMoney,
} from './utils'
import { INDIA_STATES, INDIA_REGIONS } from '../data/indiaStates'

describe('id and color helpers', () => {
  it('generates unique non-empty id strings', () => {
    const id1 = uid()
    const id2 = uid()
    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThan(0)
    expect(id1).not.toBe(id2)
  })

  it('provides a palette of 10 distinct hex colors', () => {
    expect(DAY_COLORS).toHaveLength(10)
    DAY_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    })
    const unique = new Set(DAY_COLORS)
    expect(unique.size).toBe(10)
  })

  it('provides legacy hotel prices array', () => {
    expect(Array.isArray(LEGACY_HOTEL_PRICES)).toBe(true)
    expect(LEGACY_HOTEL_PRICES.length).toBeGreaterThan(0)
    expect(LEGACY_HOTEL_PRICES[0]).toBe(180)
  })
})

describe('normalizeTrip', () => {
  it('assigns sensible defaults when optional fields are missing', () => {
    const trip = normalizeTrip({})
    expect(trip.id).toBeTruthy()
    expect(trip.title).toBeTruthy()
    expect(trip.subtitle).toBe('')
    expect(trip.startDate).toBe('')
    expect(trip.phase).toBe('active')
    expect(trip.transport).toBe('car')
    expect(trip.currency).toBe('INR')
    expect(trip.days).toEqual([])
    expect(trip.checklist).toEqual([])
    expect(trip.car).toEqual({
      lPer100: 8.5,
      gasPrice: 96,
      gasUnit: 'inr_l',
      model: '',
    })
  })

  it('migrates legacy hotel items without prices using LEGACY_HOTEL_PRICES', () => {
    const legacyTrip = {
      title: 'Legacy Roadtrip',
      days: [
        {
          items: [
            { type: 'hotel', title: 'Hotel Day 1' }, // day 0 -> 180
            { type: 'activity', title: 'Hike' },
          ],
        },
        {
          items: [
            { type: 'hotel', title: 'Hotel Day 2' }, // day 1 -> 220
          ],
        },
        {
          items: [
            { type: 'hotel', title: 'Hotel Day 3 with explicit price', price: 99 },
          ],
        },
      ],
    }

    const normalized = normalizeTrip(legacyTrip)
    const day1Hotel = normalized.days[0].items[0]
    const day1Activity = normalized.days[0].items[1]
    const day2Hotel = normalized.days[1].items[0]
    const day3Hotel = normalized.days[2].items[0]

    expect(day1Hotel.price).toBe(LEGACY_HOTEL_PRICES[0]) // 180
    expect(day1Activity.price).toBe(0)
    expect(day2Hotel.price).toBe(LEGACY_HOTEL_PRICES[1]) // 220
    expect(day3Hotel.price).toBe(99) // preserves explicit price
  })

  it('migrates legacy single img to imgs array and removes img', () => {
    const raw = {
      days: [
        {
          items: [
            { type: 'activity', title: 'Beach', img: 'https://example.com/beach.jpg' },
          ],
        },
      ],
    }
    const normalized = normalizeTrip(raw)
    const item = normalized.days[0].items[0]
    expect(item.imgs).toEqual(['https://example.com/beach.jpg'])
    expect(item.img).toBeUndefined()
  })

  it('migrates legacy gasPerGal to car.gasPrice and gasUnit', () => {
    const raw = {
      car: { gasPerGal: 3.99 },
    }
    const normalized = normalizeTrip(raw)
    expect(normalized.car.gasPrice).toBe(3.99)
    expect(normalized.car.gasUnit).toBe('usd_gal')
  })

  it('does not throw on malformed or partial inputs', () => {
    expect(() => normalizeTrip(null)).not.toThrow()
    expect(() => normalizeTrip(undefined)).not.toThrow()
    expect(() => normalizeTrip('invalid')).not.toThrow()
    expect(() => normalizeTrip(123)).not.toThrow()
    expect(() => normalizeTrip({ days: [null, { items: [null, undefined] }] })).not.toThrow()

    const fromNull = normalizeTrip(null)
    expect(fromNull.id).toBeTruthy()
    expect(Array.isArray(fromNull.days)).toBe(true)

    const fromMalformedDays = normalizeTrip({ days: [null, { items: [null] }] })
    expect(fromMalformedDays.days).toHaveLength(1)
    expect(fromMalformedDays.days[0].items).toEqual([])
  })
})

describe('fuelCost calculation', () => {
  it('calculates fuel cost correctly for normal inputs in USD', () => {
    // 100 km at 8.0 L/100km = 8 L
    // 8 L at $2.00 / liter = $16.00
    const car = { lPer100: 8.0, gasPrice: 2.0, gasUnit: 'usd_l' }
    const cost = fuelCost(100, car, 'USD')
    expect(cost).toBeCloseTo(16.0, 2)
  })

  it('converts gallons to liters accurately (usd_gal)', () => {
    // 100 km at 10.0 L/100km = 10 L
    // gasPrice: $3.78541/gal -> $1.00/L
    // cost = 10 * 1 = $10.00
    const car = { lPer100: 10.0, gasPrice: 3.78541, gasUnit: 'usd_gal' }
    const cost = fuelCost(100, car, 'USD')
    expect(cost).toBeCloseTo(10.0, 2)
  })

  it('converts to EUR when requested', () => {
    const car = { lPer100: 10.0, gasPrice: 1.0, gasUnit: 'usd_l' }
    const costEur = fuelCost(100, car, 'EUR')
    // USD cost = 10, EUR = 10 / 1.08 (default rate)
    expect(costEur).toBeGreaterThan(0)
    expect(costEur).toBeLessThan(10)
  })

  it('returns 0 when distance is zero or negative', () => {
    const car = { lPer100: 8.5, gasPrice: 4.5, gasUnit: 'usd_gal' }
    expect(fuelCost(0, car, 'USD')).toBe(0)
    expect(fuelCost(-50, car, 'USD')).toBe(0)
  })

  it('returns 0 when car settings are missing or incomplete', () => {
    expect(fuelCost(150, null, 'USD')).toBe(0)
    expect(fuelCost(150, undefined, 'USD')).toBe(0)
    expect(fuelCost(150, {}, 'USD')).toBe(0)
    expect(fuelCost(150, { lPer100: 0, gasPrice: 4.5 }, 'USD')).toBe(0)
    expect(fuelCost(150, { lPer100: 8.5, gasPrice: 0 }, 'USD')).toBe(0)
  })
})

describe('budget and utility helpers', () => {
  it('costByType groups expenses and computes sum', () => {
    const trip = {
      days: [
        {
          items: [
            { type: 'hotel', price: 150 },
            { type: 'food', price: 40 },
            { type: 'activity', price: 25 },
          ],
        },
        {
          items: [
            { type: 'hotel', price: 120 },
            { type: 'food', price: 30 },
            { type: 'drive', price: 15 }, // extra
            { type: 'activity', price: 0 }, // free
          ],
        },
      ],
    }
    const costs = costByType(trip)
    expect(costs.hotel).toBe(270)
    expect(costs.food).toBe(70)
    expect(costs.activity).toBe(25)
    expect(costs.extra).toBe(15)
    expect(costs.items).toBe(380)
  })

  it('tripStats computes days, stops, and driving minutes', () => {
    const trip = {
      days: [
        {
          items: [
            { type: 'activity', dur: 60 },
            { type: 'drive', dur: 90 },
            { type: 'info', dur: 10 },
          ],
        },
        {
          items: [
            { type: 'hotel', dur: 0 },
            { type: 'drive', dur: 45 },
          ],
        },
      ],
    }
    const stats = tripStats(trip)
    expect(stats.days).toBe(2)
    expect(stats.stops).toBe(2) // 1 activity + 1 hotel
    expect(stats.driveMin).toBe(135) // 90 + 45
  })

  it('dayDate calculates date with day offset', () => {
    const d0 = dayDate('2026-07-25', 0)
    expect(d0).toBeInstanceOf(Date)
    expect(d0.getDate()).toBe(25)

    const d3 = dayDate('2026-07-25', 3)
    expect(d3.getDate()).toBe(28)

    expect(dayDate('', 0)).toBeNull()
    expect(dayDate('invalid-date', 0)).toBeNull()
  })

  it('fmtDur formats minutes properly', () => {
    expect(fmtDur(0)).toBe('')
    expect(fmtDur(null)).toBe('')
    expect(fmtDur(45)).toBeTruthy()
    expect(fmtDur(120)).toBeTruthy()
  })

  it('tripUsesCar detects car transport or drive items', () => {
    expect(tripUsesCar({ transport: 'car', days: [] })).toBe(true)
    expect(tripUsesCar({ transport: 'mixed', days: [] })).toBe(true)
    expect(tripUsesCar({
      transport: 'walk',
      days: [{ items: [{ type: 'drive', mode: 'car' }] }],
    })).toBe(true)
    expect(tripUsesCar({
      transport: 'walk',
      days: [{ items: [{ type: 'activity' }] }],
    })).toBe(false)
  })

  it('hostOf extracts hostname cleanly', () => {
    expect(hostOf('https://www.google.com/maps')).toBe('google.com')
    expect(hostOf('https://booking.com/hotel')).toBe('booking.com')
    expect(hostOf('not-a-url')).toBe('link')
  })
})

describe('INR (Rupees) currency support', () => {
  it('formats money in INR with Rupee symbol and Indian numbering', () => {
    const formatted = fmtMoney(25000, 'INR')
    expect(formatted).toContain('₹')
    expect(formatted).toContain('25,000')

    const zero = fmtMoney(0, 'INR')
    expect(zero).toBe('₹0')
  })

  it('calculates fuelCost directly in INR using inr_l', () => {
    // 200 km at 10.0 L/100km = 20 L
    // 20 L at ₹95/L = ₹1900
    const car = { lPer100: 10.0, gasPrice: 95, gasUnit: 'inr_l' }
    const cost = fuelCost(200, car, 'INR')
    expect(cost).toBeCloseTo(1900, 2)
  })

  it('converts USD fuel cost to INR when currency is INR', () => {
    // 100 km at 10.0 L/100km = 10 L
    // 10 L at $1.00/L = $10
    // In INR, 10 USD should convert to > 700 INR (approx 83-90 INR/USD)
    const car = { lPer100: 10.0, gasPrice: 1.0, gasUnit: 'usd_l' }
    const costInr = fuelCost(100, car, 'INR')
    expect(costInr).toBeGreaterThan(700)
  })
})

describe('India States and Union Territories dataset', () => {
  it('contains exactly 28 states and 8 union territories (total 36)', () => {
    expect(INDIA_STATES).toHaveLength(36)
    const states = INDIA_STATES.filter((s) => s.type === 'State')
    const uts = INDIA_STATES.filter((s) => s.type === 'Union Territory')
    expect(states).toHaveLength(28)
    expect(uts).toHaveLength(8)
  })

  it('includes required metadata for every state and union territory', () => {
    INDIA_STATES.forEach((item) => {
      expect(item.id).toBeTruthy()
      expect(item.name).toBeTruthy()
      expect(item.capital).toBeTruthy()
      expect(item.region).toBeTruthy()
      expect(item.coords.lat).toBeGreaterThan(5)
      expect(item.coords.lat).toBeLessThan(40)
      expect(item.coords.lng).toBeGreaterThan(65)
      expect(item.coords.lng).toBeLessThan(100)
      expect(item.topAttractions.length).toBeGreaterThanOrEqual(3)
      expect(item.promptTemplate).toBeTruthy()
    })
  })

  it('provides all standard regions', () => {
    expect(INDIA_REGIONS).toContain('North')
    expect(INDIA_REGIONS).toContain('South')
    expect(INDIA_REGIONS).toContain('West')
    expect(INDIA_REGIONS).toContain('East')
    expect(INDIA_REGIONS).toContain('Northeast')
  })
})

