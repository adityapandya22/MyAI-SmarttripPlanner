import { describe, it, expect } from 'vitest'
import { haversineKm, bestInsertion } from './geo'

describe('haversineKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm([34.0522, -118.2437], [34.0522, -118.2437])).toBe(0)
  })

  it('is symmetric between two points', () => {
    const p1 = [37.7749, -122.4194]
    const p2 = [34.0522, -118.2437]
    const d1 = haversineKm(p1, p2)
    const d2 = haversineKm(p2, p1)
    expect(d1).toBeCloseTo(d2, 5)
    expect(d1).toBeGreaterThan(500)
    expect(d1).toBeLessThan(600) // SF to LA is ~560 km
  })

  it('calculates approximately 111 km per degree of latitude', () => {
    const dist = haversineKm([0, 0], [1, 0])
    expect(dist).toBeCloseTo(111.19, 0)
  })
})

describe('bestInsertion (optimal placement on route)', () => {
  it('handles empty route with no days', () => {
    const trip = { days: [] }
    const point = { lat: 34.0, lng: -118.0 }
    expect(bestInsertion(trip, point)).toBeNull()
  })

  it('handles empty route with an empty day', () => {
    const trip = {
      days: [{ id: 'd1', items: [] }],
    }
    const point = { lat: 34.0, lng: -118.0 }
    const result = bestInsertion(trip, point)
    expect(result).toEqual({ dayId: 'd1', index: 0, addedKm: 0 })
  })

  it('handles single-point route gracefully', () => {
    const trip = {
      days: [
        {
          id: 'd1',
          items: [{ id: 'i1', lat: 34.0, lng: -118.0 }],
        },
      ],
    }
    const point = { lat: 34.5, lng: -118.0 }
    const result = bestInsertion(trip, point)
    expect(result).toBeTruthy()
    expect(result.dayId).toBe('d1')
    expect([0, 1]).toContain(result.index)
    expect(result.addedKm).toBeGreaterThan(0)
  })

  it('picks the insertion point that minimizes added detour distance', () => {
    // Linear route: Stop A (34.0, -118.0) -> Stop B (36.0, -118.0)
    const trip = {
      days: [
        {
          id: 'day-1',
          items: [
            { id: 'stop-a', lat: 34.0, lng: -118.0 },
            { id: 'stop-b', lat: 36.0, lng: -118.0 },
          ],
        },
      ],
    }

    // Candidate C lies right on the line between Stop A and Stop B
    const midpoint = { lat: 35.0, lng: -118.0 }
    const resBetween = bestInsertion(trip, midpoint)

    // Inserting between index 0 and 1 adds almost 0 km detour
    expect(resBetween.dayId).toBe('day-1')
    expect(resBetween.index).toBe(1)
    expect(resBetween.addedKm).toBe(0)

    // Candidate D lies south of Stop A (before the whole route)
    const southPoint = { lat: 32.0, lng: -118.0 }
    const resSouth = bestInsertion(trip, southPoint)
    // Inserting at index 0 (before stop A) is better than detouring in between A and B
    expect(resSouth.dayId).toBe('day-1')
    expect(resSouth.index).toBe(0)

    // Candidate E lies north of Stop B (after the whole route)
    const northPoint = { lat: 38.0, lng: -118.0 }
    const resNorth = bestInsertion(trip, northPoint)
    // Inserting at index 2 (after stop B) is best
    expect(resNorth.dayId).toBe('day-1')
    expect(resNorth.index).toBe(2)
  })

  it('correctly targets the best day in a multi-day itinerary', () => {
    const trip = {
      days: [
        {
          id: 'day-1',
          items: [
            { id: 'd1-a', lat: 34.0, lng: -118.0 },
            { id: 'd1-b', lat: 34.2, lng: -118.0 },
          ],
        },
        {
          id: 'day-2',
          items: [
            { id: 'd2-a', lat: 37.0, lng: -122.0 },
            { id: 'd2-b', lat: 37.8, lng: -122.0 },
          ],
        },
      ],
    }

    // A stop in the Bay Area near Day 2 stops
    const bayStop = { lat: 37.4, lng: -122.0 }
    const result = bestInsertion(trip, bayStop)

    expect(result.dayId).toBe('day-2')
    expect(result.index).toBe(1) // between d2-a and d2-b
    expect(result.addedKm).toBe(0)
  })

  it('handles partial / missing inputs without throwing', () => {
    expect(bestInsertion(null, { lat: 34.0, lng: -118.0 })).toBeNull()
    expect(bestInsertion({}, { lat: 34.0, lng: -118.0 })).toBeNull()
    expect(bestInsertion({ days: [{ id: 'd1', items: null }] }, null)).toEqual({
      dayId: 'd1',
      index: 0,
      addedKm: 0,
    })
  })
})
