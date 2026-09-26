import { describe, it, expect } from 'vitest'
import { findDestination, parseDaysFromText, runFreeAgent } from './freeAgent.mjs'

describe('findDestination', () => {
  it('identifies Indian states by name', () => {
    const rajasthan = findDestination('I want to visit Rajasthan for 7 days')
    expect(rajasthan).toBeTruthy()
    expect(rajasthan.name).toBe('Rajasthan')

    const kerala = findDestination('Plan a trip to Kerala backwaters')
    expect(kerala).toBeTruthy()
    expect(kerala.name).toBe('Kerala')
  })

  it('identifies Indian states by capital city', () => {
    const jaipur = findDestination('Looking for activities in Jaipur')
    expect(jaipur).toBeTruthy()
    expect(jaipur.name).toBe('Rajasthan')

    const shimla = findDestination('Road trip to Shimla')
    expect(shimla).toBeTruthy()
    expect(shimla.name).toBe('Himachal Pradesh')
  })

  it('identifies states by iconic landmarks', () => {
    const hampi = findDestination('Exploring the ruins of Hampi')
    expect(hampi).toBeTruthy()
    expect(hampi.name).toBe('Karnataka')

    const tawang = findDestination('Visiting Tawang Monastery')
    expect(tawang).toBeTruthy()
    expect(tawang.name).toBe('Arunachal Pradesh')
  })

  it('returns null when query has no matching destination', () => {
    expect(findDestination('What is the weather today?')).toBeNull()
  })
})

describe('runFreeAgent interview flow', () => {
  it('executes set_trip_meta, add_day, and add_activity in INR currency', async () => {
    const calledTools = []
    const broadcastEvents = []

    const mockBridge = {
      broadcast: (ev) => {
        broadcastEvents.push(ev)
      },
      callBrowser: async (name, args) => {
        calledTools.push({ name, args })
        if (name === 'search_hotels') {
          return { ok: true, result: { properties: [] } }
        }
        if (name === 'search_restaurants') {
          return { ok: true, result: { places: [] } }
        }
        return { ok: true, result: { ok: true } }
      },
    }

    const abortController = new AbortController()

    await runFreeAgent('Plan a trip to Goa beaches', {
      mode: 'interview',
      currency: 'INR',
      language: 'en',
      bridge: mockBridge,
      abortSignal: abortController.signal,
    })

    // Verify set_trip_meta was called with INR
    const metaCall = calledTools.find((c) => c.name === 'set_trip_meta')
    expect(metaCall).toBeTruthy()
    expect(metaCall.args.currency).toBe('INR')
    expect(metaCall.args.car_gas_unit).toBe('inr_l')

    // Verify days were added
    const dayCalls = calledTools.filter((c) => c.name === 'add_day')
    expect(dayCalls.length).toBeGreaterThan(0)

    // Verify activities were added
    const actCalls = calledTools.filter((c) => c.name === 'add_activity')
    expect(actCalls.length).toBeGreaterThan(0)

    // Verify final assistant text was emitted
    const textEvent = broadcastEvents.find((e) => e.type === 'assistant_text')
    expect(textEvent).toBeTruthy()
    expect(textEvent.text).toContain('Goa')
  })

  it('handles planner queries for restaurants in INR', async () => {
    const calledTools = []
    const mockBridge = {
      broadcast: () => {},
      callBrowser: async (name, args) => {
        calledTools.push({ name, args })
        return { ok: true, result: {} }
      },
    }

    await runFreeAgent('Find a good restaurant for dinner in Jaipur', {
      mode: 'planner',
      currency: 'INR',
      language: 'en',
      bridge: mockBridge,
      abortSignal: new AbortController().signal,
    })

    const restTool = calledTools.find((c) => c.name === 'search_restaurants')
    expect(restTool).toBeTruthy()
    expect(restTool.args.location).toBe('Jaipur')
  })
})

describe('parseDaysFromText', () => {
  it('parses "10 days" as 10', () => {
    expect(parseDaysFromText('Plan a 10 days trip to Goa')).toBe(10)
  })

  it('parses "8 to 10 days" range as 10 (upper bound)', () => {
    expect(parseDaysFromText('I want 8 to 10 days in Rajasthan')).toBe(10)
  })

  it('parses "8-10 days" hyphenated range as 10', () => {
    expect(parseDaysFromText('Plan 8-10 days in Kerala')).toBe(10)
  })

  it('parses "for 5 days" with "for" prefix', () => {
    expect(parseDaysFromText('I want a trip for 5 days')).toBe(5)
  })

  it('parses "3 giorni" (Italian)', () => {
    expect(parseDaysFromText('Voglio 3 giorni a Roma')).toBe(3)
  })

  it('returns null when no day count is found', () => {
    expect(parseDaysFromText('Plan a trip to Goa beaches')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseDaysFromText('')).toBeNull()
  })
})

describe('runFreeAgent multi-day itinerary (8-10 days)', () => {
  it('generates 10 days when user asks for 8 to 10 days in Rajasthan', async () => {
    const calledTools = []
    const broadcastEvents = []

    const mockBridge = {
      broadcast: (ev) => {
        broadcastEvents.push(ev)
      },
      callBrowser: async (name, args) => {
        calledTools.push({ name, args })
        if (name === 'search_hotels') return { ok: true, result: { properties: [] } }
        if (name === 'search_restaurants') return { ok: true, result: { places: [] } }
        return { ok: true, result: { ok: true } }
      },
    }

    await runFreeAgent('I want 8 to 10 days in Rajasthan', {
      mode: 'interview',
      currency: 'INR',
      language: 'en',
      bridge: mockBridge,
      abortSignal: new AbortController().signal,
    })

    const dayCalls = calledTools.filter((c) => c.name === 'add_day')
    expect(dayCalls.length).toBe(10)

    const actCalls = calledTools.filter((c) => c.name === 'add_activity')
    expect(actCalls.length).toBe(10)

    // First day should mention arrival
    expect(dayCalls[0].args.title).toContain('Day 1')
    expect(dayCalls[0].args.title).toContain('Arrival')

    // Last day should mention farewell
    expect(dayCalls[9].args.title).toContain('Day 10')
    expect(dayCalls[9].args.title).toContain('Farewell')
  })
})
