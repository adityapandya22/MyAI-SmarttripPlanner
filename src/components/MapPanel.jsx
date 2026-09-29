import { useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import { Maximize2, Plus, Navigation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTrip, useUI, activeTrip } from '../store'
import { useAgentChat } from '../agent/socket'
import { PoiMarkers, PoiControl } from './PoiLayer'
import { searchIcon, dirIcon } from './map/mapIcons'
import { useTripLegs } from './map/useTripLegs'
import { useDirections } from './map/useDirections'
import LegPopup from './map/LegPopup'
import PinMarker from './map/PinMarker'
import PlacePreviewMarker from './map/PlacePreviewMarker'
import SearchOverlay from './map/SearchOverlay'
import LegChip from './map/LegChip'
import { MAP_TILE_CONFIG } from '../lib/mapTiles'
import {
  MapAutosize,
  MapRef,
  CenterOnDestination,
  FitOnChange,
  FlyToConsumer,
  PickConsumer,
  DirPickConsumer,
} from './map/MapBehaviors'

const WORLD_CENTER = [30, 10] // neutral fallback: no stops and no destination yet

export default function MapPanel() {
  const { t } = useTranslation()
  const trip = useTrip((s) => activeTrip(s))
  const insertItemAt = useTrip((s) => s.insertItemAt)
  const days = trip.days
  const mapFilter = useUI((s) => s.mapFilter)
  const setMapFilter = useUI((s) => s.setMapFilter)
  const picking = useUI((s) => s.picking)
  const placePreview = useUI((s) => s.placePreview)
  const markerRefs = useRef(new Map())
  const mapRef = useRef(null)
  const [fitNonce, setFitNonce] = useState(0) // fit-all must refit even when unfiltered

  const { layersAll, legs, roads, ROAD_MODES } = useTripLegs(days, trip.transport)

  const {
    place,
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
  } = useDirections({ trip, days, insertItemAt, mapRef, t })

  const layers = layersAll.filter((l) => !mapFilter || l.day.id === mapFilter)
  const visibleLegs = legs.filter((l) => !mapFilter || l.dayId === mapFilter)
  const dayColor = useMemo(() => Object.fromEntries(days.map((d) => [d.id, d.color])), [days])
  const allCoords = layers.flatMap((l) => l.points.map((p) => [p.item.lat, p.item.lng]))

  /* shift map overlays left while the floating chat covers the right side */
  const chatShift = useAgentChat((s) => (s.open ? s.panelW : 0))

  return (
    <div
      style={{ '--chat-w': `${chatShift ? chatShift + 12 : 0}px` }}
      className={`relative h-full w-full ${picking ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}
    >
      <MapContainer
        center={trip.center ? [trip.center.lat, trip.center.lng] : WORLD_CENTER}
        zoom={trip.center ? 11 : 3}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url={MAP_TILE_CONFIG.url}
          attribution={MAP_TILE_CONFIG.attribution}
          maxZoom={MAP_TILE_CONFIG.maxZoom}
        />
        <MapAutosize />
        <MapRef mapRef={mapRef} />
        {/* empty trip with a chosen destination: stay centered there (also
            covers the trip switch and start_planning while already mounted) */}
        <CenterOnDestination
          center={trip.center}
          hasStops={layersAll.some((l) => l.points.length > 0)}
          tripId={trip.id}
        />
        {/* re-fit when the filter changes OR any stops are added/moved */}
        <FitOnChange
          coords={allCoords}
          depKey={`${mapFilter ?? 'all'}|${fitNonce}|${allCoords.length}|${allCoords.map((c) => `${c[0]?.toFixed(2)},${c[1]?.toFixed(2)}`).join(';')}`}
        />
        <FlyToConsumer markerRefs={markerRefs} />
        <PickConsumer />
        <DirPickConsumer dirPick={dirPick} setDirPick={setDirPick} setDir={setDir} />

        {/* searched place */}
        {place && (
          <Marker
            position={[place.lat, place.lng]}
            icon={searchIcon}
            keyboard={true}
            title={`${place.short || place.name} (${t('search.place', 'Searched place')})`}
            alt={`${place.short || place.name} (${t('search.place', 'Searched place')})`}
            ref={(m) => m?.openPopup()}
          >
            <Popup>
              <div className="min-w-48 max-w-60">
                <div className="font-display text-[13.5px] font-bold text-ink-900">{place.short}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-500">{place.name}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => addPlaceToTrip(place)}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-600"
                  >
                    <Plus size={11} strokeWidth={3} /> {t('common.addToTrip')}
                  </button>
                  <button
                    onClick={() => directionsTo(place)}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold !text-blue-700 ring-1 ring-blue-600/20 transition hover:bg-blue-100"
                  >
                    <Navigation size={11} /> {t('map.dir.directions')}
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* hotel proposed in chat: preview pin with price + link */}
        {placePreview && <PlacePreviewMarker p={placePreview} />}

        {/* directions route + endpoints */}
        {route && (
          <Polyline
            positions={route.latlngs}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.9, dashArray: null }}
          />
        )}
        {dir.a && (
          <Marker
            position={[dir.a.lat, dir.a.lng]}
            icon={dirIcon('A', '#16a34a')}
            keyboard={true}
            title={`Point A: ${dir.a.short || dir.a.name || 'Start'}`}
            alt={`Point A: ${dir.a.short || dir.a.name || 'Start'}`}
          />
        )}
        {dir.b && (
          <Marker
            position={[dir.b.lat, dir.b.lng]}
            icon={dirIcon('B', '#dc2626')}
            keyboard={true}
            title={`Point B: ${dir.b.short || dir.b.name || 'Destination'}`}
            alt={`Point B: ${dir.b.short || dir.b.name || 'Destination'}`}
          />
        )}

        {/* route legs, styled by transport mode — click one for the details */}
        {visibleLegs.map((leg) => {
          const road = roads[leg.id]
          const color = dayColor[leg.dayId] ?? '#f97316'
          /* dashArray must be explicitly nulled: Leaflet's setStyle merges
             options and never removes a previous dash */
          const style = road
            ? leg.mode === 'walk'
              ? { color, weight: 3.5, opacity: 0.85, dashArray: '1 7' }
              : { color, weight: 4, opacity: 0.75, dashArray: null }
            : ROAD_MODES[leg.mode]
              ? { color, weight: 3.5, opacity: 0.55, dashArray: '6 9' }
              : { color, weight: 3, opacity: 0.55, dashArray: '10 10' } /* train/plane/boat */
          return (
            <Polyline key={leg.id} positions={road?.latlngs ?? [leg.from, leg.to]} pathOptions={style}>
              <Popup>
                <LegPopup leg={leg} road={road} color={color} />
              </Popup>
            </Polyline>
          )
        })}

        <PoiMarkers />

        {layers.map(({ day, dayIndex, points }) => (
          <div key={day.id}>
            {points.map(({ item, n }) => (
              <PinMarker
                key={item.id}
                item={item}
                n={n}
                day={day}
                dayIndex={dayIndex}
                markerRefs={markerRefs}
                onDirTo={directionsTo}
              />
            ))}
          </div>
        ))}
      </MapContainer>

      {/* search + directions (Google-Maps-style) */}
      <SearchOverlay
        dir={dir}
        setDir={setDir}
        route={route}
        routing={routing}
        dirPick={dirPick}
        setDirPick={setDirPick}
        onSelectPlace={selectPlace}
        onCloseDirections={closeDirections}
      />

      {/* legend / day filter */}
      <div className="no-scrollbar absolute left-3 right-3 top-[calc(var(--hdr-b,96px)+48px)] z-[500] -m-1.5 flex gap-1.5 overflow-x-auto p-1.5 transition-[right,left] duration-200 max-lg:[mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-10px),transparent)] lg:nice-scroll lg:left-[calc(0.75rem+var(--left-w,0px))] lg:right-[calc(21.5rem+var(--chat-w,0px))] lg:top-[var(--hdr-b,96px)] lg:flex-wrap">
        <LegChip active={!mapFilter} color="#334155" onClick={() => setMapFilter(null)}>
          {t('map.legend.all')}
        </LegChip>
        {days.map((d, i) => (
          <LegChip
            key={d.id}
            active={mapFilter === d.id}
            color={d.color}
            onClick={() => setMapFilter(mapFilter === d.id ? null : d.id)}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
            {t('map.legend.dayShort', { n: i + 1 })}
          </LegChip>
        ))}
      </div>

      {/* fit-all + POI discovery */}
      <div className="absolute bottom-[calc(var(--sheet-peek,0px)+12px)] left-3 z-[500] flex items-center gap-2 lg:bottom-3 lg:left-[calc(0.75rem+var(--left-w,0px))]">
        <button
          onClick={() => {
            setMapFilter(null)
            setFitNonce((n) => n + 1)
          }}
          title={t('map.legend.fitAll')}
          className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white/95 px-3.5 py-2.5 text-xs font-bold text-ink-700 shadow-lg backdrop-blur transition hover:border-brand-400 hover:text-brand-600"
        >
          <Maximize2 size={14} />
          <span className="hidden sm:inline">{t('map.legend.fit')}</span>
        </button>
        <PoiControl />
      </div>
    </div>
  )
}
