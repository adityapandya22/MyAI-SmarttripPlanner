import { useEffect, useRef } from 'react'
import { Marker, Popup, useMap } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import { fmtMoney } from '../../lib/utils'
import { hotelIcon, restaurantIcon } from './mapIcons'

export default function PlacePreviewMarker({ p }) {
  const { t, i18n } = useTranslation()
  const map = useMap()
  const markerRef = useRef(null)
  const isRestaurant = p.kind === 'restaurant'
  const typeLabel = isRestaurant ? t('categories.restaurant', 'Restaurant') : t('hotels.hotel', 'Hotel')
  const accessibleName = `${p.name} (${typeLabel})`

  useEffect(() => {
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 13), { duration: 0.9 })
    /* opening mid-flight can be swallowed by the animation: re-open at landing */
    const timeout = setTimeout(() => markerRef.current?.openPopup(), 950)
    return () => clearTimeout(timeout)
  }, [p.lat, p.lng, map])

  return (
    <Marker
      position={[p.lat, p.lng]}
      icon={isRestaurant ? restaurantIcon : hotelIcon}
      keyboard={true}
      title={accessibleName}
      alt={accessibleName}
      ref={(m) => {
        markerRef.current = m
        m?.openPopup()
      }}
    >
      <Popup>
        <div className="min-w-44 max-w-60">
          <div className="font-display text-[13.5px] font-bold text-ink-900">{p.name}</div>
          <div className="mt-0.5 text-[11.5px] font-semibold text-ink-500">
            {isRestaurant ? (
              <>
                {p.rating != null && (
                  <>{p.rating.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</>
                )}
                {p.review_count != null && <> ({p.review_count.toLocaleString(i18n.language)})</>}
                {p.price_range && <> · {p.price_range}</>}
              </>
            ) : (
              <>
                {p.price_per_night != null && (
                  <>
                    {fmtMoney(p.price_per_night, p.currency ?? 'INR')}
                    {t('hotels.perNight')}
                  </>
                )}
                {p.review_score != null && (
                  <>
                    {' · '}
                    {p.review_score.toLocaleString(i18n.language, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </>
                )}
              </>
            )}
          </div>
          {p.url && (
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className={`mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold !text-white transition ${
                isRestaurant ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'
              }`}
            >
              {isRestaurant ? 'Google Maps' : 'Booking.com'}
            </a>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
