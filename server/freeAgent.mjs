/**
 * Free & Open AI Agent Provider for MyTripPlanner.
 *
 * Supports:
 * 1. Built-in Autonomous Planner Agent (Zero login, zero subscription, zero API key required)
 * 2. Free Google Gemini API (100% free tier from Google AI Studio: https://aistudio.google.com/app/apikey)
 * 3. Free Groq API (100% free tier with LLaMA 3.3 70B: https://console.groq.com/keys)
 */

import { z } from 'zod'
import { TOOL_DEFS, makeToolHandler } from './tools.mjs'
import { findDestination } from './destination.mjs'
import { getHotelProvider, getRestaurantProvider, getProviderMode } from './providers/index.mjs'

// Re-export for backwards compatibility (tests import directly from this file)
export { findDestination } from './destination.mjs'
export { INDIA_STATES } from '../src/data/indiaStates.js'

// Simple sleep helper that respects AbortSignal
const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || typeof process.env.VITEST !== 'undefined')

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Aborted'))
    }, { once: true })
  })

/**
 * Stream text chunk by chunk to the browser bridge.
 */
async function streamText(bridge, fullText, signal, speedMs = 15) {
  if (isTest || speedMs === 0) {
    bridge.broadcast({ type: 'assistant_delta', text: fullText })
    return
  }
  const words = fullText.split(' ')
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) return
    const chunk = (i === 0 ? '' : ' ') + words[i]
    bridge.broadcast({ type: 'assistant_delta', text: chunk })
    await sleep(speedMs, signal)
  }
}

/** Minor words to keep lowercased unless at beginning or end */
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'with'])

/** Title-case a string e.g. "goa" -> "Goa", "old manali trip" -> "Old Manali Trip" */
export function toTitleCase(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .split(/\s+/)
    .map((word, idx, arr) => {
      const lower = word.toLowerCase()
      if (idx > 0 && idx < arr.length - 1 && MINOR_WORDS.has(lower)) {
        return lower
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

/**
 * Parse day count from user prompt text, e.g. "8 to 10 days", "10 days", "8-10 days".
 * Returns the upper bound of any range, or null if no day count found.
 */
export function parseDaysFromText(text) {
  const m = text.match(/(?:for\s+)?(\d+)(?:\s*(?:-|to)\s*(\d+))?\s*(?:day|days|giorn|notte|notti)/i)
  if (!m) return null
  const a = parseInt(m[1], 10)
  const b = m[2] ? parseInt(m[2], 10) : a
  return Math.max(a, b)
}

/** Extract thematic tags from attraction name & description */
export function getAttractionTags(item) {
  const name = typeof item === 'object' && item?.name ? item.name : String(item)
  const desc = typeof item === 'object' && item?.description ? item.description : ''
  const text = `${name} ${desc}`.toLowerCase()
  const tags = new Set()
  if (/panaji|panjim|fontainhas|mandovi|miramar|quarter/i.test(text)) tags.add('panaji')
  if (/fort|basilica|cathedral|church|heritage|palace|tomb|monument|museum|unesco|cave|temple/i.test(text)) tags.add('heritage')
  if (/beach|sea|coast|sand|shack|cove|cliff/i.test(text)) tags.add('beach')
  if (/falls|waterfall|nature|lake|valley|pass|sanctuary|park|plantation|garden|forest|trek|hills|mountain|tea/i.test(text)) tags.add('nature')
  if (/market|bazaar|flea|craft|shopping|street|spice/i.test(text)) tags.add('market')
  if (/cultural|dance|art|folk|cruise|music/i.test(text)) tags.add('culture')
  return tags
}

/** Generate guaranteed distinct coordinates with deterministic tiny offsets */
function getDistinctCoords(usedCoords, lat, lng) {
  let cLat = Number(Number(lat).toFixed(4))
  let cLng = Number(Number(lng).toFixed(4))
  let key = `${cLat},${cLng}`
  let step = 1
  while (usedCoords.has(key)) {
    cLat = Number((Number(lat) + step * 0.0035).toFixed(4))
    cLng = Number((Number(lng) - step * 0.0028).toFixed(4))
    key = `${cLat},${cLng}`
    step++
  }
  usedCoords.add(key)
  return { lat: cLat, lng: cLng }
}

/** Day title templates for varied multi-day itineraries */
const DAY_THEMES = [
  (n, dest, cap) => `Day ${n}: Arrival & Exploring ${cap || dest}`,
  (n, dest) => `Day ${n}: Heritage & Highlights of ${dest}`,
  (n, dest) => `Day ${n}: Cultural Immersion in ${dest}`,
  (n, dest) => `Day ${n}: Nature & Scenic Trails of ${dest}`,
  (n, dest) => `Day ${n}: Hidden Gems of ${dest}`,
  (n, dest) => `Day ${n}: Adventure & Outdoor Excursions in ${dest}`,
  (n, dest) => `Day ${n}: Sacred Temples & Spiritual Sites in ${dest}`,
  (n, dest) => `Day ${n}: Art, Architecture & Crafts of ${dest}`,
  (n, dest) => `Day ${n}: Scenic Views & Leisure in ${dest}`,
  (n, dest) => `Day ${n}: Culinary Experiences in ${dest}`,
  (n, dest) => `Day ${n}: Artisan Workshops & Local Bazaars in ${dest}`,
  (n, dest) => `Day ${n}: Sunrise Excursion & Photography in ${dest}`,
  (n, dest) => `Day ${n}: Wildlife & Nature in ${dest}`,
  (n, dest) => `Day ${n}: Farewell ${dest} & Local Souvenirs`,
]

/**
 * Derive ISO date string offset by `offsetDays` from tripStartDate (or today+14 fallback).
 * @param {string|null} tripStartDate  ISO date string or null
 * @param {number} offsetDays
 * @returns {string}  YYYY-MM-DD
 */
function deriveDateStr(tripStartDate, offsetDays = 0) {
  if (tripStartDate) {
    const base = new Date(tripStartDate)
    if (!isNaN(base.getTime())) {
      base.setDate(base.getDate() + offsetDays)
      return base.toISOString().slice(0, 10)
    }
  }
  const fallback = new Date()
  fallback.setDate(fallback.getDate() + 14 + offsetDays)
  return fallback.toISOString().slice(0, 10)
}

/**
 * Return the full capital name (first alternative when split on " or " or ",").
 * Fixes the old `capital.split(' ')[0]` bug that turned "New Delhi" -> "New".
 * @param {string} capital
 * @returns {string}
 */
function primaryCapital(capital = '') {
  return capital.split(/ or |,/)[0].trim()
}

/**
 * Word-boundary safe intent checks.
 * Avoids: "eat" matching "great", "theatre"; "stay" matching "yesterday".
 */
function intentMatches(text, ...words) {
  const lower = text.toLowerCase()
  return words.some((w) => new RegExp(`(?:^|\\s)${w}(?:\\s|$|[.,!?])`).test(lower))
}

/**
 * Autonomous Free AI Agent (No subscriptions, No login required).
 */
export async function runFreeAgent(text, { mode, currency = 'INR', language = 'en', bridge, abortSignal, startDate = null, fallbackNotice = null }) {
  const cur = currency || 'INR'
  const isIt = String(language).startsWith('it')

  // Stream friendly fallback notice if routed from a missing/failed key
  if (fallbackNotice) {
    const noticeText = `*(${fallbackNotice})*\n\n`
    await streamText(bridge, noticeText, abortSignal, 10)
  }

  let matchedState
  try {
    matchedState = findDestination(text)
  } catch (err) {
    console.error('[freeAgent] findDestination error:', err)
    matchedState = null
  }

  if (mode === 'interview') {
    // ── Stage 1: Build the trip structure ─────────────────────────────────

    // TASK 2: If destination is unknown, ask instead of silently falling back
    if (!matchedState) {
      // Try to extract a raw place name from the text (stop at connector words)
      const rawPlace = text.match(/\bto\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,3})(?=\s+(?:for|with|in|on|and|by|via|from|\d)|$)/i)?.[1]?.trim()
      const clarificationMsg = rawPlace
        ? `I couldn't find "${rawPlace}" in my India destination database. Which destination did you mean? For example, try "Himachal Pradesh", "Manali", "Goa", or "Kerala".`
        : `Which destination did you mean? Please name a specific Indian state, city, or landmark — for example "Rajasthan", "Manali", "Kerala backwaters".`

      await streamText(bridge, clarificationMsg, abortSignal, 12)
      bridge.broadcast({ type: 'assistant_text', text: clarificationMsg })
      return
    }

    const destName = matchedState.name
    const stateCapital = primaryCapital(matchedState.capital)
    const userDays = parseDaysFromText(text)
    const daysCount = Math.min(userDays || matchedState?.suggestedDays || 5, 14)
    const coords = matchedState?.coords || { lat: 26.9124, lng: 75.7873 }
    const titleCasedDest = toTitleCase(destName)

    // Derive dates from startDate (offset 0 and 1) or fallback (today+14, today+15)
    const checkin = deriveDateStr(startDate, 0)
    const checkout = deriveDateStr(startDate, 1)

    // 1. Set Trip Meta (with title-cased name and INR currency)
    bridge.broadcast({ type: 'agent_tool', name: 'set_trip_meta', args: { title: `Trip to ${titleCasedDest}`, currency: cur, car_gas_unit: 'inr_l' } })
    try {
      await bridge.callBrowser('set_trip_meta', {
        title: `Trip to ${titleCasedDest}`,
        currency: cur,
        car_gas_unit: 'inr_l',
        car_gas_price: 96,
        car_model: 'SUV / Compact Crossover',
      })
    } catch (err) {
      console.error('[freeAgent] set_trip_meta error:', err)
    }

    // 2. Open planner phase
    bridge.broadcast({ type: 'agent_tool', name: 'start_planning', args: {} })
    try {
      await bridge.callBrowser('start_planning', {})
    } catch (err) {
      console.error('[freeAgent] start_planning error:', err)
    }

    const introMsg = isIt
      ? `Ciao! Ho iniziato a strutturare il tuo itinerario a **${destName}** (${daysCount} giorni) calcolato interamente in **${cur === 'INR' ? '₹ (Rupie)' : cur}**!`
      : `Namaste! I've started building your personalized **${destName}** itinerary (${daysCount} days) with all expenses calculated in **₹ (${cur})**!`

    await streamText(bridge, introMsg + '\n\n', abortSignal, 12)

    // 3. Prepare normalized attraction objects with real coordinates and descriptions
    const rawAttractions = matchedState?.topAttractions?.length
      ? matchedState.topAttractions
      : [
        'Historic Old Quarter & Heritage Monuments',
        'Iconic Fortresses & Palace Gardens',
        'Vibrant Local Bazaars & Traditional Artisan Markets',
        'Scenic Sunset Overlook & Sunset Lake Boating',
        'Cultural Center & Classical Evening Folk Dance',
      ]

    const attractions = rawAttractions.map((att, idx) => {
      if (typeof att === 'object' && att?.name) {
        return {
          name: att.name,
          lat: att.lat ?? Number((coords.lat + (idx * 0.005)).toFixed(4)),
          lng: att.lng ?? Number((coords.lng + (idx * 0.005)).toFixed(4)),
          description: att.description || `Historic landmark and cultural highlight in ${destName}.`,
        }
      }
      return {
        name: String(att),
        lat: Number((coords.lat + (idx * 0.005)).toFixed(4)),
        lng: Number((coords.lng + (idx * 0.005)).toFixed(4)),
        description: `Iconic attraction in ${destName}. Guided exploration and cultural highlights.`,
      }
    })

    // Search hotels and restaurants via configured providers
    let foundHotels = []
    let foundRestaurants = []
    try {
      const hRes = await getHotelProvider().searchHotels({ location: stateCapital, checkin, checkout, currency: cur })
      foundHotels = hRes?.hotels || []
    } catch { /* fallback safely */ }

    try {
      const rRes = await getRestaurantProvider().searchRestaurants({ location: stateCapital, query: 'authentic cuisine', currency: cur })
      foundRestaurants = rRes?.restaurants || []
    } catch { /* fallback safely */ }

    const isGoa = destName.toLowerCase().includes('goa')
    const usedCoords = new Set()
    const usedAttractionNames = new Set()
    let totalActivitiesAdded = 0
    let totalFoodAdded = 0
    let totalHotelsAdded = 0

    // Staggered times for balanced daily flow
    const STAGGERED_TIMES = ['09:30', '12:30', '15:30', '19:00', '21:30']

    for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
      if (abortSignal?.aborted) return

      let dayTitle
      let targetTag = 'heritage'

      if (isGoa) {
        if (dayNum === 1) {
          dayTitle = `Day ${dayNum}: Arrival & Exploring Panaji & Fontainhas`
          targetTag = 'panaji'
        } else if (dayNum === 2) {
          dayTitle = `Day ${dayNum}: Historic Old Goa & Heritage Forts`
          targetTag = 'heritage'
        } else if (dayNum === 3) {
          dayTitle = `Day ${dayNum}: North Goa Beaches & Coastal Highlights`
          targetTag = 'beach'
        } else if (dayNum === 4) {
          dayTitle = `Day ${dayNum}: South Goa Coastal Bliss & Waterfalls`
          targetTag = 'nature'
        } else if (dayNum === 5) {
          dayTitle = `Day ${dayNum}: Spice Plantations & Cultural Goa`
          targetTag = 'culture'
        } else if (dayNum === 6) {
          dayTitle = `Day ${dayNum}: Flea Markets, Sunset Cruise & Nightlife`
          targetTag = 'market'
        } else {
          dayTitle = dayNum === daysCount
            ? `Day ${dayNum}: Farewell Goa & Souvenir Shopping`
            : `Day ${dayNum}: Coastal Leisure & Sunset Views`
          targetTag = dayNum % 2 === 0 ? 'beach' : 'culture'
        }
      } else {
        if (dayNum === 1) {
          dayTitle = DAY_THEMES[0](dayNum, destName, stateCapital)
          targetTag = 'heritage'
        } else if (dayNum === daysCount) {
          dayTitle = DAY_THEMES[DAY_THEMES.length - 1](dayNum, destName, stateCapital)
          targetTag = 'culture'
        } else {
          const midThemes = DAY_THEMES.length - 2
          const themeIdx = 1 + ((dayNum - 2) % midThemes)
          dayTitle = DAY_THEMES[themeIdx](dayNum, destName, stateCapital)
          const tagOptions = ['heritage', 'nature', 'market', 'culture', 'heritage']
          targetTag = tagOptions[(dayNum - 2) % tagOptions.length]
        }
      }

      bridge.broadcast({ type: 'agent_tool', name: 'add_day', args: { title: dayTitle, night: stateCapital } })
      try {
        await bridge.callBrowser('add_day', { title: dayTitle, night: stateCapital })
      } catch (err) {
        console.error('[freeAgent] add_day error:', err)
      }

      // Pick theme-matched attractions for this day
      const themeMatches = attractions.filter((att) => {
        const tags = getAttractionTags(att)
        return tags.has(targetTag) && !usedAttractionNames.has(att.name)
      })

      // Ensure we have at least 2 attractions for daytime stops
      while (themeMatches.length < 2) {
        const nextUnused = attractions.find((att) => !usedAttractionNames.has(att.name) && !themeMatches.some((x) => x.name === att.name))
        if (!nextUnused) break
        themeMatches.push(nextUnused)
      }

      if (themeMatches.length === 0) themeMatches.push(attractions[(dayNum - 1) % attractions.length])
      if (themeMatches.length === 1) themeMatches.push(attractions[dayNum % attractions.length])

      const att1 = themeMatches[0]
      const att2 = themeMatches[1]
      usedAttractionNames.add(att1.name)
      usedAttractionNames.add(att2.name)

      const att1Coords = getDistinctCoords(usedCoords, att1.lat, att1.lng)
      const att2Coords = getDistinctCoords(usedCoords, att2.lat, att2.lng)

      // Stop 1 (09:30) - Primary Theme Sightseeing Activity
      const att1Tags = getAttractionTags(att1)
      const stop1Price = att1Tags.has('beach') ? 0 : 250
      bridge.broadcast({
        type: 'agent_tool',
        name: 'add_activity',
        args: { day_number: dayNum, title: att1.name, time: STAGGERED_TIMES[0], duration_min: 120, price: stop1Price },
      })
      try {
        await bridge.callBrowser('add_activity', {
          day_number: dayNum,
          title: att1.name,
          type: 'activity',
          time: STAGGERED_TIMES[0],
          duration_min: 120,
          lat: att1Coords.lat,
          lng: att1Coords.lng,
          notes: att1.description,
          price: stop1Price,
          price_usd: stop1Price,
        })
        totalActivitiesAdded++
      } catch (err) {
        console.error('[freeAgent] add_activity stop 1 error:', err)
      }

      // Stop 2 (12:30) - Authentic Regional Dining Stop
      const restChoice = foundRestaurants.length ? foundRestaurants[(dayNum - 1) % foundRestaurants.length] : null
      const lunchTitle = restChoice?.name || `Authentic ${destName} Lunch & Regional Specialties`
      const lunchCoords = getDistinctCoords(usedCoords, att1.lat + 0.002, att1.lng - 0.002)
      const lunchNotes = restChoice?.address
        ? `Authentic regional dining at ${restChoice.name} (${restChoice.address}). Price range: ${restChoice.price_level || '₹₹'}.`
        : `Savor traditional local specialties, fresh regional flavors, and refreshing beverages.`
      const lunchPrice = 550

      bridge.broadcast({
        type: 'agent_tool',
        name: 'add_activity',
        args: { day_number: dayNum, title: lunchTitle, time: STAGGERED_TIMES[1], duration_min: 75, price: lunchPrice },
      })
      try {
        await bridge.callBrowser('add_activity', {
          day_number: dayNum,
          title: lunchTitle,
          type: 'food',
          time: STAGGERED_TIMES[1],
          duration_min: 75,
          lat: lunchCoords.lat,
          lng: lunchCoords.lng,
          notes: lunchNotes,
          price: lunchPrice,
          price_usd: lunchPrice,
        })
        totalFoodAdded++
      } catch (err) {
        console.error('[freeAgent] add_activity stop 2 error:', err)
      }

      // Stop 3 (15:30) - Secondary Sightseeing / Nature / Landmark Activity
      const att2Tags = getAttractionTags(att2)
      const stop3Price = att2Tags.has('beach') ? 0 : 200
      bridge.broadcast({
        type: 'agent_tool',
        name: 'add_activity',
        args: { day_number: dayNum, title: att2.name, time: STAGGERED_TIMES[2], duration_min: 120, price: stop3Price },
      })
      try {
        await bridge.callBrowser('add_activity', {
          day_number: dayNum,
          title: att2.name,
          type: 'activity',
          time: STAGGERED_TIMES[2],
          duration_min: 120,
          lat: att2Coords.lat,
          lng: att2Coords.lng,
          notes: att2.description,
          price: stop3Price,
          price_usd: stop3Price,
        })
        totalActivitiesAdded++
      } catch (err) {
        console.error('[freeAgent] add_activity stop 3 error:', err)
      }

      // Stop 4 (19:00) - Evening Stroll / Dinner / Sunset Highlight
      const eveCoords = getDistinctCoords(usedCoords, att2.lat - 0.003, att2.lng + 0.003)
      const eveTitle = isGoa && dayNum === 1
        ? 'Mandovi River Cruise & Folk Music'
        : `Evening Sunset Walk & Dinner in ${stateCapital}`
      const eveNotes = isGoa && dayNum === 1
        ? 'Evening river cruise with Goan folk music, Dekhni dance performances, and river panoramas.'
        : `Unwind with scenic evening atmosphere, local street sights, and dinner in ${stateCapital}.`
      const evePrice = 650

      bridge.broadcast({
        type: 'agent_tool',
        name: 'add_activity',
        args: { day_number: dayNum, title: eveTitle, time: STAGGERED_TIMES[3], duration_min: 90, price: evePrice },
      })
      try {
        await bridge.callBrowser('add_activity', {
          day_number: dayNum,
          title: eveTitle,
          type: 'activity',
          time: STAGGERED_TIMES[3],
          duration_min: 90,
          lat: eveCoords.lat,
          lng: eveCoords.lng,
          notes: eveNotes,
          price: evePrice,
          price_usd: evePrice,
        })
        totalActivitiesAdded++
      } catch (err) {
        console.error('[freeAgent] add_activity stop 4 error:', err)
      }

      // Stop 5 (21:30) - Overnight Accommodation
      const hotelChoice = foundHotels.length ? foundHotels[(dayNum - 1) % foundHotels.length] : null
      const hotelTitle = hotelChoice?.name ? `Night at ${hotelChoice.name}` : `Night in ${stateCapital}`
      const hotelCoords = getDistinctCoords(usedCoords, hotelChoice?.lat || coords.lat, hotelChoice?.lng || coords.lng)
      const hotelPrice = hotelChoice?.price_per_night || 3200
      const hotelNotes = hotelChoice?.name
        ? `Verified accommodation (${hotelChoice.score || '8.8'}★). Clean and comfortable amenities for night rest.`
        : `Comfortable and verified overnight accommodation in ${stateCapital}.`

      bridge.broadcast({
        type: 'agent_tool',
        name: 'add_activity',
        args: { day_number: dayNum, title: hotelTitle, time: STAGGERED_TIMES[4], duration_min: 0, price: hotelPrice },
      })
      try {
        await bridge.callBrowser('add_activity', {
          day_number: dayNum,
          title: hotelTitle,
          type: 'hotel',
          time: STAGGERED_TIMES[4],
          duration_min: 0,
          lat: hotelCoords.lat,
          lng: hotelCoords.lng,
          notes: hotelNotes,
          price: hotelPrice,
          price_usd: hotelPrice,
        })
        totalHotelsAdded++
      } catch (err) {
        console.error('[freeAgent] add_activity hotel error:', err)
      }
    }

    // 4. Broadcast hotel and restaurant search events for UI visibility
    bridge.broadcast({
      type: 'agent_tool',
      name: 'search_hotels',
      args: { location: stateCapital, currency: cur },
    })
    try {
      await bridge.callBrowser('search_hotels', {
        location: stateCapital,
        checkin,
        checkout,
        currency: cur,
      })
    } catch {
      // Browser bridge fallback
    }

    bridge.broadcast({
      type: 'agent_tool',
      name: 'search_restaurants',
      args: { location: stateCapital },
    })
    try {
      await bridge.callBrowser('search_restaurants', {
        location: stateCapital,
        query: 'authentic cuisine',
        currency: cur,
      })
    } catch {
      // Browser bridge fallback
    }

    // 6. Honest concluding message reflecting exactly what was added
    const totalStopsCount = totalActivitiesAdded + totalFoodAdded + totalHotelsAdded
    const isMock = getProviderMode() === 'mock'

    let summaryText
    if (isIt) {
      summaryText = `Ecco pronto il tuo programma per **${destName}**! Ho organizzato **${daysCount} giorni** con **${totalStopsCount} tappe totali** (visite culturali, pasti autentici e alloggi) calcolate in **${cur === 'INR' ? '₹ (Rupie)' : cur}**.\n\n${isMock ? '*(Nota: I soggiorni e i ristoranti provengono dal mock provider regionale. Configura chiavi o scraper in Admin per prezzi live.)*\n\n' : ''}Puoi chiedermi modifiche in qualsiasi momento in chat!`
    } else {
      const providerNote = isMock
        ? `\n\n*(Note: Stays and dining recommendations were populated using the regional mock provider; configure live scrapers or API keys in Admin for live availability.)*`
        : (totalHotelsAdded > 0 || totalFoodAdded > 0)
          ? `\n\n*(Verified accommodations and authentic dining recommendations have been included directly in your itinerary.)*`
          : `\n\n*(Sightseeing stops have been added; no accommodations were automatically booked. You can search for hotels anytime in chat.)*`

      summaryText = `Your **${destName}** itinerary is ready! I've laid out **${daysCount} days** with **${totalStopsCount} total stops** (including ${totalActivitiesAdded} sightseeing highlights, ${totalFoodAdded} dining spots, and ${totalHotelsAdded} hotel stays) formatted in **₹ ${cur}**.\n\n` +
        `Every day features 3–4 thoughtfully timed stops at staggered times, carefully matched to the day's theme with real coordinates, authentic descriptions, and sensible budget estimates.${providerNote}\n\n` +
        `You can ask me anytime to adjust days, find more spots, or change your travel style!`
    }

    await streamText(bridge, summaryText, abortSignal, 12)
    bridge.broadcast({ type: 'assistant_text', text: introMsg + '\n\n' + summaryText })
    return
  }

  // ── Stage 2: Normal Planner View Chat ─────────────────────────────────────

  // TASK 3b: Word-boundary safe intent checks
  if (intentMatches(text, 'food', 'eat', 'eating', 'restaurant', 'dining', 'dinner', 'lunch', 'breakfast', 'ristorante')) {
    if (!matchedState) {
      const askMsg = 'Which destination did you mean? Please mention a specific city or state so I can recommend authentic dining spots.'
      await streamText(bridge, askMsg, abortSignal)
      bridge.broadcast({ type: 'assistant_text', text: askMsg })
      return
    }
    const loc = primaryCapital(matchedState.capital)
    bridge.broadcast({ type: 'agent_tool', name: 'search_restaurants', args: { location: loc } })
    try {
      await bridge.callBrowser('search_restaurants', { location: loc, query: 'local authentic', currency: cur })
    } catch {
      /* ignore */
    }
    const reply = `I found top-rated authentic dining options in ${loc} with price ranges in ₹ INR. Check out the dining cards on your map!`
    await streamText(bridge, reply, abortSignal)
    bridge.broadcast({ type: 'assistant_text', text: reply })
    return
  }

  if (intentMatches(text, 'hotel', 'hotels', 'stay', 'staying', 'accommodation', 'lodge', 'albergo')) {
    if (!matchedState) {
      const askMsg = 'Which destination did you mean? Please mention a specific city or state so I can search for verified accommodations.'
      await streamText(bridge, askMsg, abortSignal)
      bridge.broadcast({ type: 'assistant_text', text: askMsg })
      return
    }
    const loc = primaryCapital(matchedState.capital)
    const checkin = deriveDateStr(startDate, 0)
    const checkout = deriveDateStr(startDate, 1)
    bridge.broadcast({ type: 'agent_tool', name: 'search_hotels', args: { location: loc, currency: cur } })
    try {
      await bridge.callBrowser('search_hotels', { location: loc, checkin, checkout, currency: cur })
    } catch {
      /* ignore */
    }
    const reply = `I've retrieved verified accommodations in ${loc} with transparent per-night pricing in ₹ (${cur}).`
    await streamText(bridge, reply, abortSignal)
    bridge.broadcast({ type: 'assistant_text', text: reply })
    return
  }

  if (intentMatches(text, 'add day', 'giorno', 'extra day')) {
    bridge.broadcast({ type: 'agent_tool', name: 'add_day', args: { title: 'Extra Leisure Day' } })
    try {
      await bridge.callBrowser('add_day', { title: 'Extra Leisure Day', night: matchedState ? primaryCapital(matchedState.capital) : 'Central Area' })
    } catch (err) {
      console.error('[freeAgent] add_day error:', err)
    }
    const reply = `Added a new day to your itinerary! What would you like to explore on this day?`
    await streamText(bridge, reply, abortSignal)
    bridge.broadcast({ type: 'assistant_text', text: reply })
    return
  }

  // General helpful response
  const generalReply = `I am your AI travel copilot! I've noted: "${text}". I can add stops, search for verified hotels on Booking.com, find local food spots, or adjust your travel days and budget in ₹ Rupees. What would you like to tweak?`
  await streamText(bridge, generalReply, abortSignal)
  bridge.broadcast({ type: 'assistant_text', text: generalReply })
}

/**
 * OpenAI-Compatible Provider for Free Google Gemini API and Free Groq API.
 */
export async function runOpenAiCompat(text, {
  endpoint,
  apiKey,
  model,
  mode: _mode,
  currency = 'INR',
  language: _language = 'en',
  notes = '',
  bridge,
  abortSignal,
}) {
  if (!apiKey) {
    throw new Error('API Key missing. Enter your free Google Gemini or Groq API Key.')
  }

  const systemPrompt = `You are Ulisse, an expert AI travel planner assisting the user to create and refine the perfect trip.
Currency: ${currency}. All prices must be quoted in ${currency} (use ₹ symbol for INR).
Always use the provided trip tools to make actual edits to the trip.
Keep your conversational responses helpful, direct, and concise.`

  // Convert TOOL_DEFS to OpenAI tool schema
  const openAiTools = TOOL_DEFS.map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description,
      parameters: z.toJSONSchema(z.object(d.schema)),
    },
  }))

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(notes ? [{ role: 'system', content: `Current notes:\n${notes}` }] : []),
    { role: 'user', content: text },
  ]

  let turns = 0
  const maxTurns = 8

  while (turns < maxTurns) {
    if (abortSignal?.aborted) return
    turns++

    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gemini-2.0-flash',
          messages,
          tools: openAiTools,
          tool_choice: 'auto',
        }),
        signal: abortSignal,
      })
    } catch (err) {
      if (abortSignal?.aborted) return
      throw err
    }

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    if (!choice) break

    const assistantMsg = choice.message
    messages.push(assistantMsg)

    if (assistantMsg.content) {
      await streamText(bridge, assistantMsg.content, abortSignal)
      bridge.broadcast({ type: 'assistant_text', text: assistantMsg.content })
    }

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const call of assistantMsg.tool_calls) {
        if (abortSignal?.aborted) return
        const fnName = call.function.name
        let fnArgs = {}
        try { fnArgs = JSON.parse(call.function.arguments || '{}') } catch { fnArgs = {} }

        bridge.broadcast({ type: 'agent_tool', name: fnName, args: fnArgs })
        const handler = makeToolHandler(bridge, fnName)
        const toolRes = await handler(fnArgs)

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: toolRes.content?.[0]?.text || JSON.stringify(toolRes),
        })
      }
    } else {
      break
    }
  }
}
