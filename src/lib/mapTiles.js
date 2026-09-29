/**
 * Shared map tile configuration.
 *
 * Defaults to OpenStreetMap standard tiles (free, reliable, no watermark/API key required).
 * Allows optional override via environment variables VITE_MAP_TILE_URL and VITE_MAP_TILE_ATTRIBUTION
 * (e.g. for Stadia, MapTiler, or CARTO with private keys).
 */

export const DEFAULT_MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const DEFAULT_MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const DEFAULT_MAP_TILE_MAX_ZOOM = 19

export const MAP_TILE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAP_TILE_URL) || DEFAULT_MAP_TILE_URL

export const MAP_TILE_ATTRIBUTION =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAP_TILE_ATTRIBUTION) ||
  DEFAULT_MAP_TILE_ATTRIBUTION

export const MAP_TILE_CONFIG = {
  url: MAP_TILE_URL,
  attribution: MAP_TILE_ATTRIBUTION,
  maxZoom: DEFAULT_MAP_TILE_MAX_ZOOM,
}
