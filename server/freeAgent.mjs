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
  (n, dest, cap) => `Day ${n}: Arrival & Exploring ${cap}`,
  (n, dest) => `Day ${n}: Heritage & Highlights of ${dest}`,
  (n, dest) => `Day ${n}: Cultural Immersion & Local Markets`,
  (n, dest) => `Day ${n}: Nature & Scenic Trails`,
  (n, dest) => `Day ${n}: Hidden Gems & Off-the-beaten Path`,
  (n, dest) => `Day ${n}: Adventure & Outdoor Excursions`,
  (n, dest) => `Day ${n}: Sacred Temples & Spiritual Sites`,
  (n, dest) => `Day ${n}: Art, Architecture & Museums`,
  (n, dest) => `Day ${n}: Lakes, Gardens & Leisure`,
  (n, dest) => `Day ${n}: Food Trail & Culinary Experiences`,
  (n, dest) => `Day ${n}: Handicraft Villages & Artisan Workshops`,
  (n, dest) => `Day ${n}: Sunrise Excursion & Photography`,
  (n, dest) => `Day ${n}: Wildlife Safari & Nature Reserve`,
  (n, dest) => `Day ${n}: Local Bazaars & Farewell`,
]

/**
 * Derive ISO date string offset by `offsetDays` from today (or tripStartDate if provided).
 * @param {string|null} tripStartDate  ISO date string or null
 * @param {number} offsetDays
 * @returns {string}  YYYY-MM-DD
 */
function deriveDateStr(tripStartDate, offsetDays = 0) {
  const base = tripStartDate ? new Date(tripStartDate) : new Date()
  if (isNaN(base.getTime())) {
    // fallback: today + 14 days
    const fallback = new Date()
    fallback.setDate(fallback.getDate() + 14 + offsetDays)
    return fallback.toISOString().slice(0, 10)
  }
  base.setDate(base.getDate() + offsetDays)
  return base.toISOString().slice(0, 10)
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
        ? `I couldn't find "${rawPlace}" in my India destination database. Did you mean a specific state or city? For example, try "Himachal Pradesh", "Manali", "Goa", or "Kerala".`
        : `I couldn't identify a destination from your request. Please name a specific Indian state, city, or landmark — for example "Rajasthan", "Manali", "Kerala backwaters".`

      await streamText(bridge, clarificationMsg, abortSignal, 12)
      bridge.broadcast({ type: 'assistant_text', text: clarificationMsg })
      return
    }

    const destName = matchedState.name
    const stateCapital = primaryCapital(matchedState.capital)
    const userDays = parseDaysFromText(text)
    const daysCount = Math.min(userDays || matchedState?.suggestedDays || 5, 14)
    const coords = matchedState?.coords || { lat: 26.9124, lng: 75.7873 }

    // TASK 3d: Derive dates from startDate or today + 14
    const checkin = deriveDateStr(startDate, 14)
    const checkout = deriveDateStr(startDate, 15)

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
    // TASK 3c: Use real attraction names from state data (no random offsets)
    const attractions = matchedState?.topAttractions?.length
      ? matchedState.topAttractions
      : [
        'Historic Old Quarter & Heritage Monuments',
        'Iconic Fortresses & Palace Gardens',
        'Vibrant Local Bazaars & Traditional Artisan Markets',
        'Scenic Sunset Overlook & Sunset Lake Boating',
        'Cultural Center & Classical Evening Folk Dance',
      ]

    for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
      if (abortSignal?.aborted) return

      let dayTitle
      if (dayNum === 1) {
        dayTitle = DAY_THEMES[0](dayNum, destName, stateCapital)
      } else if (dayNum === daysCount) {
        dayTitle = DAY_THEMES[DAY_THEMES.length - 1](dayNum, destName, stateCapital)
      } else {
        const midThemes = DAY_THEMES.length - 2
        const themeIdx = 1 + ((dayNum - 2) % midThemes)
        dayTitle = DAY_THEMES[themeIdx](dayNum, destName, stateCapital)
      }

      bridge.broadcast({ type: 'agent_tool', name: 'add_day', args: { title: dayTitle, night: stateCapital } })
      try {
        await bridge.callBrowser('add_day', { title: dayTitle, night: stateCapital })
      } catch (err) {
        console.error('[freeAgent] add_day error:', err)
      }

      // Add activities for this day – use state centre (no random offsets)
      const attIndex = (dayNum - 1) % attractions.length
      const attTitle = attractions[attIndex]

      bridge.broadcast({
        type: 'agent_tool',
        name: 'add_activity',
        args: { day_number: dayNum, title: attTitle, time: '10:00', duration_min: 120 },
      })
      try {
        await bridge.callBrowser('add_activity', {
          day_number: dayNum,
          title: attTitle,
          type: 'activity',
          time: '10:00',
          duration_min: 120,
          lat: Number(coords.lat.toFixed(4)),
          lng: Number(coords.lng.toFixed(4)),
          notes: `Iconic must-visit destination in ${destName}. Guided exploration and photography.`,
        })
      } catch (err) {
        console.error('[freeAgent] add_activity error:', err)
      }
    }

    // 4. Search and recommend hotels in ₹
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
      // In case browser bridge doesn't implement executor, fallback safely
    }

    // 5. Search dining in ₹
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
      // Fallback safely
    }

    // 6. Concluding message
    const summaryText = isIt
      ? `Ecco pronto il tuo programma! Ho organizzato ${daysCount} tappe principali con alberghi e ristoranti tipici con prezzi indicati in ${cur}. Puoi chiedermi modifiche in qualsiasi momento in chat!`
      : `Your **${destName}** itinerary is ready! I've laid out ${daysCount} days with balanced activities, real hotel recommendations, and authentic dining spots formatted in **₹ ${cur}**.\n\nYou can ask me anytime to adjust days, find more spots, or change your travel style!`

    await streamText(bridge, summaryText, abortSignal, 12)
    bridge.broadcast({ type: 'assistant_text', text: introMsg + '\n\n' + summaryText })
    return
  }

  // ── Stage 2: Normal Planner View Chat ─────────────────────────────────────

  // TASK 3b: Word-boundary safe intent checks
  if (intentMatches(text, 'food', 'eat', 'eating', 'restaurant', 'dining', 'dinner', 'lunch', 'breakfast', 'ristorante')) {
    const loc = matchedState ? primaryCapital(matchedState.capital) : 'Jaipur'
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
    const loc = matchedState ? primaryCapital(matchedState.capital) : 'Jaipur'
    const checkin = deriveDateStr(startDate, 14)
    const checkout = deriveDateStr(startDate, 15)
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
