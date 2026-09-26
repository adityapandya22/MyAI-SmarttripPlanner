/**
 * @fileoverview JSDoc interface and type definitions for hotel and restaurant search providers.
 */

/**
 * @typedef {Object} HotelSearchArgs
 * @property {string} location - Name of the destination/town/city
 * @property {string} checkin - Check-in date in YYYY-MM-DD format
 * @property {string} checkout - Check-out date in YYYY-MM-DD format
 * @property {number} [adults=2] - Number of adults (1-10)
 * @property {number} [rooms=1] - Number of rooms (1-5)
 * @property {'EUR'|'USD'} [currency='EUR'] - Desired currency
 * @property {number} [max_results=6] - Maximum number of results to return (1-10)
 */

/**
 * @typedef {Object} HotelProperty
 * @property {string} name - Name of the accommodation
 * @property {boolean} available - Whether rooms are available for the selected dates
 * @property {number|null} total_price - Total stay price, or null if sold out
 * @property {number|null} price_per_night - Price per night, or null if sold out
 * @property {string} currency - Currency code ('EUR' or 'USD')
 * @property {number|null} review_score - Review rating score out of 10
 * @property {number|null} review_count - Total number of reviews
 * @property {number} [lat] - Latitude coordinate
 * @property {number} [lng] - Longitude coordinate
 * @property {string} url - Deep link with dates or fallback search URL
 */

/**
 * @typedef {Object} HotelSearchResult
 * @property {string} location - Requested location
 * @property {string} resolved_as - Destination label resolved by search
 * @property {string} checkin - Check-in date
 * @property {string} checkout - Check-out date
 * @property {number} nights - Number of nights
 * @property {number} adults - Number of adults
 * @property {number} rooms - Number of rooms
 * @property {string} search_url - Fallback or prefilled search URL
 * @property {number|null} [results_found] - Total number of properties found
 * @property {HotelProperty[]} properties - List of matched properties
 * @property {string} [note] - Operational or ranking explanation
 * @property {string} [hint] - Degradation hint when search fails or degrades
 */

/**
 * @typedef {Object} HotelProvider
 * @property {(args: HotelSearchArgs) => Promise<HotelSearchResult>} searchHotels
 */

/**
 * @typedef {Object} RestaurantSearchArgs
 * @property {string} location - Location/city/town name
 * @property {string} [query] - Specific cuisine, dish, or restaurant category
 * @property {number} [max_results=4] - Maximum results (2-6)
 */

/**
 * @typedef {Object} RestaurantPlace
 * @property {string} name - Restaurant name
 * @property {number|null} rating - Rating out of 5
 * @property {number|null} review_count - Number of reviews
 * @property {string|null} price_range - Typical price range, e.g. "€20–30"
 * @property {string|null} category - Cuisine or place category
 * @property {string|null} address - Address or district
 * @property {number|null} lat - Latitude coordinate
 * @property {number|null} lng - Longitude coordinate
 * @property {string} url - Direct Google Maps link
 */

/**
 * @typedef {Object} RestaurantSearchResult
 * @property {string} location - Requested location
 * @property {string} query - Full query passed to search
 * @property {string} search_url - Google Maps search URL
 * @property {number|null} [results_found] - Number of nearby candidate places
 * @property {RestaurantPlace[]} places - List of matched places
 * @property {string} [note] - Ranking and scoring note
 * @property {string} [hint] - Degradation hint on error
 */

/**
 * @typedef {Object} RestaurantProvider
 * @property {(args: RestaurantSearchArgs) => Promise<RestaurantSearchResult>} searchRestaurants
 */

export default {}
