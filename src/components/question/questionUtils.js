import { useMemo } from 'react'
import { bestInsertion } from '../../lib/geo'

export const dateRange = (checkin, checkout, lang) => {
  if (!checkin) return null
  const fmt = (d) => new Date(d + 'T12:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' })
  return checkout ? `${fmt(checkin)} – ${fmt(checkout)}` : fmt(checkin)
}

/* extra km the planned route would gain by detouring through this place */
export function useDetourKm(trip, lat, lng) {
  return useMemo(() => {
    if (lat == null || lng == null || !trip) return null
    const located = trip.days.reduce((n, d) => n + d.items.filter((i) => i.lat != null).length, 0)
    if (located < 2) return null
    try {
      const spot = bestInsertion(trip, { lat, lng })
      return spot ? Math.max(0, spot.addedKm) : null
    } catch {
      return null
    }
  }, [trip, lat, lng])
}
