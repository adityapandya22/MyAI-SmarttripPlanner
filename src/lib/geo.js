import i18n from '../i18n'
/* Geo helpers: distances, optimal insertion of a stop, free road routing (OSRM) */

export function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Find the cheapest place to insert a new stop into the whole trip.
 * The trip is treated as one continuous chain of located stops (day after day);
 * for every gap we compute the extra distance the detour adds, and return the
 * day + item-array index of the best gap.
 */
export function bestInsertion(trip, point) {
  const chain = [] // { dayId, itemIndex, coord }
  const days = Array.isArray(trip?.days) ? trip.days : []
  days.forEach((day) => {
    if (!day || !Array.isArray(day.items)) return
    day.items.forEach((it, itemIndex) => {
      if (it && it.lat != null && it.lng != null) {
        chain.push({ dayId: day.id, itemIndex, coord: [it.lat, it.lng] })
      }
    })
  })
  if (!chain.length) {
    const day = days[0]
    return day ? { dayId: day.id, index: Array.isArray(day.items) ? day.items.length : 0, addedKm: 0 } : null
  }
  if (!point || point.lat == null || point.lng == null) {
    const day = days[0]
    return day ? { dayId: day.id, index: Array.isArray(day.items) ? day.items.length : 0, addedKm: 0 } : null
  }

  const p = [point.lat, point.lng]
  let best = null
  for (let k = 0; k < chain.length - 1; k++) {
    const a = chain[k]
    const b = chain[k + 1]
    const addedKm = haversineKm(a.coord, p) + haversineKm(p, b.coord) - haversineKm(a.coord, b.coord)
    if (best && addedKm >= best.addedKm) continue
    /* same-day gap → insert right after a; day boundary → attach to the nearer side */
    let dayId, index
    if (a.dayId === b.dayId || haversineKm(a.coord, p) <= haversineKm(p, b.coord)) {
      dayId = a.dayId
      index = a.itemIndex + 1
    } else {
      dayId = b.dayId
      index = b.itemIndex
    }
    best = { dayId, index, addedKm }
  }
  /* ends of the chain */
  const endpoints = [
    { node: chain[0], index: chain[0].itemIndex, addedKm: haversineKm(chain[0].coord, p) * 2 },
    { node: chain[chain.length - 1], index: chain[chain.length - 1].itemIndex + 1, addedKm: haversineKm(chain[chain.length - 1].coord, p) * 2 },
  ]
  for (const e of endpoints) {
    if (!best || e.addedKm <= best.addedKm) best = { dayId: e.node.dayId, index: e.index, addedKm: e.addedKm }
  }
  return { ...best, addedKm: Math.round(best.addedKm) }
}

/**
 * Per-day coordinate chains forming one continuous round trip:
 * each day's leg starts where the previous located day ended (wrapping,
 * so day 1 begins at the end of the last day and the loop closes).
 */
export function chainedDayCoords(trip) {
  const layers = trip.days.map((day) => ({
    day,
    pts: day.items.filter((it) => it.lat != null).map((it) => [it.lat, it.lng]),
  }))
  const withPts = layers.filter((l) => l.pts.length > 0)
  return layers.map((l) => {
    const pos = withPts.indexOf(l)
    if (pos === -1 || withPts.length < 2) return { dayId: l.day.id, coords: l.pts }
    const prev = withPts[(pos - 1 + withPts.length) % withPts.length]
    return { dayId: l.day.id, coords: [prev.pts[prev.pts.length - 1], ...l.pts] }
  })
}

/* straight-line day length × road factor — fallback when OSRM hasn't answered */
export function estimateDayKm(coords) {
  let km = 0
  for (let i = 0; i < coords.length - 1; i++) km += haversineKm(coords[i], coords[i + 1])
  return km * 1.25
}

/* per-leg travel estimate for the agent: real routing for car/bus/walk,
   great-circle distance for train/plane/boat (times must be web-verified) */
export async function estimateTravel(from, to, mode) {
  const pair = [[from.lat, from.lng], [to.lat, to.lng]]
  if (mode === 'car' || mode === 'bus') {
    const r = await fetchRoadRoute(pair, 'driving')
    if (r) return { mode, km: Math.round(r.km * 10) / 10, minutes: Math.round(r.min), source: 'osrm-driving' }
  }
  if (mode === 'walk') {
    const r = await fetchRoadRoute(pair, 'foot')
    if (r) return { mode, km: Math.round(r.km * 10) / 10, minutes: Math.round(r.min), source: 'osrm-foot' }
    const km = haversineKm(pair[0], pair[1]) * 1.3
    return { mode, km: Math.round(km * 10) / 10, minutes: Math.round((km / 4.7) * 60), source: 'stima-4.7km/h' }
  }
  const km = haversineKm(pair[0], pair[1])
  return {
    mode,
    km: Math.round(km),
    minutes: null,
    source: 'distanza in linea d’aria',
    note: 'Durata non stimabile senza orari reali: verifica con una ricerca web (treni/voli/traghetti).',
  }
}

/* ---------- place search (Nominatim, free) ---------- */

/** Normalize a search query for consistent caching and cleaner Nominatim results. */
function normQuery(q) {
  return String(q).trim().toLowerCase().replace(/\s+/g, ' ')
}

// Simple in-memory search cache to avoid duplicate requests
const placeSearchCache = new Map()
// Counter used to detect stale concurrent requests
let _searchReqId = 0

/**
 * Search for places using Nominatim (free OSM geocoder).
 * - Normalizes the query and caches on the normalized key
 * - Adds countrycodes=in when the query looks India-related
 * - Uses a request ID so stale responses never overwrite newer ones
 * - Returns [] on empty/error (never throws)
 *
 * @param {string} q  raw search query
 * @param {object} [opts]
 * @param {boolean} [opts.indiaOnly]  force countrycodes=in
 * @returns {Promise<Array<{lat,lng,name,short,boundingbox}>>}
 */
export async function searchPlaces(q, opts = {}) {
  const normalized = normQuery(q)
  if (!normalized) return []

  const cacheKey = opts.indiaOnly ? `in:${normalized}` : normalized
  if (placeSearchCache.has(cacheKey)) return placeSearchCache.get(cacheKey)

  const reqId = ++_searchReqId
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  // Add countrycodes=in when explicitly requested OR when query looks India-specific
  const isIndia = opts.indiaOnly ||
    /\b(india|bharat|\bap\b|hp\b|up\b|rajasthan|gujarat|kerala|karnataka|tamil|bengal|odisha|assam|delhi|mumbai|kolkata|chennai|hyderabad|bengaluru|bangalore|pune|jaipur|lucknow|varanasi|agra|goa|shimla|manali|ladakh|kashmir)\b/i
      .test(normalized)

  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '6',
    'accept-language': i18n.language,
    q: normalized,
  })
  if (isIndia) params.set('countrycodes', 'in')

  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    // Ignore stale response if a newer request has started
    if (reqId !== _searchReqId) return []

    if (!r.ok) return []
    const data = await r.json()
    if (!Array.isArray(data) || data.length === 0) return []

    const results = data.map((p) => ({
      lat: +(+p.lat).toFixed(5),
      lng: +(+p.lon).toFixed(5),
      name: p.display_name,
      short: p.display_name.split(',')[0],
      boundingbox: p.boundingbox,   // [south, north, west, east] strings
    }))

    placeSearchCache.set(cacheKey, results)
    return results
  } catch (err) {
    clearTimeout(timeout)
    if (err?.name === 'AbortError') {
      console.warn('[geo] searchPlaces timeout for query:', normalized)
    } else {
      console.error('[geo] searchPlaces error:', err)
    }
    return []
  }
}

/* ---------- turn-by-turn directions (OSRM, free) ---------- */

const MOD_IT = {
  left: 'a sinistra',
  right: 'a destra',
  'slight left': 'leggermente a sinistra',
  'slight right': 'leggermente a destra',
  'sharp left': 'decisamente a sinistra',
  'sharp right': 'decisamente a destra',
  straight: 'dritto',
  uturn: 'con inversione a U',
}

function stepText(s) {
  const type = s.maneuver?.type
  const mod = MOD_IT[s.maneuver?.modifier] ?? ''
  const name = s.name ? ` su ${s.name}` : ''
  switch (type) {
    case 'depart': return `Parti${name}`
    case 'arrive': return 'Arrivo a destinazione'
    case 'new name': return `Continua${name}`
    case 'merge': return `Immettiti ${mod}${name}`.trim()
    case 'on ramp': return `Prendi la rampa${name ? ` verso${name.slice(3)}` : ''}`
    case 'off ramp': return `Prendi l'uscita${name ? ` verso${name.slice(3)}` : ''}`
    case 'fork': return `Al bivio tieni ${mod}${name}`.trim()
    case 'roundabout':
    case 'rotary': return `Alla rotonda prendi la ${s.maneuver?.exit ?? 1}ª uscita${name}`
    case 'exit roundabout': return `Esci dalla rotonda${name}`
    case 'continue': return `Prosegui ${mod}${name}`.trim()
    case 'end of road': return `A fine strada svolta ${mod}${name}`.trim()
    case 'turn': return `Svolta ${mod}${name}`.trim()
    default: return `Prosegui${name}`
  }
}

export async function fetchDirections(a, b) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}` +
    `?overview=full&geometries=geojson&steps=true`
  const r = await fetch(url)
  if (!r.ok) return null
  const data = await r.json()
  const route = data?.routes?.[0]
  if (!route?.geometry?.coordinates) return null
  return {
    latlngs: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    km: route.distance / 1000,
    min: route.duration / 60,
    steps: (route.legs?.[0]?.steps ?? []).map((s) => ({
      text: stepText(s),
      km: s.distance / 1000,
    })),
  }
}

/* ---------- free road routing via the public OSRM demo server ---------- */

const OSRM_CACHE_KEY = 'osrm.v2'
let memCache = null
function loadCache() {
  if (!memCache) {
    try { memCache = JSON.parse(localStorage.getItem(OSRM_CACHE_KEY) || '{}') } catch { memCache = {} }
  }
  return memCache
}
function saveCache() {
  try {
    const keys = Object.keys(memCache)
    /* keep the cache bounded */
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((k) => delete memCache[k])
    localStorage.setItem(OSRM_CACHE_KEY, JSON.stringify(memCache))
  } catch { /* quota — ignore */ }
}

let queue = Promise.resolve()

/* OSRM endpoints per profile: driving on the official demo, walking on FOSSGIS */
const OSRM_BASES = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
}

/**
 * Road-following route through the given [lat,lng] waypoints.
 * Returns { latlngs, km, min } or null on failure (caller falls back to straight lines).
 * Cached in localStorage; requests are queued to be gentle with the demo servers.
 */
export function fetchRoadRoute(coords, profile = 'driving') {
  if (coords.length < 2) return Promise.resolve(null)
  const key = `${profile === 'foot' ? 'f:' : ''}` + coords.map((c) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`).join(';')
  const cache = loadCache()
  if (cache[key]) return Promise.resolve(cache[key])

  const run = async () => {
    const path = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `${OSRM_BASES[profile] ?? OSRM_BASES.driving}/${path}?overview=full&geometries=geojson&steps=false`
    const r = await fetch(url)
    if (!r.ok) return null
    const data = await r.json()
    const route = data?.routes?.[0]
    if (!route?.geometry?.coordinates) return null
    const result = {
      latlngs: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      km: route.distance / 1000,
      min: route.duration / 60,
    }
    cache[key] = result
    saveCache()
    return result
  }

  const p = queue.then(run).catch(() => null)
  queue = p.then(() => new Promise((res) => setTimeout(res, 350)))
  return p
}
