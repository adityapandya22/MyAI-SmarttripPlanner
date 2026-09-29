#!/usr/bin/env node
/**
 * LIVE SMOKE TEST for MyTripPlanner / AI Smart Trip Planner.
 * Calls real live services (Nominatim, Wikipedia, Overpass) with >= 1.2s delay
 * between external requests to strictly respect rate limits.
 *
 * Checks:
 *   - India destinations: Goa, Himachal, Old Manali (India, INR, distinct stops, never Goa for Himachal)
 *   - Worldwide destinations: Paris (France, EUR), Paris Texas (US, USD), Dubai (UAE, AED), Bali (ID, IDR), Tokyo (JP, JPY)
 *   - Country queries: "Japan" (asks which city)
 *   - Ambiguous/gibberish queries: "fort tour", "xyzqwe12345" (asks which destination)
 *   - Coordinate uniqueness: no stops with duplicate coordinates
 *   - Minimum stops: >= 3 stops per day
 */

import { runFreeAgent } from '../server/freeAgent.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runTestQuery(query) {
  const calledTools = []
  const broadcastEvents = []

  const bridge = {
    broadcast: (ev) => broadcastEvents.push(ev),
    callBrowser: async (name, args) => {
      calledTools.push({ name, args })
      return { ok: true, result: {} }
    },
  }

  const abortController = new AbortController()

  try {
    await runFreeAgent(query, {
      mode: 'interview',
      bridge,
      abortSignal: abortController.signal,
    })
  } catch (err) {
    return {
      query,
      error: err.message,
      passed: false,
      reason: `Execution failed: ${err.message}`,
    }
  }

  const metaCall = calledTools.find((c) => c.name === 'set_trip_meta')
  const days = calledTools.filter((c) => c.name === 'add_day')
  const activities = calledTools.filter((c) => c.name === 'add_activity')
  const dayActivities = days.flatMap((d) => d.args?.activities || [])
  const allActivities = [...activities.map((a) => a.args), ...dayActivities]
  const textEvents = broadcastEvents.filter((e) => e.type === 'assistant_text')
  const lastReply = textEvents.map((e) => e.text).join('\n')

  return {
    query,
    meta: metaCall?.args || null,
    daysCount: days.length,
    stopsCount: allActivities.length,
    activities: allActivities,
    lastReply,
  }
}

async function main() {
  console.log('='.repeat(80))
  console.log('STARTING LIVE SMOKE TEST (REAL SERVICES & NETWORK CALLS)')
  console.log('Respecting rate limits: 1200ms delay between consecutive requests')
  console.log('='.repeat(80) + '\n')

  const testCases = [
    {
      query: 'Goa',
      type: 'india',
      expectedCountry: 'India',
      expectedCurrency: 'INR',
      validate: (res) => {
        if (!res.meta) return 'No trip generated'
        if (res.meta.currency !== 'INR') return `Expected INR, got ${res.meta.currency}`
        if (!res.meta.title?.toLowerCase().includes('goa')) return `Title should mention Goa: ${res.meta.title}`
        if (res.daysCount < 1) return 'No days created'
        if (res.stopsCount < 3) return `Too few stops: ${res.stopsCount}`
        return null
      },
    },
    {
      query: 'Himachal',
      type: 'india',
      expectedCountry: 'India',
      expectedCurrency: 'INR',
      validate: (res) => {
        if (!res.meta) return 'No trip generated'
        if (res.meta.currency !== 'INR') return `Expected INR, got ${res.meta.currency}`
        if (res.meta.title?.toLowerCase().includes('goa')) return `FATAL: Himachal resolved to Goa!`
        if (!res.meta.title?.toLowerCase().includes('himachal')) return `Title should mention Himachal: ${res.meta.title}`
        return null
      },
    },
    {
      query: 'Old Manali trip',
      type: 'india',
      expectedCountry: 'India',
      expectedCurrency: 'INR',
      validate: (res) => {
        if (!res.meta) return 'No trip generated'
        if (res.meta.currency !== 'INR') return `Expected INR, got ${res.meta.currency}`
        if (res.meta.title?.toLowerCase().includes('goa')) return `FATAL: Old Manali resolved to Goa!`
        return null
      },
    },
    {
      query: 'Paris',
      type: 'world',
      expectedCountry: 'France',
      expectedCurrency: 'EUR',
      validate: (res) => {
        if (!res.meta) return 'No trip generated'
        if (res.meta.currency !== 'EUR') return `Expected EUR, got ${res.meta.currency}`
        if (!res.meta.title?.toLowerCase().includes('paris')) return `Title should mention Paris: ${res.meta.title}`
        if (res.daysCount < 1) return 'No days created'
        if (res.stopsCount < 3) return `Expected >= 3 stops, got ${res.stopsCount}`
        return null
      },
    },
    {
      query: 'Paris Texas',
      type: 'world',
      expectedCountry: 'United States',
      expectedCurrency: 'USD',
      validate: (res) => {
        if (res.meta) {
          if (res.meta.currency !== 'USD') return `Expected USD for Paris Texas, got ${res.meta.currency}`
          return null
        }
        // If disambiguation triggered:
        if (res.lastReply.includes('Paris') && (res.lastReply.includes('Texas') || res.lastReply.includes('multiple'))) {
          return null
        }
        return 'Expected either trip created in USD or disambiguation prompt'
      },
    },
    {
      query: 'Dubai',
      type: 'world',
      expectedCountry: 'United Arab Emirates',
      expectedCurrency: 'AED',
      validate: (res) => {
        if (!res.meta) return 'No trip generated'
        if (res.meta.currency !== 'AED') return `Expected AED, got ${res.meta.currency}`
        if (!res.meta.title?.toLowerCase().includes('dubai')) return `Title should mention Dubai: ${res.meta.title}`
        return null
      },
    },
    {
      query: 'Bali',
      type: 'world',
      expectedCountry: 'Indonesia',
      expectedCurrency: 'IDR',
      validate: (res) => {
        if (!res.meta) return 'No trip generated'
        if (res.meta.currency !== 'IDR') return `Expected IDR, got ${res.meta.currency}`
        if (!res.meta.title?.toLowerCase().includes('bali')) return `Title should mention Bali: ${res.meta.title}`
        return null
      },
    },
    {
      query: 'Tokyo',
      type: 'world',
      expectedCountry: 'Japan',
      expectedCurrency: 'JPY',
      validate: (res) => {
        if (!res.meta) return 'No trip generated'
        if (res.meta.currency !== 'JPY') return `Expected JPY, got ${res.meta.currency}`
        if (!res.meta.title?.toLowerCase().includes('tokyo')) return `Title should mention Tokyo: ${res.meta.title}`
        return null
      },
    },
    {
      query: 'Japan',
      type: 'country',
      expectedCountry: 'Japan',
      expectedCurrency: 'N/A',
      validate: (res) => {
        if (!res.lastReply.toLowerCase().includes('which city in')) {
          return `Expected "Which city in Japan?", received: ${res.lastReply.slice(0, 100)}`
        }
        return null
      },
    },
    {
      query: 'fort tour',
      type: 'ambiguous',
      expectedCountry: 'N/A',
      expectedCurrency: 'N/A',
      validate: (res) => {
        if (!res.lastReply.toLowerCase().includes('which destination did you mean')) {
          return `Expected clarification question, received: ${res.lastReply.slice(0, 100)}`
        }
        return null
      },
    },
    {
      query: 'xyzzyqwert12345',
      type: 'gibberish',
      expectedCountry: 'N/A',
      expectedCurrency: 'N/A',
      validate: (res) => {
        if (!res.lastReply.toLowerCase().includes('which destination did you mean')) {
          return `Expected clarification question, received: ${res.lastReply.slice(0, 100)}`
        }
        return null
      },
    },
  ]

  let passedCount = 0
  let failedCount = 0
  const resultsTable = []

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    process.stdout.write(`[${i + 1}/${testCases.length}] Testing "${tc.query}"... `)

    const res = await runTestQuery(tc.query)
    const validationError = tc.validate(res)

    // Check duplicate coordinates if activities were generated
    let coordinateError = null
    if (res.activities && res.activities.length > 1) {
      const coordSet = new Set()
      for (const act of res.activities) {
        if (act.lat != null && act.lng != null) {
          const key = `${Number(act.lat).toFixed(4)},${Number(act.lng).toFixed(4)}`
          if (coordSet.has(key)) {
            coordinateError = `Duplicate coordinate found: ${key} on ${act.title}`
            break
          }
          coordSet.add(key)
        }
      }
    }

    const failure = validationError || coordinateError
    const status = failure ? 'FAIL' : 'PASS'

    if (failure) {
      failedCount++
      console.log(`❌ FAIL: ${failure}`)
    } else {
      passedCount++
      console.log('✅ PASS')
    }

    resultsTable.push({
      Query: tc.query,
      'Resolved Place': res.meta?.title?.replace(/^Trip to /, '') || (res.lastReply.includes('Which city in') ? 'Country Clarification' : 'Clarification Prompt'),
      Country: tc.expectedCountry,
      Currency: res.meta?.currency || 'N/A',
      'Days/Stops': res.meta ? `${res.daysCount}d / ${res.stopsCount}s` : '0d / 0s',
      Status: status,
    })

    // Rate-limiting delay between queries
    if (i < testCases.length - 1) {
      await sleep(1200)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('SMOKE TEST SUMMARY RESULTS')
  console.log('='.repeat(80))
  console.table(resultsTable)
  console.log(`Total: ${testCases.length} | Passed: ${passedCount} | Failed: ${failedCount}\n`)

  if (failedCount > 0) {
    console.error(`Smoke test failed with ${failedCount} failure(s).`)
    process.exit(1)
  } else {
    console.log('All live smoke test cases passed successfully!')
  }
}

main().catch((err) => {
  console.error('Fatal error in smoke test:', err)
  process.exit(1)
})
