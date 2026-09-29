// Base price ranges in INR for India-appropriate restaurant mock data
const SAMPLE_RESTAURANT_TEMPLATES = [
  {
    namePrefix: 'Spice Garden',
    rating: 4.7,
    review_count: 1850,
    price_range: '\u20b9800\u20131,500',
    category: 'North Indian & Mughlai',
    addressSuffix: 'Main Market Road',
    latOffset: 0.003,
    lngOffset: -0.002,
  },
  {
    namePrefix: 'The Biryani House',
    rating: 4.6,
    review_count: 2420,
    price_range: '\u20b9400\u2013800',
    category: 'Biryani & Kebabs',
    addressSuffix: 'Near Clock Tower',
    latOffset: -0.002,
    lngOffset: 0.004,
  },
  {
    namePrefix: 'Royal Thali Palace',
    rating: 4.8,
    review_count: 980,
    price_range: '\u20b91,800\u20133,000',
    category: 'Fine Dining & Multi-Cuisine',
    addressSuffix: 'Hotel Complex, MG Road',
    latOffset: 0.006,
    lngOffset: 0.007,
  },
  {
    namePrefix: 'Desi Dhaba',
    rating: 4.5,
    review_count: 3100,
    price_range: '\u20b9500\u20131,000',
    category: 'Punjabi & Street Food',
    addressSuffix: 'Highway Chowk',
    latOffset: -0.004,
    lngOffset: -0.005,
  },
  {
    namePrefix: 'South Indian Sagar',
    rating: 4.4,
    review_count: 670,
    price_range: '\u20b9600\u20131,200',
    category: 'South Indian Vegetarian',
    addressSuffix: 'Temple Street',
    latOffset: 0.008,
    lngOffset: -0.006,
  },
  {
    namePrefix: 'Chai & Snacks Corner',
    rating: 4.3,
    review_count: 420,
    price_range: '\u20b9100\u2013300',
    category: 'Chai Cafe & Quick Bites',
    addressSuffix: 'Bus Stand Road',
    latOffset: -0.001,
    lngOffset: -0.003,
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
  const lat = 8 + ((hash % 27000) / 1000)
  const lng = 68 + (((hash >>> 5) % 29000) / 1000)
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) }
}

const WORLD_CITY_COORDS = {
  paris: { lat: 48.8566, lng: 2.3522 },
  london: { lat: 51.5074, lng: -0.1278 },
  rome: { lat: 41.9028, lng: 12.4964 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  dubai: { lat: 25.2048, lng: 55.2708 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  bali: { lat: -8.4095, lng: 115.1889 },
}

function getBaseCoords(loc, args) {
  if (typeof args?.lat === 'number' && typeof args?.lng === 'number') {
    return { lat: args.lat, lng: args.lng }
  }
  const low = loc.toLowerCase().trim()
  if (WORLD_CITY_COORDS[low]) return WORLD_CITY_COORDS[low]
  return hashLocationToCoords(loc)
}

/**
 * Mock restaurant search provider returning realistic India-centric fake data.
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

    if (!location) throw new Error('location is required.')

    const searchQuery = what ? `${what} in ${location}` : `restaurants in ${location}`
    const searchUrl =
      'https://www.google.com/maps/search/' + encodeURIComponent(searchQuery) + '?hl=en'

    const baseCoords = getBaseCoords(location, args)

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

      // Base price_range is in INR; convert to USD or EUR if requested
      let priceRange = tmpl.price_range
      if (args?.currency === 'USD') {
        priceRange = priceRange
          .replace('\u20b9100\u2013300', '$1\u20134')
          .replace('\u20b9400\u2013800', '$5\u201310')
          .replace('\u20b9500\u20131,000', '$6\u201312')
          .replace('\u20b9600\u20131,200', '$7\u201315')
          .replace('\u20b9800\u20131,500', '$10\u201318')
          .replace('\u20b91,000\u20131,800', '$12\u201322')
          .replace('\u20b91,800\u20133,000', '$22\u201336')
      } else if (args?.currency === 'EUR') {
        priceRange = priceRange
          .replace('\u20b9100\u2013300', '\u20ac1\u20134')
          .replace('\u20b9400\u2013800', '\u20ac5\u20139')
          .replace('\u20b9500\u20131,000', '\u20ac6\u201311')
          .replace('\u20b9600\u20131,200', '\u20ac7\u201314')
          .replace('\u20b9800\u20131,500', '\u20ac9\u201317')
          .replace('\u20b91,000\u20131,800', '\u20ac11\u201320')
          .replace('\u20b91,800\u20133,000', '\u20ac20\u201333')
      }

      return {
        name,
        rating: tmpl.rating,
        review_count: tmpl.review_count,
        price_range: priceRange,
        category: what ? `${what} \u00b7 ${tmpl.category}` : tmpl.category,
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
      note: `[MOCK] Simulated Google Maps data for test/demo, sorted by quality. Coordinates are within the requested destination in India.`,
    }
  }
}

export const mockRestaurantProvider = new MockRestaurantProvider()
