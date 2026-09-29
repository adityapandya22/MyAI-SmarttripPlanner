/**
 * Server-Side World Places Service for MyTripPlanner.
 *
 * Free, keyless worldwide destination search, POI retrieval, and itinerary clustering.
 * Services used:
 * - OpenStreetMap Nominatim (Geocoding with 1 req/sec rate limiting & 24h LRU caching)
 * - Wikipedia API (Geosearch & extracts for authentic POIs)
 * - OpenStreetMap Overpass API (Keyless tourism fallback)
 * - Bundled offline attractions for ~40 top international destinations
 * - OSRM (Keyless driving routes & distance estimation)
 */

/* =========================================================================
   1. IN-MEMORY LRU CACHE WITH TTL (24 hours)
   ========================================================================= */

export class SimpleLRUCache {
  constructor(max = 500, ttlMs = 24 * 60 * 60 * 1000) {
    this.max = max
    this.ttlMs = ttlMs
    this.cache = new Map()
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return null
    }
    // Refresh LRU order
    this.cache.delete(key)
    this.cache.set(key, item)
    return item.value
  }

  set(key, value) {
    if (value === undefined || value === null) return
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.max) {
      // Evict oldest (first key in map iterator)
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  clear() {
    this.cache.clear()
  }
}

export const geocodeCache = new SimpleLRUCache(500)
export const poiCache = new SimpleLRUCache(300)

/* =========================================================================
   2. GLOBAL RATE LIMITER & RETRY HELPER (Max 1 req/sec for Nominatim)
   ========================================================================= */

class NominatimRateLimiter {
  constructor(minDelayMs = 1000) {
    this.minDelayMs = minDelayMs
    this.lastRequestTime = 0
    this.queue = []
    this.processing = false
  }

  async schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.processQueue()
    })
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    while (this.queue.length > 0) {
      const now = Date.now()
      const timeSinceLast = now - this.lastRequestTime
      if (timeSinceLast < this.minDelayMs) {
        await new Promise((r) => setTimeout(r, this.minDelayMs - timeSinceLast))
      }
      this.lastRequestTime = Date.now()

      const { fn, resolve, reject } = this.queue.shift()
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    }

    this.processing = false
  }
}

export const nominatimLimiter = new NominatimRateLimiter(1050)

export function getNominatimUserAgent() {
  const email = process.env.NOMINATIM_EMAIL || 'adityapandya4729@gmail.com'
  return `MyTripPlanner/1.0 (contact: ${email})`
}

export function isWorldPlacesEnabled() {
  return process.env.WORLD_PLACES_ENABLED !== 'false'
}

/**
 * Execute fetch with timeout, abort signal, and 1 retry with exponential backoff.
 */
export async function fetchWithRetry(url, options = {}, retries = 1, timeoutMs = 10000) {
  let attempt = 0
  let lastError = null

  while (attempt <= retries) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)

    let combinedSignal = controller.signal
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer)
        throw new Error('Aborted')
      }
      options.signal.addEventListener('abort', () => controller.abort(new Error('Aborted')), { once: true })
    }

    try {
      const res = await fetch(url, {
        ...options,
        signal: combinedSignal,
      })
      clearTimeout(timer)
      if (res.ok) return res
      if (res.status === 429 && attempt < retries) {
        // Rate limit backoff
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        attempt++
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      lastError = err
      if (options.signal?.aborted) throw err
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        attempt++
        continue
      }
      throw lastError
    }
  }
  throw lastError || new Error(`Fetch failed for ${url}`)
}

/* =========================================================================
   3. QUERY NORMALIZATION & FILLER STRIPPING
   ========================================================================= */

const FILLER_REGEX = /\b(i|we|want|would|like|looking|plan|planning|a|an|the|trip|to|visit|visiting|vacation|holiday|itinerary|tour|of|for|days?|nights?|in|around|explore|exploring|travel|traveling|somewhere|please|build|create|make|suggest|need|let's|go)\b/gi

/**
 * Clean user text and extract destination candidate query and potential trip days.
 */
export function normalizeQuery(rawText) {
  if (!rawText || typeof rawText !== 'string') return { cleaned: '', days: null }
  const text = rawText.trim()

  // Extract day count: e.g. "8 to 10 days", "5 days", "3 nights", "for 7 days"
  let days = null
  const rangeMatch = text.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*[- ]?\s*(?:days?|giorni|nights?)/i)
  if (rangeMatch) {
    days = Math.max(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10))
  } else {
    const singleMatch = text.match(/(?:for\s+)?(\d+)\s*[- ]?\s*(?:days?|giorni|nights?)/i)
    if (singleMatch) days = parseInt(singleMatch[1], 10)
  }

  // Remove day counts and numbers from destination query
  let cleaned = text.replace(/(\d+)\s*(?:to|-)\s*(\d+)\s*[- ]?\s*(?:days?|giorni|nights?)/gi, ' ')
  cleaned = cleaned.replace(/(?:for\s+)?\d+\s*[- ]?\s*(?:days?|giorni|nights?)/gi, ' ')

  // Remove filler phrases
  cleaned = cleaned.replace(FILLER_REGEX, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return { cleaned, days }
}

/* =========================================================================
   4. COUNTRY TO CURRENCY & BUDGET MAPPING (~60 countries)
   ========================================================================= */

export const COUNTRY_CURRENCY_MAP = {
  // Eurozone
  fr: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 140 },
  de: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 130 },
  it: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 135 },
  es: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 110 },
  nl: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 150 },
  pt: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 95 },
  gr: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 105 },
  at: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 140 },
  be: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 145 },
  ie: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 160 },
  fi: { code: 'EUR', symbol: '€', name: 'Euro', dailyBudget: 155 },

  // Americas
  us: { code: 'USD', symbol: '$', name: 'US Dollar', dailyBudget: 220 },
  ca: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', dailyBudget: 190 },
  mx: { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso', dailyBudget: 1400 },
  br: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', dailyBudget: 420 },
  ar: { code: 'ARS', symbol: '$', name: 'Argentine Peso', dailyBudget: 85000 },
  cl: { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso', dailyBudget: 95000 },
  pe: { code: 'PEN', symbol: 'S/.', name: 'Peruvian Sol', dailyBudget: 260 },
  co: { code: 'COP', symbol: 'COL$', name: 'Colombian Peso', dailyBudget: 320000 },

  // UK & non-Euro Europe
  gb: { code: 'GBP', symbol: '£', name: 'British Pound', dailyBudget: 130 },
  ch: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', dailyBudget: 210 },
  no: { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', dailyBudget: 1700 },
  se: { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', dailyBudget: 1600 },
  dk: { code: 'DKK', symbol: 'kr', name: 'Danish Krone', dailyBudget: 1200 },
  is: { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna', dailyBudget: 28000 },
  cz: { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', dailyBudget: 2200 },
  pl: { code: 'PLN', symbol: 'zł', name: 'Polish Złoty', dailyBudget: 380 },
  hu: { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', dailyBudget: 36000 },
  tr: { code: 'TRY', symbol: '₺', name: 'Turkish Lira', dailyBudget: 2900 },

  // Asia & Middle East
  in: { code: 'INR', symbol: '₹', name: 'Indian Rupee', dailyBudget: 4500 },
  ae: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', dailyBudget: 550 },
  sa: { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', dailyBudget: 600 },
  qa: { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal', dailyBudget: 600 },
  om: { code: 'OMR', symbol: 'OMR', name: 'Omani Rial', dailyBudget: 65 },
  jp: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', dailyBudget: 18000 },
  kr: { code: 'KRW', symbol: '₩', name: 'South Korean Won', dailyBudget: 170000 },
  cn: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', dailyBudget: 680 },
  hk: { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', dailyBudget: 1200 },
  tw: { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', dailyBudget: 3500 },
  sg: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', dailyBudget: 210 },
  my: { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', dailyBudget: 320 },
  th: { code: 'THB', symbol: '฿', name: 'Thai Baht', dailyBudget: 2400 },
  id: { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', dailyBudget: 1100000 },
  vn: { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', dailyBudget: 1400000 },
  ph: { code: 'PHP', symbol: '₱', name: 'Philippine Peso', dailyBudget: 3800 },
  np: { code: 'NPR', symbol: 'NPR', name: 'Nepalese Rupee', dailyBudget: 5200 },
  lk: { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', dailyBudget: 16000 },
  mv: { code: 'MVR', symbol: 'Rf', name: 'Maldivian Rufiyaa', dailyBudget: 2500 },

  // Africa & Oceania
  eg: { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', dailyBudget: 3200 },
  ma: { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham', dailyBudget: 950 },
  za: { code: 'ZAR', symbol: 'R', name: 'South African Rand', dailyBudget: 1600 },
  ke: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', dailyBudget: 14000 },
  au: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', dailyBudget: 230 },
  nz: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', dailyBudget: 240 },
}

export function getCurrencyForCountry(countryCode) {
  const cc = String(countryCode || '').toLowerCase().trim()
  if (COUNTRY_CURRENCY_MAP[cc]) return COUNTRY_CURRENCY_MAP[cc]
  return { code: 'USD', symbol: '$', name: 'US Dollar', dailyBudget: 150 }
}

/* =========================================================================
   5. BUNDLED TOP CITIES PER POPULAR COUNTRY (~40 countries)
   ========================================================================= */

export const BUNDLED_COUNTRY_CITIES = {
  japan: ['Tokyo', 'Kyoto', 'Osaka', 'Hiroshima', 'Nara'],
  france: ['Paris', 'Nice', 'Lyon', 'Marseille', 'Bordeaux'],
  italy: ['Rome', 'Florence', 'Venice', 'Milan', 'Naples'],
  spain: ['Barcelona', 'Madrid', 'Seville', 'Valencia', 'Granada'],
  germany: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne'],
  'united kingdom': ['London', 'Edinburgh', 'Manchester', 'Bath', 'Oxford'],
  uk: ['London', 'Edinburgh', 'Manchester', 'Bath', 'Oxford'],
  'united states': ['New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'Chicago'],
  usa: ['New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'Chicago'],
  australia: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Cairns'],
  canada: ['Toronto', 'Vancouver', 'Montreal', 'Quebec City', 'Banff'],
  thailand: ['Bangkok', 'Chiang Mai', 'Phuket', 'Krabi', 'Pattaya'],
  indonesia: ['Bali', 'Denpasar', 'Ubud', 'Jakarta', 'Yogyakarta'],
  uae: ['Dubai', 'Abu Dhabi', 'Sharjah'],
  'united arab emirates': ['Dubai', 'Abu Dhabi', 'Sharjah'],
  turkey: ['Istanbul', 'Cappadocia', 'Antalya', 'Bodrum', 'Izmir'],
  greece: ['Athens', 'Santorini', 'Mykonos', 'Crete', 'Rhodes'],
  netherlands: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht'],
  portugal: ['Lisbon', 'Porto', 'Sintra', 'Faro', 'Lagos'],
  switzerland: ['Zurich', 'Geneva', 'Lucerne', 'Interlaken', 'Zermatt'],
  austria: ['Vienna', 'Salzburg', 'Innsbruck', 'Hallstatt'],
  singapore: ['Singapore City', 'Marina Bay', 'Sentosa'],
  malaysia: ['Kuala Lumpur', 'Penang', 'Langkawi', 'Malacca'],
  vietnam: ['Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hoi An'],
  'south korea': ['Seoul', 'Busan', 'Jeju Island', 'Incheon'],
  korea: ['Seoul', 'Busan', 'Jeju Island', 'Incheon'],
  egypt: ['Cairo', 'Luxor', 'Aswan', 'Alexandria', 'Hurghada'],
  morocco: ['Marrakech', 'Casablanca', 'Fes', 'Chefchaouen'],
  'south africa': ['Cape Town', 'Johannesburg', 'Durban', 'Kruger'],
  newzealand: ['Auckland', 'Queenstown', 'Wellington', 'Christchurch'],
  'new zealand': ['Auckland', 'Queenstown', 'Wellington', 'Christchurch'],
  mexico: ['Mexico City', 'Cancun', 'Oaxaca', 'Playa del Carmen', 'Guadalajara'],
  brazil: ['Rio de Janeiro', 'Sao Paulo', 'Salvador', 'Brasilia'],
  nepal: ['Kathmandu', 'Pokhara', 'Chitwan', 'Lumbini'],
  srilanka: ['Colombo', 'Kandy', 'Galle', 'Ella', 'Sigiriya'],
  'sri lanka': ['Colombo', 'Kandy', 'Galle', 'Ella', 'Sigiriya'],
  maldives: ['Male', 'Maafushi', 'Hulhumale'],
  czechia: ['Prague', 'Cesky Krumlov', 'Brno'],
  'czech republic': ['Prague', 'Cesky Krumlov', 'Brno'],
  hungary: ['Budapest', 'Debrecen', 'Eger'],
  norway: ['Oslo', 'Bergen', 'Tromso', 'Stavanger'],
  sweden: ['Stockholm', 'Gothenburg', 'Malmo'],
  denmark: ['Copenhagen', 'Aarhus', 'Odense'],
}

/* =========================================================================
   6. BUNDLED OFFLINE ATTRACTIONS FOR ~40 POPULAR INTERNATIONAL CITIES
   ========================================================================= */

export const BUNDLED_CITIES_ATTRACTIONS = {
  paris: [
    { name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945, description: 'Iconic 330-metre wrought-iron lattice tower on the Champ de Mars, offering panoramic vistas of Paris.', category: 'monument' },
    { name: 'Louvre Museum', lat: 48.8606, lng: 2.3376, description: 'World’s largest and most visited art museum, housing masterpieces including the Mona Lisa and Venus de Milo.', category: 'museum' },
    { name: 'Notre-Dame Cathedral', lat: 48.8530, lng: 2.3499, description: 'Historic French Gothic cathedral on the Île de la Cité renowned for its flying buttresses and rose windows.', category: 'heritage' },
    { name: 'Arc de Triomphe', lat: 48.8738, lng: 2.2950, description: 'Triumphal monument honoring those who fought for France, crowning the western end of the Champs-Élysées.', category: 'monument' },
    { name: 'Musée d’Orsay', lat: 48.8599, lng: 2.3266, description: 'Grand Beaux-Arts railway station home to the world’s richest collection of Impressionist and Post-Impressionist art.', category: 'museum' },
    { name: 'Sacré-Cœur Basilica', lat: 48.8867, lng: 2.3431, description: 'Romano-Byzantine white stone basilica set atop the highest point in Paris on the historic Montmartre hill.', category: 'heritage' },
    { name: 'Sainte-Chapelle', lat: 48.8554, lng: 2.3450, description: 'Royal Gothic chapel celebrated for its breathtaking 13th-century stained-glass windows rising 15 metres high.', category: 'heritage' },
    { name: 'Tuileries Garden', lat: 48.8634, lng: 2.3275, description: 'Historic public garden designed by André Le Nôtre connecting the Louvre Museum with Place de la Concorde.', category: 'park' },
  ],
  london: [
    { name: 'Big Ben & Palace of Westminster', lat: 51.5007, lng: -0.1246, description: 'Iconic neo-Gothic clock tower and British Houses of Parliament situated along the scenic River Thames.', category: 'monument' },
    { name: 'Tower of London', lat: 51.5081, lng: -0.0759, description: 'Historic Norman castle and royal fortress guarding the Crown Jewels and 1,000 years of royal British history.', category: 'heritage' },
    { name: 'British Museum', lat: 51.5194, lng: -0.1270, description: 'World-renowned museum dedicated to human history, art and culture, housing the Rosetta Stone and Parthenon Sculptures.', category: 'museum' },
    { name: 'Buckingham Palace', lat: 51.5014, lng: -0.1419, description: 'The official London residence of the British monarch, famous for royal ceremonies and Changing of the Guard.', category: 'heritage' },
    { name: 'Tower Bridge', lat: 51.5055, lng: -0.0754, description: 'Iconic Victorian combined bascule and suspension bridge featuring glass-floored high-level walkways.', category: 'monument' },
    { name: 'London Eye', lat: 51.5033, lng: -0.1195, description: 'Giant cantilevered observation wheel on the South Bank offering 360-degree panoramic skyline views.', category: 'viewpoint' },
    { name: 'Westminster Abbey', lat: 51.4994, lng: -0.1273, description: 'Gothic abbey church that has been the coronation site for British monarchs since 1066.', category: 'heritage' },
  ],
  rome: [
    { name: 'Colosseum', lat: 41.8902, lng: 12.4922, description: 'Immense oval amphitheatre in the heart of Rome, once hosting gladiator contests and Roman spectacles.', category: 'heritage' },
    { name: 'Roman Forum', lat: 41.8925, lng: 12.4853, description: 'Sprawling archaeological forum that served as the bustling political, religious, and commercial core of Ancient Rome.', category: 'heritage' },
    { name: 'Pantheon', lat: 41.8986, lng: 12.4769, description: 'Remarkably preserved ancient Roman temple crowned with the world’s largest unreinforced concrete dome.', category: 'heritage' },
    { name: 'Trevi Fountain', lat: 41.9009, lng: 12.4833, description: 'Masterpiece of Baroque sculpture where tradition invites visitors to toss a coin into the waters to ensure return.', category: 'monument' },
    { name: 'Vatican Museums & Sistine Chapel', lat: 41.9065, lng: 12.4536, description: 'Papal art galleries showcasing Michelangelo’s magnificent ceiling frescoes and historic Renaissance treasures.', category: 'museum' },
    { name: 'Piazza Navona', lat: 41.8992, lng: 12.4731, description: 'Elegant piazza built over Domitian’s stadium, decorated by Bernini’s Fountain of the Four Rivers.', category: 'heritage' },
  ],
  tokyo: [
    { name: 'Senso-ji Temple', lat: 35.7148, lng: 139.7967, description: 'Ancient Buddhist temple in Asakusa founded in 645 AD, approached along the lively Nakamise-dori shopping street.', category: 'heritage' },
    { name: 'Tokyo Skytree', lat: 35.7100, lng: 139.8107, description: 'Broadcasting tower soaring 634 metres high, providing sweeping views across Tokyo and Mount Fuji on clear days.', category: 'viewpoint' },
    { name: 'Meiji Shrine', lat: 35.6764, lng: 139.6993, description: 'Serene Shinto shrine enveloped in a dense 170-acre forest in Shibuya, dedicated to Emperor Meiji.', category: 'heritage' },
    { name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005, description: 'The busiest pedestrian intersection in the world, surrounded by neon video screens and youthful energy.', category: 'viewpoint' },
    { name: 'Tokyo Tower', lat: 35.6586, lng: 139.7454, description: 'Communications and observation tower modeled on the Eiffel Tower, brightly lit in vibrant orange and white.', category: 'monument' },
    { name: 'Ueno Park & Tokyo National Museum', lat: 35.7188, lng: 139.7765, description: 'Expansive cultural park packed with cherry blossom trees, temples, and Japan’s premier art and archaeological collections.', category: 'museum' },
  ],
  dubai: [
    { name: 'Burj Khalifa', lat: 25.1972, lng: 55.2744, description: 'The world’s tallest skyscraper standing at 828 metres, with observation decks overlooking the Arabian Gulf.', category: 'viewpoint' },
    { name: 'The Dubai Mall & Fountain', lat: 25.1975, lng: 55.2785, description: 'Massive shopping, dining, and leisure complex featuring the choreographed Dubai Fountain show.', category: 'market' },
    { name: 'Dubai Miracle Garden', lat: 25.0601, lng: 55.2443, description: 'World’s largest natural flower garden with over 150 million blooming flowers arranged in imaginative shapes.', category: 'park' },
    { name: 'Dubai Frame', lat: 25.2355, lng: 55.3004, description: 'Striking 150-metre architectural landmark framing views of historic Old Dubai on one side and modern Dubai on the other.', category: 'viewpoint' },
    { name: 'Dubai Creek & Gold Souk', lat: 25.2711, lng: 55.2971, description: 'Historic saltwater inlet with traditional wooden abras leading to glittering gold, spice, and textile souks.', category: 'market' },
    { name: 'Palm Jumeirah & Atlantis', lat: 25.1304, lng: 55.1171, description: 'Iconic palm-tree-shaped artificial island featuring luxury beachfront resorts and water parks.', category: 'beach' },
  ],
  bali: [
    { name: 'Tanah Lot Temple', lat: -8.6212, lng: 115.0868, description: 'Ancient Hindu pilgrimage temple perched dramatically atop an offshore rock formation amidst crashing waves.', category: 'heritage' },
    { name: 'Uluwatu Temple & Sunset Amphitheatre', lat: -8.8291, lng: 115.0849, description: 'Clifftop sea temple perched 70m above the Indian Ocean, famous for its daily Kecak fire dance at sunset.', category: 'heritage' },
    { name: 'Tegallalang Rice Terraces', lat: -8.4326, lng: 115.2784, description: 'Stunning tiered emerald rice paddies in Ubud employing the ancient traditional Balinese Subak cooperative irrigation system.', category: 'nature' },
    { name: 'Sacred Monkey Forest Sanctuary', lat: -8.5190, lng: 115.2608, description: 'Lush rainforest sanctuary in Ubud home to hundreds of Balinese long-tailed macaques and ancient moss-covered shrines.', category: 'nature' },
    { name: 'Besakih Mother Temple', lat: -8.3740, lng: 115.4509, description: 'The holiest and largest temple complex in Bali, terraced on the southwest slopes of sacred Mount Agung.', category: 'heritage' },
    { name: 'Kuta & Seminyak Beach', lat: -8.7185, lng: 115.1686, description: 'World-famous sweeping coastline renowned for rolling surf breaks, golden sunsets, and beach clubs.', category: 'beach' },
  ],
  'new york': [
    { name: 'Statue of Liberty', lat: 40.6892, lng: -74.0445, description: 'Colossal neoclassical copper sculpture on Liberty Island gifted by France, a global symbol of freedom.', category: 'monument' },
    { name: 'Central Park', lat: 40.7851, lng: -73.9683, description: 'Urban oasis covering 843 acres between the Upper West and Upper East Sides of Manhattan.', category: 'park' },
    { name: 'Empire State Building', lat: 40.7484, lng: -73.9857, description: '102-story Art Deco skyscraper in Midtown Manhattan offering open-air 86th-floor views across the skyline.', category: 'viewpoint' },
    { name: 'Metropolitan Museum of Art', lat: 40.7794, lng: -73.9632, description: 'One of the world’s greatest art museums, with over two million works spanning five thousand years of history.', category: 'museum' },
    { name: 'Times Square', lat: 40.7580, lng: -73.9855, description: 'Major commercial intersection and entertainment hub famed for neon billboards, Broadway theaters, and energy.', category: 'monument' },
    { name: 'Brooklyn Bridge', lat: 40.7061, lng: -73.9969, description: 'Historic suspension bridge connecting Manhattan and Brooklyn with a scenic elevated wooden pedestrian boardwalk.', category: 'monument' },
  ],
}

/* =========================================================================
   7. DSA GEOGRAPHIC CLUSTERING & ROUTE OPTIMIZATION (Pure Functions)
   ========================================================================= */

/**
 * Calculate the great-circle distance between two coordinates in kilometers using Haversine formula.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Number((R * c).toFixed(2))
}

/**
 * Cluster an array of POIs into N geographic clusters using K-Means clustering.
 * If N >= POIs.length, returns 1 POI per cluster.
 * @param {Array<{lat: number, lng: number}>} points
 * @param {number} k Number of clusters / days
 * @returns {Array<Array<any>>}
 */
export function clusterPOIs(points, k) {
  if (!points || points.length === 0) return []
  const clusterCount = Math.max(1, Math.min(k, points.length))
  if (clusterCount === 1) return [points.slice()]

  // Initialize centroids by choosing points spaced apart (K-Means++ initialization)
  const centroids = [points[0]]
  while (centroids.length < clusterCount) {
    let farthestPoint = points[0]
    let maxDist = -1
    for (const p of points) {
      // Find distance to closest chosen centroid
      let minDist = Infinity
      for (const c of centroids) {
        const d = haversineKm(p.lat, p.lng, c.lat, c.lng)
        if (d < minDist) minDist = d
      }
      if (minDist > maxDist) {
        maxDist = minDist
        farthestPoint = p
      }
    }
    centroids.push(farthestPoint)
  }

  // Iterate assignment and centroid updates (max 20 iterations)
  let assignments = new Array(points.length).fill(0)
  for (let iter = 0; iter < 20; iter++) {
    let changed = false
    // Assignment step
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      let bestCluster = 0
      let bestDist = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const dist = haversineKm(p.lat, p.lng, centroids[c].lat, centroids[c].lng)
        if (dist < bestDist) {
          bestDist = dist
          bestCluster = c
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster
        changed = true
      }
    }
    if (!changed) break

    // Update step
    for (let c = 0; c < centroids.length; c++) {
      const clusterPoints = points.filter((_, idx) => assignments[idx] === c)
      if (clusterPoints.length > 0) {
        const avgLat = clusterPoints.reduce((sum, pt) => sum + pt.lat, 0) / clusterPoints.length
        const avgLng = clusterPoints.reduce((sum, pt) => sum + pt.lng, 0) / clusterPoints.length
        centroids[c] = { lat: avgLat, lng: avgLng }
      }
    }
  }

  // Group into clusters
  const clusters = []
  for (let c = 0; c < clusterCount; c++) {
    const pts = points.filter((_, idx) => assignments[idx] === c)
    if (pts.length > 0) clusters.push(pts)
  }

  // If any empty clusters due to density, balance by moving from biggest cluster
  return clusters
}

/**
 * Calculate total tour distance for an array of points in order.
 */
export function tourDistanceKm(points) {
  let dist = 0
  for (let i = 0; i < points.length - 1; i++) {
    dist += haversineKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng)
  }
  return Number(dist.toFixed(2))
}

/**
 * Optimize an array of stops using Nearest Neighbor followed by 2-Opt local search.
 * Guaranteed that the resulting route distance is <= the input order.
 * @param {Array<{lat: number, lng: number}>} points
 * @param {{lat: number, lng: number}} [startPoint] Optional starting origin from previous day
 * @returns {Array<any>} Optimized order of stops
 */
export function optimizeDayRoute(points, startPoint = null) {
  if (!points || points.length <= 2) return points ? points.slice() : []

  // 1. Nearest Neighbor constructive heuristic
  const unvisited = points.slice()
  const route = []

  let current = startPoint || unvisited[0]
  if (!startPoint) {
    route.push(unvisited.shift())
    current = route[0]
  }

  while (unvisited.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineKm(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng)
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    }
    const nextPt = unvisited.splice(nearestIdx, 1)[0]
    route.push(nextPt)
    current = nextPt
  }

  // 2. 2-Opt improvement local search
  let improved = true
  let bestDist = tourDistanceKm(route)
  let iterations = 0

  while (improved && iterations < 50) {
    improved = false
    iterations++
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        // Reverse sub-route between i and k
        const newRoute = route.slice(0, i).concat(route.slice(i, k + 1).reverse()).concat(route.slice(k + 1))
        const newDist = tourDistanceKm(newRoute)
        if (newDist < bestDist - 0.001) {
          bestDist = newDist
          route.splice(0, route.length, ...newRoute)
          improved = true
          break
        }
      }
      if (improved) break
    }
  }

  return route
}

/**
 * Derive meaningful theme title for a day from its collection of attractions.
 */
export function deriveDayTheme(dayNumber, dayStops, cityName) {
  if (!dayStops || dayStops.length === 0) return `Day ${dayNumber}: Highlights of ${cityName}`
  const categories = dayStops.map((s) => s.category || '').filter(Boolean)
  const names = dayStops.map((s) => s.name || '').join(' ').toLowerCase()

  if (names.includes('fort') || names.includes('palace') || categories.includes('heritage')) {
    return `Day ${dayNumber}: Historic Palaces & Heritage of ${cityName}`
  }
  if (names.includes('museum') || categories.includes('museum') || names.includes('art')) {
    return `Day ${dayNumber}: Art, Culture & Famous Museums`
  }
  if (names.includes('temple') || names.includes('shrine') || names.includes('cathedral') || names.includes('basilica')) {
    return `Day ${dayNumber}: Sacred Shrines, Cathedrals & Architecture`
  }
  if (names.includes('beach') || categories.includes('beach') || names.includes('coast')) {
    return `Day ${dayNumber}: Coastal Vistas, Beaches & Sunsets`
  }
  if (names.includes('park') || categories.includes('nature') || names.includes('garden')) {
    return `Day ${dayNumber}: Nature Trails, Gardens & Scenic Views`
  }
  if (names.includes('bazaar') || names.includes('market') || names.includes('souk')) {
    return `Day ${dayNumber}: Vibrant Local Bazaars & Shopping Walk`
  }

  return dayNumber === 1
    ? `Day 1: Arrival & Exploring Central ${cityName}`
    : `Day ${dayNumber}: Iconic Landmarks & Highlights of ${cityName}`
}

/* =========================================================================
   8. NOMINATIM GEOLOCATION SERVICE & DISAMBIGUATION
   ========================================================================= */

/**
 * Geocode destination query with Nominatim through rate limiter and cache.
 */
export async function geocodeWorldwide(query, { signal } = {}) {
  const norm = query.trim().toLowerCase()
  if (!norm) return []

  const cached = geocodeCache.get(norm)
  if (cached) return cached

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=5&accept-language=en`

  const data = await nominatimLimiter.schedule(async () => {
    const res = await fetchWithRetry(
      url,
      {
        headers: {
          'User-Agent': getNominatimUserAgent(),
          Accept: 'application/json',
        },
        signal,
      },
      1,
      10000,
    )
    if (!res.ok) return []
    return res.json()
  })

  if (Array.isArray(data) && data.length > 0) {
    geocodeCache.set(norm, data)
  }
  return Array.isArray(data) ? data : []
}

const SEARCH_STOP_WORDS = new Set([
  'i', 'we', 'want', 'would', 'like', 'plan', 'a', 'an', 'the', 'trip',
  'to', 'visit', 'vacation', 'holiday', 'itinerary', 'tour', 'of', 'for',
  'day', 'days', 'night', 'nights', 'in', 'around', 'explore', 'travel',
])

/**
 * Filter candidates to ensure searched text appears in name/display_name (whole-word, accent-insensitive).
 */
export function filterCandidatesMatchingSearch(candidates, searchText) {
  if (!candidates || candidates.length === 0) return []
  const cleanSearch = searchText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (!cleanSearch) return []

  const searchTokens = cleanSearch
    .split(/\s+/)
    .filter((t) => t && !SEARCH_STOP_WORDS.has(t))

  const tokensToCheck = searchTokens.length > 0 ? searchTokens : cleanSearch.split(/\s+/).filter(Boolean)

  return candidates.filter((c) => {
    const display = (c.display_name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const name = (c.name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

    return tokensToCheck.every((token) => {
      const isAscii = /^[\x00-\x7F]+$/.test(token)
      if (!isAscii) {
        return name.includes(token) || display.includes(token)
      }
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const reg = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
      return reg.test(name) || reg.test(display)
    })
  })
}

/**
 * Classify a candidate: city/town/village/island vs country/state/region.
 */
export function classifyCandidate(cand) {
  const type = String(cand.type || '').toLowerCase()
  const addresstype = String(cand.addresstype || '').toLowerCase()
  const candClass = String(cand.class || '').toLowerCase()

  const cityTypes = new Set([
    'city',
    'town',
    'village',
    'municipality',
    'island',
    'suburb',
    'hamlet',
    'borough',
    'administrative',
  ])

  const broadTypes = new Set(['country', 'state', 'region', 'continent', 'province'])

  if (broadTypes.has(type) || broadTypes.has(addresstype)) {
    return { isCity: false, type: 'country_or_region' }
  }

  if (cityTypes.has(type) || cityTypes.has(addresstype) || candClass === 'place') {
    return { isCity: true, type: 'city' }
  }

  return { isCity: true, type: 'city' }
}

/**
 * Disambiguate candidates. Returns `{ status: 'single'|'disambiguate'|'no_match', result, candidates }`
 */
export function resolveCandidates(candidates, originalQuery) {
  if (!candidates || candidates.length === 0) {
    return { status: 'no_match' }
  }

  const matches = filterCandidatesMatchingSearch(candidates, originalQuery)
  if (matches.length === 0) {
    return { status: 'no_match' }
  }

  if (matches.length === 1) {
    return { status: 'single', result: matches[0] }
  }

  // Check importance gap between top candidate and runner-up
  const top = matches[0]
  const second = matches[1]
  const topImp = Number(top.importance || 0)
  const secondImp = Number(second.importance || 0)

  // If top clearly dominates (> 0.12 gap), use it
  if (topImp - secondImp >= 0.12) {
    return { status: 'single', result: top }
  }

  // Otherwise, ambiguous: e.g. Paris (France) vs Paris (Texas)
  return {
    status: 'disambiguate',
    candidates: matches.slice(0, 3).map((c) => ({
      name: c.name,
      display_name: c.display_name,
      lat: Number(c.lat),
      lng: Number(c.lon),
      country_code: c.address?.country_code,
    })),
  }
}

/* =========================================================================
   9. ATTRACTION DATA PROVIDERS: WIKIPEDIA, OVERPASS, BUNDLED
   ========================================================================= */

const NON_TOURIST_REGEX = /\b(disambiguation|station|railway|hospital|high school|elementary|cemetery|police|district|suburb|street|avenue|road|constituency)\b/i

/**
 * Fetch tourist POIs from Wikipedia around coordinates using geosearch & extracts.
 */
export async function fetchWikipediaAttractions(lat, lng, signal = null) {
  const cacheKey = `wiki:${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`
  const cached = poiCache.get(cacheKey)
  if (cached) return cached

  // 1. Geosearch query
  const geoUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=10000&gslimit=50&format=json&origin=*`
  const geoRes = await fetchWithRetry(geoUrl, { signal }, 1, 8000)
  if (!geoRes.ok) return []
  const geoJson = await geoRes.json()
  const pages = geoJson?.query?.geosearch || []
  if (pages.length === 0) return []

  // 2. Filter obvious non-tourist page titles
  const candidatePages = pages.filter((p) => !NON_TOURIST_REGEX.test(p.title)).slice(0, 20)
  if (candidatePages.length === 0) return []

  const titles = candidatePages.map((p) => encodeURIComponent(p.title)).join('|')
  const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|coordinates&exintro=1&explaintext=1&exsentences=2&titles=${titles}&format=json&origin=*`

  const extractRes = await fetchWithRetry(extractUrl, { signal }, 1, 8000)
  if (!extractRes.ok) return []
  const extractJson = await extractRes.json()
  const pageMap = extractJson?.query?.pages || {}

  const attractions = []
  for (const p of candidatePages) {
    const details = pageMap[p.pageid] || {}
    const extract = (details.extract || '').trim()
    if (!extract || extract.length < 20 || NON_TOURIST_REGEX.test(extract)) continue

    let category = 'sight'
    const low = extract.toLowerCase()
    if (low.includes('museum') || low.includes('art gallery')) category = 'museum'
    else if (low.includes('park') || low.includes('garden')) category = 'park'
    else if (low.includes('palace') || low.includes('castle') || low.includes('fort')) category = 'heritage'
    else if (low.includes('temple') || low.includes('church') || low.includes('cathedral')) category = 'heritage'
    else if (low.includes('tower') || low.includes('bridge') || low.includes('monument')) category = 'monument'
    else if (low.includes('view') || low.includes('summit')) category = 'viewpoint'

    attractions.push({
      name: p.title,
      lat: Number(p.lat),
      lng: Number(p.lon),
      description: extract,
      category,
      source: 'Wikipedia (CC BY-SA)',
    })
  }

  if (attractions.length >= 6) {
    poiCache.set(cacheKey, attractions)
  }
  return attractions
}

/**
 * Fetch tourist POIs from OpenStreetMap Overpass API within 8km.
 */
export async function fetchOverpassAttractions(lat, lng, signal = null) {
  const cacheKey = `overpass:${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`
  const cached = poiCache.get(cacheKey)
  if (cached) return cached

  const overpassQuery = `[out:json][timeout:10];(node["tourism"~"attraction|museum|viewpoint"](around:8000,${lat},${lng}););out 30;`
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`

  try {
    const res = await fetchWithRetry(url, { signal }, 1, 8000)
    if (!res.ok) return []
    const data = await res.json()
    const elements = data?.elements || []

    const attractions = []
    const seenNames = new Set()

    for (const el of elements) {
      const name = el.tags?.name || el.tags?.['name:en']
      if (!name || seenNames.has(name.toLowerCase())) continue
      seenNames.add(name.toLowerCase())

      attractions.push({
        name,
        lat: Number(el.lat),
        lng: Number(el.lon),
        description: `${name} is a celebrated local ${el.tags?.tourism || 'landmark'} verified on OpenStreetMap.`,
        category: el.tags?.tourism || 'sight',
        source: 'OpenStreetMap (ODbL)',
      })
      if (attractions.length >= 20) break
    }

    if (attractions.length >= 6) {
      poiCache.set(cacheKey, attractions)
    }
    return attractions
  } catch {
    return []
  }
}

/**
 * Get attractions fallback chain: Wikipedia -> Overpass -> Bundled offline list.
 */
export async function getAttractionsForLocation(cityName, lat, lng, signal = null) {
  // 1. Try Wikipedia
  try {
    const wikiPOIs = await fetchWikipediaAttractions(lat, lng, signal)
    if (wikiPOIs.length >= 6) return wikiPOIs
  } catch {
    /* fallback to Overpass */
  }

  // 2. Try Overpass API
  try {
    const overpassPOIs = await fetchOverpassAttractions(lat, lng, signal)
    if (overpassPOIs.length >= 6) return overpassPOIs
  } catch {
    /* fallback to bundled */
  }

  // 3. Try Bundled offline city list
  const normCity = String(cityName || '').toLowerCase().trim()
  for (const [key, list] of Object.entries(BUNDLED_CITIES_ATTRACTIONS)) {
    if (normCity.includes(key) || key.includes(normCity)) {
      return list.map((item) => ({ ...item, source: 'MyTripPlanner Offline Guide' }))
    }
  }

  return []
}

/* =========================================================================
   10. HTTP ENDPOINT HANDLER FOR SERVER (/api/places/search, /api/places/info)
   ========================================================================= */

export async function handleWorldPlacesHttp(req, res) {
  if (!isWorldPlacesEnabled()) return false
  const [path, queryStr] = (req.url || '').split('?')
  if (!path.startsWith('/api/places')) return false

  const params = new URLSearchParams(queryStr || '')

  // GET /api/places/search?q=... (Autocomplete / geocoding)
  if (req.method === 'GET' && path === '/api/places/search') {
    const q = params.get('q') || ''
    if (!q || q.trim().length < 2) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, candidates: [] }))
      return true
    }

    try {
      const candidates = await geocodeWorldwide(q)
      const sanitized = candidates.slice(0, 6).map((c) => ({
        name: c.name,
        display_name: c.display_name,
        lat: Number(c.lat),
        lng: Number(c.lon),
        type: c.type,
        country_code: c.address?.country_code,
      }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, candidates: sanitized }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
    return true
  }

  // GET /api/places/attractions?lat=...&lng=...&name=...
  if (req.method === 'GET' && path === '/api/places/attractions') {
    const lat = parseFloat(params.get('lat'))
    const lng = parseFloat(params.get('lng'))
    const name = params.get('name') || 'Destination'

    if (isNaN(lat) || isNaN(lng)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Missing valid lat/lng coordinates.' }))
      return true
    }

    try {
      const attractions = await getAttractionsForLocation(name, lat, lng)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, attractions }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
    return true
  }

  return false
}

/**
 * Handle worldwide destination interview mode planning.
 * Returns true if the query was processed (even if clarification asked), or false if no query.
 */
export async function handleWorldwideInterview({
  text,
  userDays,
  bridge,
  abortSignal,
  startDate,
  isIt,
  streamText,
  deriveDateStr,
  toTitleCase,
}) {
  const { cleaned, days } = normalizeQuery(text)
  if (!cleaned || cleaned.length < 2) return false

  // 1. Check for multi-city trip: e.g. "Kyoto and Osaka", "Tokyo and Kyoto"
  const multiCityMatch = cleaned.match(/^([A-Za-z\u00C0-\u024F\s]+?)\s+(?:and|&|\+)\s+([A-Za-z\u00C0-\u024F\s]+)$/i)
  if (multiCityMatch) {
    const city1Name = multiCityMatch[1].trim()
    const city2Name = multiCityMatch[2].trim()
    const [cands1, cands2] = await Promise.all([
      geocodeWorldwide(city1Name, { signal: abortSignal }),
      geocodeWorldwide(city2Name, { signal: abortSignal }),
    ])
    const res1 = resolveCandidates(cands1, city1Name)
    const res2 = resolveCandidates(cands2, city2Name)

    if (res1.status === 'single' && res2.status === 'single') {
      const city1 = res1.result
      const city2 = res2.result
      const totalDays = Math.min(days || userDays || 6, 14)
      const daysCity1 = Math.ceil(totalDays / 2)
      const daysCity2 = totalDays - daysCity1

      const countryCode = city1.address?.country_code || city2.address?.country_code || 'us'
      const curInfo = getCurrencyForCountry(countryCode)
      const tripTitle = `Trip to ${toTitleCase(city1.name)} & ${toTitleCase(city2.name)}`

      bridge.broadcast({
        type: 'agent_tool',
        name: 'set_trip_meta',
        args: { title: tripTitle, currency: curInfo.code, car_gas_unit: countryCode === 'us' ? 'usd_gal' : 'eur_l' },
      })
      await bridge.callBrowser('set_trip_meta', {
        title: tripTitle,
        currency: curInfo.code,
        car_gas_unit: countryCode === 'us' ? 'usd_gal' : 'eur_l',
        car_gas_price: countryCode === 'us' ? 3.5 : 1.8,
        car_model: 'Compact / Sedan',
      })
      bridge.broadcast({ type: 'agent_tool', name: 'start_planning', args: {} })
      await bridge.callBrowser('start_planning', {})

      const intro = `I've started building your multi-city tour of **${toTitleCase(city1.name)}** (${daysCity1} days) and **${toTitleCase(city2.name)}** (${daysCity2} days) in **${curInfo.symbol} (${curInfo.code})**!`
      await streamText(bridge, intro + '\n\n', abortSignal, 12)

      const [pois1, pois2] = await Promise.all([
        getAttractionsForLocation(city1.name, Number(city1.lat), Number(city1.lon), abortSignal),
        getAttractionsForLocation(city2.name, Number(city2.lat), Number(city2.lon), abortSignal),
      ])

      const clusters1 = clusterPOIs(pois1.length ? pois1 : [{ name: `${city1.name} Old Town`, lat: Number(city1.lat), lng: Number(city1.lon), category: 'heritage', description: 'Central historic quarter.' }], daysCity1)
      const clusters2 = clusterPOIs(pois2.length ? pois2 : [{ name: `${city2.name} Old Town`, lat: Number(city2.lat), lng: Number(city2.lon), category: 'heritage', description: 'Central historic quarter.' }], daysCity2)

      let dayNum = 1
      let totalStops = 0
      let totalBudget = 0

      // Add city 1 days
      for (let i = 0; i < daysCity1; i++) {
        const stops = optimizeDayRoute(clusters1[i % clusters1.length])
        const title = deriveDayTheme(dayNum, stops, toTitleCase(city1.name))
        bridge.broadcast({ type: 'agent_tool', name: 'add_day', args: { title, night: toTitleCase(city1.name) } })
        await bridge.callBrowser('add_day', { title, night: toTitleCase(city1.name) })
        const times = ['09:30', '12:30', '16:00', '19:00']
        for (let sIdx = 0; sIdx < Math.min(stops.length, 4); sIdx++) {
          const st = stops[sIdx]
          const price = Math.round(curInfo.dailyBudget * 0.18)
          totalBudget += price
          totalStops++
          bridge.broadcast({ type: 'agent_tool', name: 'add_activity', args: { day_number: dayNum, title: st.name, time: times[sIdx] } })
          await bridge.callBrowser('add_activity', {
            day_number: dayNum,
            title: st.name,
            type: st.category === 'nature' ? 'walk' : 'activity',
            time: times[sIdx],
            duration_min: 120,
            lat: st.lat,
            lng: st.lng,
            price,
            notes: st.description,
          })
        }
        dayNum++
      }

      // Add city 2 days
      for (let i = 0; i < daysCity2; i++) {
        const stops = optimizeDayRoute(clusters2[i % clusters2.length])
        const title = deriveDayTheme(dayNum, stops, toTitleCase(city2.name))
        bridge.broadcast({ type: 'agent_tool', name: 'add_day', args: { title, night: toTitleCase(city2.name) } })
        await bridge.callBrowser('add_day', { title, night: toTitleCase(city2.name) })
        const times = ['09:30', '12:30', '16:00', '19:00']
        for (let sIdx = 0; sIdx < Math.min(stops.length, 4); sIdx++) {
          const st = stops[sIdx]
          const price = Math.round(curInfo.dailyBudget * 0.18)
          totalBudget += price
          totalStops++
          bridge.broadcast({ type: 'agent_tool', name: 'add_activity', args: { day_number: dayNum, title: st.name, time: times[sIdx] } })
          await bridge.callBrowser('add_activity', {
            day_number: dayNum,
            title: st.name,
            type: st.category === 'nature' ? 'walk' : 'activity',
            time: times[sIdx],
            duration_min: 120,
            lat: st.lat,
            lng: st.lng,
            price,
            notes: st.description,
          })
        }
        dayNum++
      }

      const summary = `I've created your multi-city itinerary for **${toTitleCase(city1.name)}** and **${toTitleCase(city2.name)}** with ${totalStops} curated stops! Total estimated budget is **${curInfo.symbol}${totalBudget} ${curInfo.code}**.`
      await streamText(bridge, summary, abortSignal)
      bridge.broadcast({ type: 'assistant_text', text: summary })
      return true
    }
  }

  // 2. Single destination geocoding
  const rawCandidates = await geocodeWorldwide(cleaned, { signal: abortSignal })
  const resolved = resolveCandidates(rawCandidates, cleaned)

  if (resolved.status === 'no_match') {
    const askMsg = `Which destination did you mean? I couldn't find "${cleaned}". Please check the spelling or name a specific city or region (e.g. "Paris", "Tokyo", "Dubai", "Bali").`
    await streamText(bridge, askMsg, abortSignal, 12)
    bridge.broadcast({ type: 'assistant_text', text: askMsg })
    return true
  }

  if (resolved.status === 'disambiguate') {
    const candidateList = resolved.candidates
      .map((c, i) => `${i + 1}. **${c.display_name}**`)
      .join('\n')
    const askMsg = `I found multiple destinations matching "${cleaned}". Which destination did you mean?\n\n${candidateList}\n\nPlease reply with your specific choice!`
    await streamText(bridge, askMsg, abortSignal, 12)
    bridge.broadcast({ type: 'assistant_text', text: askMsg })
    return true
  }

  const candidate = resolved.result
  const classification = classifyCandidate(candidate)

  // 3. Country / Region -> Ask which city
  if (!classification.isCity) {
    const countryName = candidate.name || cleaned
    const cleanKey = countryName.toLowerCase().trim()
    const topCities = BUNDLED_COUNTRY_CITIES[cleanKey] || BUNDLED_COUNTRY_CITIES[cleanKey.replace(/\s+/g, '')]
    const suggestionsText = topCities && topCities.length > 0
      ? `Popular choices in ${toTitleCase(countryName)} include: ${topCities.slice(0, 4).join(', ')}.`
      : `Please mention a specific city so I can build your itinerary.`
    const askMsg = `Which city in **${toTitleCase(countryName)}** would you like to visit? ${suggestionsText}`
    await streamText(bridge, askMsg, abortSignal, 12)
    bridge.broadcast({ type: 'assistant_text', text: askMsg })
    return true
  }

  // 4. Plan directly for the city!
  const destName = candidate.name || cleaned
  const titleCasedDest = toTitleCase(destName)
  const lat = Number(candidate.lat)
  const lng = Number(candidate.lon)
  const countryCode = candidate.address?.country_code || 'us'
  const curInfo = getCurrencyForCountry(countryCode)
  const cur = curInfo.code
  const sym = curInfo.symbol
  const daysCount = Math.min(days || userDays || 4, 14)

  const checkin = deriveDateStr(startDate, 0)
  const checkout = deriveDateStr(startDate, 1)

  // 1. Set Trip Meta
  bridge.broadcast({
    type: 'agent_tool',
    name: 'set_trip_meta',
    args: { title: `Trip to ${titleCasedDest}`, currency: cur, car_gas_unit: countryCode === 'us' ? 'usd_gal' : 'eur_l' },
  })
  try {
    await bridge.callBrowser('set_trip_meta', {
      title: `Trip to ${titleCasedDest}`,
      currency: cur,
      car_gas_unit: countryCode === 'us' ? 'usd_gal' : 'eur_l',
      car_gas_price: countryCode === 'us' ? 3.5 : 1.8,
      car_model: 'Compact / Sedan',
    })
  } catch (err) {
    console.error('[worldPlaces] set_trip_meta error:', err)
  }

  // 2. Open planner phase
  bridge.broadcast({ type: 'agent_tool', name: 'start_planning', args: {} })
  try {
    await bridge.callBrowser('start_planning', {})
  } catch (err) {
    console.error('[worldPlaces] start_planning error:', err)
  }

  const introMsg = isIt
    ? `Ciao! Ho iniziato a strutturare il tuo itinerario a **${titleCasedDest}** (${daysCount} giorni) calcolato in **${sym} (${cur})**!`
    : `Hello! I've started building your personalized **${titleCasedDest}** itinerary (${daysCount} days) with all expenses calculated in **${sym} (${cur})**!`
  await streamText(bridge, introMsg + '\n\n', abortSignal, 12)

  // 3. Fetch verified attractions
  const rawAttractions = await getAttractionsForLocation(titleCasedDest, lat, lng, abortSignal)
  if (!rawAttractions || rawAttractions.length === 0) {
    const errorMsg = `I couldn't retrieve verified attractions for **${titleCasedDest}** right now. Please check back shortly or choose another city!`
    await streamText(bridge, errorMsg, abortSignal, 12)
    bridge.broadcast({ type: 'assistant_text', text: errorMsg })
    return true
  }

  // 4. Cluster POIs into daysCount days
  const clusters = clusterPOIs(rawAttractions, daysCount)
  let totalStopsCount = 0
  let totalEstimatedBudget = 0
  let prevLastStop = null

  for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
    if (abortSignal?.aborted) return true
    const dayCluster = clusters[(dayNum - 1) % clusters.length] || [rawAttractions[0]]
    const orderedStops = optimizeDayRoute(dayCluster, prevLastStop)
    const dayTitle = deriveDayTheme(dayNum, orderedStops, titleCasedDest)

    bridge.broadcast({ type: 'agent_tool', name: 'add_day', args: { title: dayTitle, night: titleCasedDest } })
    try {
      await bridge.callBrowser('add_day', { title: dayTitle, night: titleCasedDest })
    } catch (err) {
      console.error('[worldPlaces] add_day error:', err)
    }

    const times = ['09:30', '12:30', '16:00', '19:00']
    const dayActivities = []

    for (let sIdx = 0; sIdx < Math.min(orderedStops.length, 3); sIdx++) {
      const stop = orderedStops[sIdx]
      const price = Math.round(curInfo.dailyBudget * 0.18)
      dayActivities.push({
        title: stop.name,
        type: stop.category === 'nature' || stop.category === 'park' ? 'walk' : 'activity',
        time: times[sIdx],
        duration_min: 120,
        lat: stop.lat,
        lng: stop.lng,
        price,
        notes: `${stop.description} [${stop.source || 'Verified POI'}]`,
      })
    }

    // Add dining stop at 12:30 or 19:00
    const foodTime = dayActivities.length >= 2 ? '19:00' : '12:30'
    const foodLat = orderedStops[0] ? Number((orderedStops[0].lat + 0.003).toFixed(4)) : lat
    const foodLng = orderedStops[0] ? Number((orderedStops[0].lng - 0.003).toFixed(4)) : lng
    const foodPrice = Math.round(curInfo.dailyBudget * 0.25)
    dayActivities.push({
      title: `Local Dining & Culinary Experience in ${titleCasedDest}`,
      type: 'food',
      time: foodTime,
      duration_min: 75,
      lat: foodLat,
      lng: foodLng,
      price: foodPrice,
      notes: `Authentic local restaurants and regional flavors in ${titleCasedDest}.`,
    })

    // Sort by time
    dayActivities.sort((a, b) => a.time.localeCompare(b.time))

    for (const act of dayActivities) {
      if (abortSignal?.aborted) return true
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
        console.error('[worldPlaces] add_activity error:', err)
      }
    }

    if (orderedStops.length > 0) {
      prevLastStop = orderedStops[orderedStops.length - 1]
    }
  }

  // 5. Broadcast hotel and restaurant search events
  bridge.broadcast({
    type: 'agent_tool',
    name: 'search_hotels',
    args: { location: titleCasedDest, currency: cur },
  })
  try {
    await bridge.callBrowser('search_hotels', {
      location: titleCasedDest,
      checkin,
      checkout,
      currency: cur,
    })
  } catch {
    /* ignore */
  }

  bridge.broadcast({
    type: 'agent_tool',
    name: 'search_restaurants',
    args: { location: titleCasedDest },
  })
  try {
    await bridge.callBrowser('search_restaurants', { location: titleCasedDest })
  } catch {
    /* ignore */
  }

  const finalReply = isIt
    ? `Ho completato il tuo itinerario per **${titleCasedDest}** (${daysCount} giorni, ${totalStopsCount} attrazioni e tappe gastronomiche)! Il budget stimato complessivo è di circa **${sym}${totalEstimatedBudget} ${cur}**.`
    : `I've created your ${daysCount}-day personalized itinerary for **${titleCasedDest}** with ${totalStopsCount} curated attractions and dining spots! Estimated total budget is **${sym}${totalEstimatedBudget} ${cur}** (~${sym}${Math.round(totalEstimatedBudget / daysCount)}/day).`

  await streamText(bridge, finalReply, abortSignal)
  bridge.broadcast({ type: 'assistant_text', text: finalReply })
  return true
}

