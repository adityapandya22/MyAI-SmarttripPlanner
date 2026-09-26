import { useMemo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import { Navigation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUI } from '../../store'
import { fmtDur, gmapsUrl } from '../../lib/utils'
import { createPinIcon, BED_SVG } from './mapIcons'

export default function PinMarker({ item, n, day, dayIndex, markerRefs, onDirTo }) {
  const { t } = useTranslation()
  const setFocusItem = useUI((s) => s.setFocusItem)
  const revealList = useUI((s) => s.revealList)

  const isHotel = item.type === 'hotel'
  const typeLabel = isHotel ? t('hotels.hotel', 'Hotel') : t('common.stopNumber', { n }) || `Stop ${n}`
  const accessibleName = `${item.title} (${typeLabel}, ${t('common.dayN', { n: dayIndex + 1 })})`

  const icon = useMemo(
    () => createPinIcon(day.color, isHotel ? BED_SVG : n, isHotel, accessibleName),
    [day.color, n, isHotel, accessibleName],
  )

  return (
    <Marker
      position={[item.lat, item.lng]}
      icon={icon}
      keyboard={true}
      title={accessibleName}
      alt={accessibleName}
      ref={(m) => {
        if (m) markerRefs.current.set(item.id, m)
        else markerRefs.current.delete(item.id)
      }}
    >
      <Popup>
        <div className="min-w-44">
          <div className="font-display text-[13.5px] font-bold text-ink-900">{item.title}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-500">
            {t('common.dayN', { n: dayIndex + 1 })}
            {item.time ? ` · ${item.time}` : ''}
            {item.dur ? ` · ${fmtDur(item.dur)}` : ''}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                setFocusItem(item.id, day.color)
                revealList('itinerary')
              }}
              className="rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-ink-700"
            >
              {t('common.seeInItinerary')}
            </button>
            <button
              onClick={() => onDirTo({ lat: item.lat, lng: item.lng, name: item.title, short: item.title })}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold !text-blue-700 ring-1 ring-blue-600/20 transition hover:bg-blue-100"
            >
              <Navigation size={11} /> {t('map.dir.directions')}
            </button>
            <a
              href={gmapsUrl(item.lat, item.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[11px] font-bold !text-ink-600 ring-1 ring-ink-500/10 transition hover:bg-ink-200"
            >
              Google Maps
            </a>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
