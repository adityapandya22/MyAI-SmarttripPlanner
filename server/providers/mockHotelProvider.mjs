const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const SAMPLE_HOTEL_TEMPLATES = [
  {
    nameSuffix: 'Grand Hotel & Suites',
    baseRatePerNightEur: 165,
    score: 9.3,
    reviews: 1420,
    available: true,
    latOffset: 0.005,
    lngOffset: -0.003,
  },
  {
    nameSuffix: 'Boutique Hotel & Spa',
    baseRatePerNightEur: 135,
    score: 8.9,
    reviews: 980,
    available: true,
    latOffset: -0.004,
    lngOffset: 0.006,
  },
  {
    nameSuffix: 'Historic Center Suites',
    baseRatePerNightEur: 115,
    score: 8.7,
    reviews: 620,
    available: true,
    latOffset: 0.002,
    lngOffset: 0.004,
  },
  {
    nameSuffix: 'Riverside Lodge',
    baseRatePerNightEur: 95,
    score: 8.4,
    reviews: 430,
    available: true,
    latOffset: -0.006,
    lngOffset: -0.005,
  },
  {
    nameSuffix: 'Cozy B&B',
    baseRatePerNightEur: 75,
    score: 9.1,
    reviews: 310,
    available: true,
    latOffset: 0.008,
    lngOffset: 0.002,
  },
  {
    nameSuffix: 'Panorama View Hotel',
    baseRatePerNightEur: 190,
    score: 9.6,
    reviews: 840,
    available: false,
    latOffset: 0.012,
    lngOffset: -0.008,
  },
  {
    nameSuffix: 'Modern City Loft',
    baseRatePerNightEur: 105,
    score: 8.2,
    reviews: 210,
    available: true,
    latOffset: -0.003,
    lngOffset: -0.007,
  },
]

// Simple deterministic hash to get reasonable base coordinates for any location name
function hashLocationToCoords(loc) {
  let hash = 0
  for (let i = 0; i < loc.length; i++) {
    hash = (hash * 31 + loc.charCodeAt(i)) >>> 0
  }
  // Deterministic coordinate in typical mid-latitudes
  const lat = 40 + ((hash % 10000) / 1000)
  const lng = 10 + (((hash >> 4) % 10000) / 1000)
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
      // Scale EUR price to USD (~1.08x) or INR (~90x) if requested
      const rateMultiplier = (currency === 'INR' ? 90 : currency === 'USD' ? 1.08 : 1) * rooms
      const rawPrice = tmpl.baseRatePerNightEur * rateMultiplier
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
      note: `[MOCK] Prezzi TOTALI reali per ${nights} notti, ${adults} adulti (Booking.com simulation), ordinati per qualità AFFIDABILE.`,
    }
  }
}

export const mockHotelProvider = new MockHotelProvider()
