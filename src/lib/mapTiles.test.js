import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MAP_TILE_URL,
  DEFAULT_MAP_TILE_ATTRIBUTION,
  DEFAULT_MAP_TILE_MAX_ZOOM,
  MAP_TILE_CONFIG,
} from './mapTiles'

describe('mapTiles configuration', () => {
  it('defaults to free OpenStreetMap tiles with no API key watermark', () => {
    expect(DEFAULT_MAP_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(DEFAULT_MAP_TILE_ATTRIBUTION).toContain('OpenStreetMap')
    expect(DEFAULT_MAP_TILE_MAX_ZOOM).toBe(19)
  })

  it('provides a valid MAP_TILE_CONFIG object for Leaflet TileLayer', () => {
    expect(MAP_TILE_CONFIG).toBeDefined()
    expect(MAP_TILE_CONFIG.url).toBe(DEFAULT_MAP_TILE_URL)
    expect(MAP_TILE_CONFIG.attribution).toContain('OpenStreetMap')
    expect(MAP_TILE_CONFIG.maxZoom).toBe(19)
  })

  it('does not use CARTO voyager URL which requires an API key', () => {
    expect(MAP_TILE_CONFIG.url).not.toContain('cartocdn.com')
  })
})
