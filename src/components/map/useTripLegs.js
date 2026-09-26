import { useEffect, useMemo, useState } from 'react'
import { useRoutes } from '../../store'
import { fetchRoadRoute, haversineKm } from '../../lib/geo'

export const ROAD_MODES = { car: 'driving', bus: 'driving', walk: 'foot' }

export function useTripLegs(days, transport) {
  const [roads, setRoads] = useState({}) // dayId -> road-following [lat,lng][]

  /* every day with its numbered, located points */
  const layersAll = useMemo(() => {
    return days.map((day, dayIndex) => {
      let n = 0
      const points = day.items
        .filter((it) => it.lat != null)
        .map((it) => ({ item: it, n: it.type === 'hotel' ? null : ++n }))
      return { day, dayIndex, points }
    })
  }, [days])

  /* the itinerary broken into LEGS between consecutive located stops; each
     leg carries the transport mode of the drive item between them (car/bus →
     real roads, walk → foot routing, train/plane/boat → straight dashed).
     No implicit return leg: a round trip only closes if the itinerary itself
     ends where it started (Ulisse asks the user how the trip should end). */
  const legs = useMemo(() => {
    const defaultMode = transport === 'walk' ? 'walk' : 'car'
    const out = []
    let last = null
    let pendingMode = null
    let pendingDriveId = null
    days.forEach((day, dayIndex) => {
      for (const it of day.items) {
        if (it.type === 'drive') { pendingMode = it.mode ?? defaultMode; pendingDriveId = it.id; continue }
        if (it.lat == null) continue
        const stop = { coord: [it.lat, it.lng], dayId: day.id, title: it.title, id: it.id }
        if (last) {
          out.push({
            id: `${day.id}|${out.length}`, from: last.coord, to: stop.coord, dayId: day.id,
            dayN: dayIndex + 1, mode: pendingMode ?? defaultMode, fromTitle: last.title, toTitle: stop.title,
            driveId: pendingDriveId, toId: stop.id,
          })
        }
        last = stop
        pendingMode = null
        pendingDriveId = null
      }
    })
    return out
  }, [days, transport])

  /* fetch real geometry per leg (cached per pair+profile); publish day km */
  const legSignature = useMemo(() => JSON.stringify(legs.map((l) => [l.from, l.to, l.mode])), [legs])
  useEffect(() => {
    let dead = false
    setRoads({})
    const kmByLeg = {}
    const publish = () => {
      const byDay = {}
      for (const l of legs) {
        const km = kmByLeg[l.id] ?? haversineKm(l.from, l.to) * (ROAD_MODES[l.mode] ? 1.25 : 1)
        byDay[l.dayId] = (byDay[l.dayId] ?? 0) + km
      }
      useRoutes.setState({ byDay })
    }
    publish()
    ;(async () => {
      for (const l of legs) {
        const profile = ROAD_MODES[l.mode]
        if (!profile) continue
        const road = await fetchRoadRoute([l.from, l.to], profile)
        if (dead) return
        if (road) {
          kmByLeg[l.id] = road.km
          setRoads((r) => ({ ...r, [l.id]: road }))
          publish()
        }
      }
    })()
    return () => { dead = true }
  }, [legSignature, legs])

  return { layersAll, legs, roads, ROAD_MODES }
}
