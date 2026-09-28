/**
 * Shared map tile configuration.
 *
 * Default: OpenStreetMap (free, no API key required).
 * Override via environment variables for CARTO / Stadia / MapTiler etc.
 */

export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const MAP_TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export const MAP_TILE_MAX_ZOOM = 19
