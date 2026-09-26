const SAMPLE_RESTAURANT_TEMPLATES = [
  {
    namePrefix: 'Trattoria Da Marco',
    rating: 4.7,
    review_count: 1850,
    price_range: '€20–30',
    category: 'Traditional Trattoria',
    addressSuffix: 'Via Roma 12',
    latOffset: 0.003,
    lngOffset: -0.002,
  },
  {
    namePrefix: 'Osteria Del Centro',
    rating: 4.6,
    review_count: 2420,
    price_range: '€15–25',
    category: 'Osteria & Wine Bar',
    addressSuffix: 'Piazza del Popolo 5',
    latOffset: -0.002,
    lngOffset: 0.004,
  },
  {
    namePrefix: 'Ristorante Bellavista',
    rating: 4.8,
    review_count: 980,
    price_range: '€40–60',
    category: 'Fine Dining & Seafood',
    addressSuffix: 'Via Panorama 18',
    latOffset: 0.006,
    lngOffset: 0.007,
  },
  {
    namePrefix: 'Pizzeria Bella Napoli',
    rating: 4.5,
    review_count: 3100,
    price_range: '€12–20',
    category: 'Pizza & Fritti',
    addressSuffix: 'Corso Vittorio Emanuele 44',
    latOffset: -0.004,
    lngOffset: -0.005,
  },
  {
    namePrefix: 'Il Porticciolo',
    rating: 4.4,
    review_count: 670,
    price_range: '€25–35',
    category: 'Seafood Restaurant',
    addressSuffix: 'Lungomare Porto 3',
    latOffset: 0.008,
    lngOffset: -0.006,
  },
  {
    namePrefix: 'Caffè & Cucina Storica',
    rating: 4.3,
    review_count: 420,
    price_range: '€10–18',
    category: 'Café & Bistro',
    addressSuffix: 'Via Garibaldi 8',
    latOffset: -0.001,
    lngOffset: -0.003,
  },
]

// Simple deterministic hash to get reasonable base coordinates for any location name
function hashLocationToCoords(loc) {
  let hash = 0
  for (let i = 0; i < loc.length; i++) {
    hash = (hash * 31 + loc.charCodeAt(i)) >>> 0
  }
  const lat = 40 + ((hash % 10000) / 1000)
  const lng = 10 + (((hash >> 4) % 10000) / 1000)
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) }
}

/**
 * Mock restaurant search provider returning realistic fake data without network/browser.
 * @implements {import('./types.mjs').RestaurantProvider}
 */
export class MockRestaurantProvider {
  /**
   * @param {import('./types.mjs').RestaurantSearchArgs} args
   * @returns {Promise<import('./types.mjs').RestaurantSearchResult>}
   */
  async searchRestaurants(args) {
    const location = String(args?.location ?? '').trim()
    const what = String(args?.query ?? '').trim()
    const maxResults = Math.max(2, Math.min(6, Number(args?.max_results) || 4))

    if (!location) throw new Error('location mancante.')

    const searchQuery = what ? `${what} in ${location}` : `restaurants in ${location}`
    const searchUrl =
      'https://www.google.com/maps/search/' + encodeURIComponent(searchQuery) + '?hl=en'

    const baseCoords = hashLocationToCoords(location)

    const places = SAMPLE_RESTAURANT_TEMPLATES.map((tmpl, idx) => {
      const name = what
        ? `${tmpl.namePrefix} (${what.charAt(0).toUpperCase() + what.slice(1)})`
        : tmpl.namePrefix
      const address = `${tmpl.addressSuffix}, ${location}`
      const placeId = `ChIJ_mock_restaurant_${idx + 1}`
      const directUrl =
        'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(`${name}, ${address}`) +
        '&query_place_id=' +
        placeId

      let priceRange = tmpl.price_range
      if (args?.currency === 'INR') {
        priceRange = tmpl.price_range
          .replace('€10–18', '₹400–800')
          .replace('€12–20', '₹500–1,000')
          .replace('€15–25', '₹600–1,200')
          .replace('€20–30', '₹800–1,500')
          .replace('€25–35', '₹1,000–1,800')
          .replace('€40–60', '₹1,800–3,000')
      } else if (args?.currency === 'USD') {
        priceRange = tmpl.price_range.replace(/€/g, '$')
      }

      return {
        name,
        rating: tmpl.rating,
        review_count: tmpl.review_count,
        price_range: priceRange,
        category: what ? `${what} · ${tmpl.category}` : tmpl.category,
        address,
        lat: Number((baseCoords.lat + tmpl.latOffset).toFixed(5)),
        lng: Number((baseCoords.lng + tmpl.lngOffset).toFixed(5)),
        url: directUrl,
      }
    })

    // Bayesian sort matching places.mjs: (n / (n + 150)) * s + (150 / (n + 150)) * 4.0
    const bayes = (p) => {
      const n = p.review_count ?? 0
      const s = p.rating ?? 0
      return (n / (n + 150)) * s + (150 / (n + 150)) * 4.0
    }
    places.sort((a, b) => bayes(b) - bayes(a))

    return {
      location,
      query: searchQuery,
      search_url: searchUrl,
      results_found: 18,
      places: places.slice(0, maxResults),
      note: `[MOCK] Dati simulati Google Maps per test/demo, ordinati per qualità AFFIDABILE.`,
    }
  }
}

export const mockRestaurantProvider = new MockRestaurantProvider()
