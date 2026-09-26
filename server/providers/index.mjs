import { bookingScraperProvider, BookingScraperProvider } from './bookingScraperProvider.mjs'
import { googleMapsScraperProvider, GoogleMapsScraperProvider } from './googleMapsScraperProvider.mjs'
import { mockHotelProvider, MockHotelProvider } from './mockHotelProvider.mjs'
import { mockRestaurantProvider, MockRestaurantProvider } from './mockRestaurantProvider.mjs'

export {
  BookingScraperProvider,
  bookingScraperProvider,
  GoogleMapsScraperProvider,
  googleMapsScraperProvider,
  MockHotelProvider,
  mockHotelProvider,
  MockRestaurantProvider,
  mockRestaurantProvider,
}

/**
 * Resolves the active provider mode ('mock' or 'live').
 * Defaults to 'live' unless ULISSE_PLACES_PROVIDER is explicitly set to 'mock'.
 * @param {string} [override] - Optional explicit mode override
 * @returns {'mock'|'live'}
 */
export function getProviderMode(override) {
  if (override) return String(override).toLowerCase() === 'mock' ? 'mock' : 'live'
  const envMode = String(process.env.ULISSE_PLACES_PROVIDER ?? '').trim().toLowerCase()
  return envMode === 'mock' ? 'mock' : 'live'
}

/**
 * Returns the configured HotelProvider instance.
 * @param {string} [mode] - Optional mode override ('mock' or 'live')
 * @returns {import('./types.mjs').HotelProvider}
 */
export function getHotelProvider(mode) {
  return getProviderMode(mode) === 'mock' ? mockHotelProvider : bookingScraperProvider
}

/**
 * Returns the configured RestaurantProvider instance.
 * @param {string} [mode] - Optional mode override ('mock' or 'live')
 * @returns {import('./types.mjs').RestaurantProvider}
 */
export function getRestaurantProvider(mode) {
  return getProviderMode(mode) === 'mock' ? mockRestaurantProvider : googleMapsScraperProvider
}

/**
 * Search hotels using the configured hotel provider (mock or live scraper).
 * @param {import('./types.mjs').HotelSearchArgs} args
 * @returns {Promise<import('./types.mjs').HotelSearchResult>}
 */
export async function searchHotels(args) {
  return getHotelProvider().searchHotels(args)
}

/**
 * Search restaurants using the configured restaurant provider (mock or live scraper).
 * @param {import('./types.mjs').RestaurantSearchArgs} args
 * @returns {Promise<import('./types.mjs').RestaurantSearchResult>}
 */
export async function searchRestaurants(args) {
  return getRestaurantProvider().searchRestaurants(args)
}
