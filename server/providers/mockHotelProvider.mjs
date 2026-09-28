const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Base rates in INR (Indian Rupees) for realistic India hotel pricing
const SAMPLE_HOTEL_TEMPLATES = [
  {
    nameSuffix: 'Grand Hotel & Suites',
    baseRatePerNightInr: 8500,
    score: 9.3,
    reviews: 1420,
    available: true,
    latOffset: 0.005,
    lngOffset: -0.003,
  },
  {
    nameSuffix: 'Boutique Hotel & Spa',
    baseRatePerNightInr: 6500,
    score: 8.9,
    reviews: 980,
    available: true,
    latOffset: -0.004,
    lngOffset: 0.006,
  },
  {
    nameSuffix: 'Heritage Haveli Suites',
    baseRatePerNightInr: 5200,
    score: 8.7,
    reviews: 620,
    available: true,
    latOffset: 0.002,
    lngOffset: 0.004,
  },
  {
    nameSuffix: 'River View Resort',
    baseRatePerNightInr: 4000,
    score: 8.4,
    reviews: 430,
    available: true,
    latOffset: -0.006,
    lngOffset: -0.005,
  },
  {
    nameSuffix: 'Budget Traveller Inn',
    baseRatePerNightInr: 1800,
    score: 9.1,
    reviews: 310,
    available: true,
    latOffset: 0.008,
    lngOffset: 0.002,
  },
  {
    nameSuffix: 'Panorama Hill Resort',
    baseRatePerNightInr: 11000,
    score: 9.6,
    reviews: 840,
    available: false,
    latOffset: 0.012,
    lngOffset: -0.008,
  },
  {
    nameSuffix: 'Modern City Stay',
    baseRatePerNightInr: 3500,
    score: 8.2,
    reviews: 210,
    available: true,
    latOffset: -0.003,
    lngOffset: -0.007,
  },
]

/**
 * Deterministic hash-based coordinates centred within India.
 * India lat range: ~8-35, lng range: ~68-97
 */
function hashLocationToCoords(loc) {
  let hash = 0
  for (let i = 0; i < loc.length; i++) {
    hash = (hash * 31 + loc.charCodeAt(i)) >>> 0
  }
  // lat: 8 + 0..27  ->  8..35  (India N-S span)
  const lat = 8 + ((hash % 27000) / 1000)
  // lng: 68 + 0..29 -> 68..97  (India W-E span)
  const lng = 68 + (((hash >>> 5) % 29000) / 1000)
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) }
}

/**
 * Mock hotel search provider returning realistic fake data without network/browser.
 * @implements {import('./types.mjs').HotelProvider}
 */
export class MockHotelProvider {
  /**
   * @param {import('./types.mjs').HotelSearchArgs} args
   * @returns {Promise<import('./types.mjs').HotelSearchResult>}
   */
  async searchHotels(args) {
    const location = String(args?.location ?? '').trim()
    const checkin = String(args?.checkin ?? '')
    const checkout = String(args?.checkout ?? '')
    const adults = Math.max(1, Math.min(10, Number(args?.adults) || 2))
    const rooms = Math.max(1, Math.min(5, Number(args?.rooms) || 1))
    const currency = args?.currency === 'USD' ? 'USD' : args?.currency === 'INR' ? 'INR' : 'EUR'
    const maxResults = Math.max(1, Math.min(10, Number(args?.max_results) || 6))

    if (!location) throw new Error('location mancante.')
    if (!DATE_RE.test(checkin) || !DATE_RE.test(checkout)) {
      throw new Error('checkin/checkout devono essere date YYYY-MM-DD.')
    }
    const nights = Math.round((new Date(checkout) - new Date(checkin)) / 86_400_000)
    if (nights < 1) throw new Error('checkout deve essere successivo a checkin.')

    const baseCoords = hashLocationToCoords(location)
    const searchUrl =
      'https://www.booking.com/searchresults.html?' +
      new URLSearchParams({
        ss: location,
        checkin,
        checkout,
        group_adults: String(adults),
        no_rooms: String(rooms),
        group_children: '0',
        selected_currency: currency,
        lang: 'en-us',
        order: 'review_score_and_price',
      })

    const properties = SAMPLE_HOTEL_TEMPLATES.map((tmpl, idx) => {
      const available = tmpl.available
      // Base rates are stored in INR; convert to other currencies if needed
      const inrRate = tmpl.baseRatePerNightInr * rooms
      let rawPrice
      if (currency === 'USD') rawPrice = inrRate / 84
      else if (currency === 'EUR') rawPrice = inrRate / 90
      else rawPrice = inrRate
      const pricePerNight = available
        ? (currency === 'INR' ? Math.round(rawPrice / 50) * 50 : Math.round(rawPrice))
        : null
      const totalPrice = available ? pricePerNight * nights : null
      const slug = `mock-hotel-${idx + 1}`
      const deepLink =
        `https://www.booking.com/hotel/it/${slug}.html?` +
        new URLSearchParams({
          checkin,
          checkout,
          group_adults: String(adults),
          no_rooms: String(rooms),
          selected_currency: currency,
        })

      return {
        name: `${location} ${tmpl.nameSuffix}`,
        available,
        total_price: totalPrice,
        price_per_night: pricePerNight,
        currency,
        review_score: tmpl.score,
        review_count: tmpl.reviews,
        lat: Number((baseCoords.lat + tmpl.latOffset).toFixed(5)),
        lng: Number((baseCoords.lng + tmpl.lngOffset).toFixed(5)),
        url: deepLink,
      }
    })

    // Bayesian sort matching booking.mjs: available first, then bayesian rank
    const bayes = (p) => {
      const n = p.review_count ?? 0
      const s = p.review_score ?? 0
      return (n / (n + 30)) * s + (30 / (n + 30)) * 8.0
    }
    properties.sort((a, b) => (b.available - a.available) || (bayes(b) - bayes(a)))

    return {
      location,
      resolved_as: location,
      checkin,
      checkout,
      nights,
      adults,
      rooms,
      search_url: searchUrl,
      results_found: 24,
      properties: properties.slice(0, maxResults),
      note: `[MOCK] Total prices for ${nights} nights, ${adults} adults (Booking.com simulation), sorted by quality. Coordinates are within the requested destination in India.`,
    }
  }
}

export const mockHotelProvider = new MockHotelProvider()
