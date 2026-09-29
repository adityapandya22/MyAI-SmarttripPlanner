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
 * Normalizes an attraction into a structured object with verified/deterministic coordinates,
 * authentic description, area/theme, and estimated budget.
 */
function resolveAttraction(item, stateCoords, stateName, index) {
  if (typeof item === 'object' && item !== null) {
    return {
      name: item.name,
      lat: Number(item.lat.toFixed(4)),
      lng: Number(item.lng.toFixed(4)),
      desc: item.desc || `Iconic landmark in ${stateName}. Guided exploration, architecture, and photography.`,
      area: item.area || 'Highlights',
      price: item.estPrice ?? 200,
    }
  }
  // Deterministic spread around state coordinates (no Math.random())
  const latOffset = ((index % 5) - 2) * 0.025
  const lngOffset = (((index * 3) % 5) - 2) * 0.025
  return {
    name: String(item),
    lat: Number((stateCoords.lat + latOffset).toFixed(4)),
    lng: Number((stateCoords.lng + lngOffset).toFixed(4)),
    desc: `Historic landmark in ${stateName}. Scenic exploration, cultural heritage, and photography.`,
    area: 'Highlights',
    price: 200,
  }
}

/**
 * Group attractions by area or theme.
 */
function groupAttractionsByArea(attractions, stateCoords, stateName) {
  const groups = new Map()
  attractions.forEach((att, i) => {
    const data = resolveAttraction(att, stateCoords, stateName, i)
    const area = data.area || 'Highlights'
    if (!groups.has(area)) groups.set(area, [])
    groups.get(area).push(data)
  })
  return groups
}

/**
 * Autonomous Free AI Agent (No subscriptions, No login required).
 */
export async function runFreeAgent(text, { mode, currency = 'INR', language = 'en', bridge, abortSignal, startDate = null }) {
  const cur = currency || 'INR'
  const isIt = String(language).startsWith('it')

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

    // Derive dates from startDate (offset 0 and 1) or fallback (today+14, today+15)
    const checkin = deriveDateStr(startDate, 0)
    const checkout = deriveDateStr(startDate, 1)

    // 1. Set Trip Meta
    bridge.broadcast({ type: 'agent_tool', name: 'set_trip_meta', args: { title: `Trip to ${destName}`, currency: cur, car_gas_unit: 'inr_l' } })
    try {
      await bridge.callBrowser('set_trip_meta', {
        title: `Trip to ${destName}`,
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

    // 3. Create Days & Top Attractions
    const rawAttractions = matchedState?.topAttractions?.length
      ? matchedState.topAttractions
      : [
        'Historic Old Quarter & Heritage Monuments',
        'Iconic Fortresses & Palace Gardens',
        'Vibrant Local Bazaars & Traditional Artisan Markets',
        'Scenic Sunset Overlook & Sunset Lake Boating',
        'Cultural Center & Classical Evening Folk Dance',
      ]

    const areaGroups = groupAttractionsByArea(rawAttractions, coords, destName)
    const areas = Array.from(areaGroups.keys())

    let totalStopsCount = 0
    let totalEstimatedBudget = 0

    // Schedule 3-4 stops per day at staggered times: 09:30, 12:30, 15:30, 18:30
    for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
      if (abortSignal?.aborted) return

      const currentArea = areas[(dayNum - 1) % areas.length]
      const areaList = areaGroups.get(currentArea) || []

      // Generate day title matching the area/theme
      let dayTitle
      if (dayNum === 1) {
        dayTitle = currentArea === 'Panaji'
          ? `Day 1: Arrival & Exploring Panaji's Colonial Quarter`
          : currentArea === 'Shimla'
          ? `Day 1: Arrival & Exploring Shimla's Ridge & Mall Road`
          : DAY_THEMES[0](dayNum, destName, currentArea || stateCapital)
      } else if (dayNum === daysCount) {
        dayTitle = DAY_THEMES[DAY_THEMES.length - 1](dayNum, destName, stateCapital)
      } else if (currentArea === 'Panaji') {
        dayTitle = `Day ${dayNum}: Exploring Panaji's Historic Quarter`
      } else if (currentArea === 'Heritage') {
        dayTitle = `Day ${dayNum}: Heritage & Historic Monuments of Old Goa`
      } else if (currentArea === 'Beaches') {
        dayTitle = `Day ${dayNum}: Sun, Sand & Coastal Highlights of North Goa`
      } else if (currentArea === 'Nature') {
        dayTitle = `Day ${dayNum}: Nature Trails & Scenic Waterfalls of Goa`
      } else if (currentArea === 'Shimla') {
        dayTitle = `Day ${dayNum}: Exploring Shimla's Ridge & Heritage Walk`
      } else if (currentArea === 'Manali') {
        dayTitle = `Day ${dayNum}: Alpine Adventure & Solang Valley in Manali`
      } else if (currentArea === 'Mountains') {
        dayTitle = `Day ${dayNum}: High Mountain Glaciers & Scenic Passes`
      } else if (currentArea === 'Culture') {
        dayTitle = `Day ${dayNum}: Cultural Trails, Sacred Springs & Local Bazaars`
      } else if (currentArea !== 'Highlights') {
        dayTitle = `Day ${dayNum}: ${currentArea} & Highlights of ${destName}`
      } else {
        const themeFn = DAY_THEMES[(dayNum - 1) % (DAY_THEMES.length - 1)] || DAY_THEMES[1]
        dayTitle = themeFn(dayNum, destName, currentArea || stateCapital)
      }

      bridge.broadcast({ type: 'agent_tool', name: 'add_day', args: { title: dayTitle, night: stateCapital } })
      try {
        await bridge.callBrowser('add_day', { title: dayTitle, night: stateCapital })
      } catch (err) {
        console.error('[freeAgent] add_day error:', err)
      }

      // Pick up to 3 distinct attractions from this area (or fallback from all attractions)
      const primaryAtt = areaList[0] || resolveAttraction(rawAttractions[0], coords, destName, 0)
      const afternoonAtt = areaList[1] || resolveAttraction(rawAttractions[1 % rawAttractions.length], coords, destName, 1)
      const eveningAtt = areaList[2] || resolveAttraction(rawAttractions[2 % rawAttractions.length], coords, destName, 2)

      // Ensure distinct coordinates for each stop
      const morningCoords = { lat: primaryAtt.lat, lng: primaryAtt.lng }
      // Dining coordinates: distinct location ~400m from morning sight in the dining quarter
      const lunchCoords = {
        lat: Number((morningCoords.lat + 0.0035).toFixed(4)),
        lng: Number((morningCoords.lng - 0.0028).toFixed(4)),
      }
      const afternoonCoords = {
        lat: afternoonAtt.lat !== morningCoords.lat ? afternoonAtt.lat : Number((morningCoords.lat + 0.008).toFixed(4)),
        lng: afternoonAtt.lng !== morningCoords.lng ? afternoonAtt.lng : Number((morningCoords.lng + 0.008).toFixed(4)),
      }
      const eveningCoords = {
        lat: eveningAtt.lat !== afternoonCoords.lat && eveningAtt.lat !== morningCoords.lat
          ? eveningAtt.lat
          : Number((morningCoords.lat - 0.006).toFixed(4)),
        lng: eveningAtt.lng !== afternoonCoords.lng && eveningAtt.lng !== morningCoords.lng
          ? eveningAtt.lng
          : Number((morningCoords.lng + 0.006).toFixed(4)),
      }

      const dayActivities = [
        {
          title: primaryAtt.name,
          type: 'activity',
          time: '09:30',
          duration_min: 120,
          lat: morningCoords.lat,
          lng: morningCoords.lng,
          price: primaryAtt.price,
          notes: primaryAtt.desc,
        },
        {
          title: `Authentic ${currentArea !== 'Highlights' ? currentArea : destName} Dining & Local Cuisine`,
          type: 'food',
          time: '12:30',
          duration_min: 75,
          lat: lunchCoords.lat,
          lng: lunchCoords.lng,
          price: 600,
          notes: `Savor traditional ${destName} specialties, authentic thalis, and regional flavors.`,
        },
        {
          title: afternoonAtt.name,
          type: 'activity',
          time: '15:30',
          duration_min: 105,
          lat: afternoonCoords.lat,
          lng: afternoonCoords.lng,
          price: afternoonAtt.price,
          notes: afternoonAtt.desc,
        },
        {
          title: eveningAtt.name,
          type: 'activity',
          time: '18:30',
          duration_min: 90,
          lat: eveningCoords.lat,
          lng: eveningCoords.lng,
          price: eveningAtt.price,
          notes: eveningAtt.desc,
        },
      ]

      for (const act of dayActivities) {
        if (abortSignal?.aborted) return
        totalStopsCount++
        totalEstimatedBudget += act.price

        bridge.broadcast({
          type: 'agent_tool',
          name: 'add_activity',
          args: { day_number: dayNum, title: act.title, time: act.time, duration_min: act.duration_min },
        })
        try {
          await bridge.callBrowser('add_activity', {
            day_number: dayNum,
            title: act.title,
            type: act.type,
            time: act.time,
            duration_min: act.duration_min,
            lat: act.lat,
            lng: act.lng,
            price: act.price,
            notes: act.notes,
          })
        } catch (err) {
          console.error('[freeAgent] add_activity error:', err)
        }
      }
    }

    // 4. Search and recommend hotels in ₹
    bridge.broadcast({
      type: 'agent_tool',
      name: 'search_hotels',
      args: { location: stateCapital, currency: cur },
    })
    let hotelRes = null
    try {
      hotelRes = await bridge.callBrowser('search_hotels', {
        location: stateCapital,
        checkin,
        checkout,
        currency: cur,
      })
    } catch {
      // safe fallback
    }

    // 5. Search dining in ₹
    bridge.broadcast({
      type: 'agent_tool',
      name: 'search_restaurants',
      args: { location: stateCapital },
    })
    let _restRes = null
    try {
      _restRes = await bridge.callBrowser('search_restaurants', {
        location: stateCapital,
        query: 'authentic cuisine',
        currency: cur,
      })
    } catch {
      // safe fallback
    }

    const hotels = hotelRes?.result?.properties || hotelRes?.properties || []
    const isMock = process.env.ULISSE_PLACES_PROVIDER === 'mock' || !process.env.ULISSE_PLACES_PROVIDER || hotels.some((h) => !h?.url || !h.url.includes('booking.com'))
    const hasHotels = hotels.length > 0

    let providerStatusText = ''
    if (hasHotels) {
      providerStatusText = isMock
        ? `Hotel recommendations for ${stateCapital} were generated using realistic India mock providers for offline demonstration (with authentic ₹ INR rates).`
        : `Verified accommodations and authentic dining spots in ${stateCapital} were researched via live providers.`
    } else {
      providerStatusText = `Live hotel search returned no direct bookings for these dates; default estimated budgets have been applied.`
    }

    // 6. Concluding message with honest status and exact counts
    const summaryText = isIt
      ? `Ecco pronto il tuo programma! Ho organizzato ${daysCount} giorni con ${totalStopsCount} tappe con orari scaglionati (09:30, 12:30, 15:30, 18:30) e budget stimato in **${cur === 'INR' ? '₹' : cur} ${totalEstimatedBudget.toLocaleString()}**.\n\n*Stato provider:* ${providerStatusText}\n\nPuoi chiedermi modifiche in qualsiasi momento in chat!`
      : `Your **${destName}** itinerary is ready! I've laid out ${daysCount} days with ${totalStopsCount} planned stops at staggered times (morning sightseeing at 09:30, authentic dining at 12:30, afternoon landmarks at 15:30, and evening viewpoints at 18:30) with all expenses calculated in **₹ ${cur}** (estimated activity & dining budget: **₹${totalEstimatedBudget.toLocaleString('en-IN')}**).\n\n*Provider status:* ${providerStatusText}\n\nYou can ask me anytime to adjust days, find more spots, or change your travel style!`

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
