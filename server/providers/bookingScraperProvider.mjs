import { searchHotels } from '../booking.mjs'

/**
 * Live scraper hotel provider using Booking.com via headless Chrome.
 * @implements {import('./types.mjs').HotelProvider}
 */
export class BookingScraperProvider {
  /**
   * Search hotels on Booking.com using the headless Chrome scraper.
   * @param {import('./types.mjs').HotelSearchArgs} args
   * @returns {Promise<import('./types.mjs').HotelSearchResult>}
   */
  async searchHotels(args) {
    return searchHotels(args)
  }
}

export const bookingScraperProvider = new BookingScraperProvider()
