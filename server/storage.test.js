import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  TripSchema,
  ImportTripSchema,
  validateTrip,
  formatZodError,
  createStorage,
} from './storage.mjs'

describe('Trip Schema Validation', () => {
  const seedIt = JSON.parse(readFileSync('./src/data/seed.it.json', 'utf8'))
  const seedEn = JSON.parse(readFileSync('./src/data/seed.en.json', 'utf8'))

  it('validates Italian and English seed trips using ImportTripSchema (no id required)', () => {
    expect(ImportTripSchema.safeParse(seedIt).success).toBe(true)
    expect(ImportTripSchema.safeParse(seedEn).success).toBe(true)
    const validIt = validateTrip(seedIt, { requireId: false })
    const validEn = validateTrip(seedEn, { requireId: false })

    expect(validIt.title).toBe('California Coast & Parks')
    expect(validEn.title).toBe('California Coast & Parks')
    expect(validIt.days).toBeInstanceOf(Array)
    expect(validEn.days).toBeInstanceOf(Array)
  })

  it('validates trips with id using TripSchema (requireId: true)', () => {
    const tripWithId = {
      ...seedIt,
      id: 'california-loop-123',
    }
    const validated = validateTrip(tripWithId, { requireId: true })
    expect(validated.id).toBe('california-loop-123')
  })

  it('rejects trips missing id when requireId: true', () => {
    expect(() => validateTrip(seedIt, { requireId: true })).toThrow(/Trip id is required/)
  })

  it('rejects non-object inputs with clear error', () => {
    expect(() => validateTrip(null)).toThrow('Trip data must be a valid non-empty object')
    expect(() => validateTrip('trip string')).toThrow('Trip data must be a valid non-empty object')
    expect(() => validateTrip([1, 2, 3])).toThrow('Trip data must be a valid non-empty object')
  })

  it('rejects malformed days structure', () => {
    const badDays = {
      id: 'trip-1',
      title: 'Bad Days Trip',
      days: 'not an array',
    }
    expect(() => validateTrip(badDays)).toThrow(/days: Invalid input: expected array/)
  })

  it('rejects malformed day items structure', () => {
    const badItems = {
      id: 'trip-2',
      title: 'Bad Items Trip',
      days: [
        {
          title: 'Day 1',
          items: 'invalid-items',
        },
      ],
    }
    expect(() => validateTrip(badItems)).toThrow(/days.0.items: Invalid input: expected array/)
  })

  it('rejects invalid transport modes', () => {
    const badTransport = {
      id: 'trip-3',
      transport: 'teleportation',
    }
    expect(() => validateTrip(badTransport)).toThrow(/transport: Invalid option/)
  })

  it('rejects invalid phase enum', () => {
    const badPhase = {
      id: 'trip-4',
      phase: 'finished',
    }
    expect(() => validateTrip(badPhase)).toThrow(/phase: Invalid option/)
  })

  it('validates trips with INR currency and inr_l gas unit', () => {
    const inrTrip = {
      id: 'india-rajasthan-001',
      title: 'Incredible Rajasthan Tour',
      currency: 'INR',
      car: {
        gasUnit: 'inr_l',
        gasPrice: 96.5,
        lPer100: 8.0,
      },
    }
    const validated = validateTrip(inrTrip, { requireId: true })
    expect(validated.currency).toBe('INR')
    expect(validated.car.gasUnit).toBe('inr_l')
    expect(validated.car.gasPrice).toBe(96.5)
  })

  it('formatZodError returns readable error list', () => {
    const result = TripSchema.safeParse({ id: '', days: 123 })
    expect(result.success).toBe(false)
    const formatted = formatZodError(result.error)
    expect(formatted).toContain('id:')
    expect(formatted).toContain('days:')
  })
})

describe('Storage Integration with Validation', () => {
  let testDir
  let storage
  let originalDataDir

  beforeEach(() => {
    originalDataDir = process.env.ULISSE_DATA_DIR
    testDir = join(tmpdir(), `ulisse-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    mkdirSync(join(testDir, 'trips'), { recursive: true })
    process.env.ULISSE_DATA_DIR = testDir

    storage = createStorage({ broadcast: () => {} })
  })

  afterEach(() => {
    if (originalDataDir !== undefined) {
      process.env.ULISSE_DATA_DIR = originalDataDir
    } else {
      delete process.env.ULISSE_DATA_DIR
    }
    if (existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup error
      }
    }
  })

  it('scanTrips loads valid trips and reports corrupted files in errors array', () => {
    // 1. Write a valid trip file
    const validTrip = {
      id: 'valid-trip-1',
      title: 'Valid Trip',
      days: [],
    }
    writeFileSync(
      join(testDir, 'trips', 'valid-trip--valid-trip-1.json'),
      JSON.stringify(validTrip),
    )

    // 2. Write a corrupted trip file
    const corruptedTrip = {
      id: 'bad-trip',
      days: 'not-an-array',
    }
    writeFileSync(
      join(testDir, 'trips', 'corrupted-trip--bad-trip.json'),
      JSON.stringify(corruptedTrip),
    )

    const { trips, errors } = storage.scanTrips()

    expect(trips).toHaveLength(1)
    expect(trips[0].id).toBe('valid-trip-1')
    expect(errors).toHaveLength(1)
    expect(errors[0].file).toContain('corrupted-trip')
    expect(errors[0].error).toContain('Trip validation error')
  })

  it('saveTrip rejects invalid trip and saves valid trip', () => {
    expect(() =>
      storage.saveTrip({
        id: 'bad-save',
        transport: 'rocket',
      }),
    ).toThrow(/Trip validation error/)

    const savedPath = storage.saveTrip({
      id: 'good-save',
      title: 'Great Trip',
      days: [],
    })
    expect(savedPath).toContain('good-save')
    expect(existsSync(join(testDir, savedPath))).toBe(true)
  })

  it('importTrip assigns id if missing and saves valid trip', () => {
    const imported = storage.importTrip({
      title: 'Imported Without Id',
      days: [],
    })
    expect(imported.id).toBeDefined()
    expect(typeof imported.id).toBe('string')
    expect(imported.title).toBe('Imported Without Id')

    const { trips } = storage.scanTrips()
    expect(trips.some((t) => t.id === imported.id)).toBe(true)
  })

  it('HTTP handler rejects PUT /storage/trips/:id with invalid trip data', async () => {
    let statusCode = 0
    let responseBody = ''

    const mockRes = {
      writeHead(code) {
        statusCode = code
      },
      end(body) {
        responseBody = body
      },
    }

    const mockReq = {
      url: '/storage/trips/test-id-123',
      method: 'PUT',
      on(event, handler) {
        if (event === 'data') {
          handler(
            JSON.stringify({
              id: 'test-id-123',
              days: 'invalid-days-type',
            }),
          )
        }
        if (event === 'end') {
          handler()
        }
      },
    }

    const handled = await storage.handle(mockReq, mockRes)
    expect(handled).toBe(true)
    expect(statusCode).toBe(400)
    const errObj = JSON.parse(responseBody)
    expect(errObj.error).toContain('Trip validation error')
  })

  it('HTTP handler accepts valid PUT /storage/trips/:id', async () => {
    let statusCode = 0
    let responseBody = ''

    const mockRes = {
      writeHead(code) {
        statusCode = code
      },
      end(body) {
        responseBody = body
      },
    }

    const mockReq = {
      url: '/storage/trips/test-id-456',
      method: 'PUT',
      on(event, handler) {
        if (event === 'data') {
          handler(
            JSON.stringify({
              id: 'test-id-456',
              title: 'Valid PUT Trip',
              days: [],
            }),
          )
        }
        if (event === 'end') {
          handler()
        }
      },
    }

    const handled = await storage.handle(mockReq, mockRes)
    expect(handled).toBe(true)
    expect(statusCode).toBe(200)
    const resObj = JSON.parse(responseBody)
    expect(resObj.ok).toBe(true)
  })
})
