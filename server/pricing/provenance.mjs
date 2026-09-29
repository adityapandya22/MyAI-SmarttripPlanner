export const PROVENANCE_SOURCES = [
  'osm',
  'wikipedia',
  'wikidata',
  'nominatim',
  'photon',
  'osrm',
  'open-meteo',
  'cost-table',
  'user',
  'bundled',
]

export const CONFIDENCE_LEVELS = ['verified', 'estimate', 'sample']

export function createProvenance({
  source = 'bundled',
  confidence = 'estimate',
  sourceUrl = null,
  fetchedAt = new Date().toISOString(),
} = {}) {
  const safeSource = PROVENANCE_SOURCES.includes(source) ? source : 'bundled'
  const safeConfidence = CONFIDENCE_LEVELS.includes(confidence) ? confidence : 'estimate'

  return {
    source: safeSource,
    fetchedAt,
    confidence: safeConfidence,
    ...(sourceUrl ? { sourceUrl } : {}),
  }
}

export function formatProvenanceLabel(provenance) {
  if (!provenance) return 'Unknown data source'
  const { source, confidence, fetchedAt } = provenance
  const confText = confidence === 'verified' ? 'Live Verified' : confidence === 'sample' ? 'Sample Data' : 'Estimate'

  const sourceNames = {
    osm: 'OpenStreetMap',
    wikipedia: 'Wikipedia',
    wikidata: 'Wikidata',
    nominatim: 'OSM Nominatim',
    photon: 'Photon / Komoot',
    osrm: 'OSRM Route Engine',
    'open-meteo': 'Open-Meteo Weather',
    'cost-table': 'Regional Cost Model 2025',
    user: 'User Input',
    bundled: 'Bundled Offline Index',
  }

  const name = sourceNames[source] || source
  const dateStr = fetchedAt ? new Date(fetchedAt).toLocaleDateString() : ''
  return `${confText} — ${name}${dateStr ? ` (${dateStr})` : ''}`
}
