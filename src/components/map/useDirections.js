import { useEffect, useState } from 'react'
import { toast } from '../../store'
import { fetchDirections, bestInsertion } from '../../lib/geo'

export function useDirections({ trip, days, insertItemAt, mapRef, t }) {
  const [place, setPlace] = useState(null)
  const [dir, setDir] = useState({ open: false, a: null, b: null })
  const [route, setRoute] = useState(null)
  const [routing, setRouting] = useState(false)
  const [dirPick, setDirPick] = useState(null)

  useEffect(() => {
    if (!dir.a || !dir.b) {
      setRoute(null)
      return
    }
    let dead = false
    setRouting(true)
    fetchDirections(dir.a, dir.b)
      .then((r) => {
        if (dead) return
        setRoute(r)
        if (!r) toast(t('map.toasts.routeNotFound'))
        else mapRef.current?.fitBounds(r.latlngs, { padding: [60, 60] })
      })
      .finally(() => !dead && setRouting(false))
    return () => {
      dead = true
    }
  }, [dir.a, dir.b, mapRef, t])

  const addPlaceToTrip = (p) => {
    const spot = bestInsertion(trip, p)
    if (!spot) return
    const dayIndex = days.findIndex((d) => d.id === spot.dayId)
    insertItemAt(spot.dayId, spot.index, {
      type: 'activity',
      title: p.short || p.name,
      time: '',
      dur: 60,
      notes: '',
      links: [],
      must: false,
      done: false,
      lat: p.lat,
      lng: p.lng,
      imgs: [],
      noWiki: false,
      sug: null,
      price: 0,
    })
    setPlace(null)
    toast(t('toasts.addedOptimal', { n: dayIndex + 1 }))
  }

  const directionsTo = (target) => {
    setDir((d) => ({ ...d, open: true, b: target }))
    setPlace(null)
  }

  const selectPlace = (p, narrow, setExpanded) => {
    setPlace(p)
    if (p?.boundingbox && Array.isArray(p.boundingbox) && p.boundingbox.length === 4) {
      const [s, n, w, e] = p.boundingbox.map(Number)
      if (!isNaN(s) && !isNaN(n) && !isNaN(w) && !isNaN(e) && (Math.abs(n - s) > 0.05 || Math.abs(e - w) > 0.05)) {
        mapRef.current?.fitBounds([[s, w], [n, e]], { padding: [40, 40], maxZoom: 14 })
      } else {
        mapRef.current?.flyTo([p.lat, p.lng], Math.max(mapRef.current?.getZoom() || 13, 13), { duration: 0.8 })
      }
    } else {
      mapRef.current?.flyTo([p.lat, p.lng], Math.max(mapRef.current?.getZoom() || 13, 13), { duration: 0.8 })
    }
    if (narrow) setExpanded(false)
  }

  const closeDirections = (setShowSteps) => {
    setDir({ open: false, a: null, b: null })
    setDirPick(null)
    setShowSteps?.(false)
  }

  return {
    place,
    setPlace,
    dir,
    setDir,
    route,
    routing,
    dirPick,
    setDirPick,
    addPlaceToTrip,
    directionsTo,
    selectPlace,
    closeDirections,
  }
}
