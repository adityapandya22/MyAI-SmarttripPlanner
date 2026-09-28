import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import { useUI, toast } from '../../store'

export function MapAutosize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  return null
}

export function MapRef({ mapRef }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
    if (import.meta.env.DEV) window.__map = map
  }, [map, mapRef])
  return null
}

export function CenterOnDestination({ center, hasStops, tripId }) {
  const map = useMap()
  useEffect(() => {
    if (!hasStops && center) map.setView([center.lat, center.lng], 11)
  }, [tripId, center, hasStops, map])
  return null
}

export function FitOnChange({ coords, depKey }) {
  const map = useMap()
  const coordsRef = useRef(coords)
  coordsRef.current = coords

  useEffect(() => {
    if (coordsRef.current.length && map.getSize().x > 50) {
      if (coordsRef.current.length === 1) {
        map.setView(coordsRef.current[0], Math.min(map.getZoom() || 11, 13))
      } else {
        map.fitBounds(coordsRef.current, { padding: [48, 48], maxZoom: 15 })
      }
    }
  }, [depKey, map])

  useEffect(() => {
    const onResize = (e) => {
      const wasHidden = !e.oldSize || e.oldSize.x < 50
      if (wasHidden && e.newSize.x >= 50 && coordsRef.current.length) {
        if (coordsRef.current.length === 1) {
          map.setView(coordsRef.current[0], Math.min(map.getZoom() || 11, 13))
        } else {
          map.fitBounds(coordsRef.current, { padding: [48, 48], maxZoom: 15 })
        }
      }
    }
    map.on('resize', onResize)
    return () => map.off('resize', onResize)
  }, [map])
  return null
}

export function FlyToConsumer({ markerRefs }) {
  const map = useMap()
  const flyTo = useUI((s) => s.flyTo)
  const setFlyTo = useUI((s) => s.setFlyTo)
  useEffect(() => {
    if (!flyTo) return
    map.flyTo([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 12), { duration: 0.9 })
    const t = setTimeout(() => {
      markerRefs.current.get(flyTo.itemId)?.openPopup()
      setFlyTo(null)
    }, 950)
    return () => clearTimeout(t)
  }, [flyTo, map, setFlyTo, markerRefs])
  return null
}

export function PickConsumer() {
  const { t } = useTranslation()
  const picking = useUI((s) => s.picking)
  useMapEvents({
    click(e) {
      if (!picking) return
      const { editor, openEditor, setPicking } = useUI.getState()
      if (!editor) {
        setPicking(false)
        return
      }
      const draft = editor.draft ?? {}
      openEditor(editor.dayId, editor.itemId, {
        ...draft,
        lat: +e.latlng.lat.toFixed(5),
        lng: +e.latlng.lng.toFixed(5),
      })
      setPicking(false) /* restores the sheet snap it parked */
      toast(t('map.toasts.positionSet'))
    },
  })
  return null
}

export function DirPickConsumer({ dirPick, setDirPick, setDir }) {
  const { t } = useTranslation()
  useMapEvents({
    click(e) {
      if (!dirPick) return
      const p = {
        lat: +e.latlng.lat.toFixed(5),
        lng: +e.latlng.lng.toFixed(5),
        name: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`,
        short: t('map.dir.mapPoint'),
      }
      setDir((d) => ({ ...d, [dirPick]: p }))
      setDirPick(null)
    },
  })
  return null
}
