import { searchRestaurants } from '../places.mjs'

/**
 * Live scraper restaurant provider using Google Maps via headless Chrome.
 * @implements {import('./types.mjs').RestaurantProvider}
 */
export class GoogleMapsScraperProvider {
  /**
   * Search restaurants on Google Maps using the headless Chrome scraper.
   * @param {import('./types.mjs').RestaurantSearchArgs} args
   * @returns {Promise<import('./types.mjs').RestaurantSearchResult>}
   */
  async searchRestaurants(args) {
    return searchRestaurants(args)
  }
}

export const googleMapsScraperProvider = new GoogleMapsScraperProvider()
