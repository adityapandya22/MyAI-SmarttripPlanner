import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BedDouble, Sparkles, TriangleAlert, MapPin, ExternalLink, Check,
} from 'lucide-react'
import { useAgentChat } from '../../agent/socket'
import { useTrip, useUI, activeTrip } from '../../store'
import { fmtMoney } from '../../lib/utils'
import { dateRange, useDetourKm } from './questionUtils'
import DetourChip from './DetourChip'

export default function HotelPicker({ data, onChoose }) {
  const { t, i18n } = useTranslation()
  const range = dateRange(data.checkin, data.checkout, i18n.language)
  const trip = useTrip((s) => activeTrip(s))
  const setPlacePreview = useUI((s) => s.setPlacePreview)
  /* the preview pin must not outlive the picker (choice, cancel, new turn) */
  useEffect(() => () => setPlacePreview(null), [setPlacePreview])
  return (
    <div className="anim-fade-up mb-3 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-md shadow-violet-500/10">
      <div className="flex items-center gap-2.5 border-b border-violet-100 bg-violet-50/60 px-3.5 py-2.5">
        <BedDouble size={16} className="shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-violet-700">{t('hotels.kicker')}</p>
          <p className="truncate text-[12.5px] font-bold leading-tight text-ink-900">
            {data.location}
            {range && <span className="font-semibold text-ink-400"> · {range}</span>}
            {data.dayNumber && <span className="font-semibold text-ink-400"> · {t('common.dayN', { n: data.dayNumber })}</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        {data.options.map((o) => (
          <HotelOption key={o.name} o={o} trip={trip} onPick={() => onChoose(o.name)} />
        ))}
        <button
          onClick={() => onChoose(null)}
          className="mt-0.5 rounded-xl border border-dashed border-ink-300 px-3 py-2 text-[12px] font-bold text-ink-500 transition hover:border-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          {t('hotels.none')}
        </button>
      </div>
    </div>
  )
}

function HotelOption({ o, trip, onPick }) {
  const { t, i18n } = useTranslation()
  const cur = o.currency ?? 'INR'
  const setPlacePreview = useUI((s) => s.setPlacePreview)
  const hasCoords = o.lat != null && o.lng != null

  const detourKm = useDetourKm(trip, o.lat, o.lng)

  const showOnMap = (e) => {
    e.stopPropagation()
    setPlacePreview({
      kind: 'hotel', lat: o.lat, lng: o.lng, name: o.name,
      price_per_night: o.price_per_night, currency: cur, review_score: o.review_score, url: o.url,
    })
    /* the mobile chat is a fullscreen overlay: step aside to show the map */
    if (window.innerWidth < 1024) {
      useAgentChat.getState().setOpen(false)
      useUI.getState().revealMap()
    }
  }

  const lowReviews = o.review_count != null && o.review_count < 15
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${o.name} (${fmtMoney(o.price_per_night, cur)} ${t('hotels.perNight')})`}
      onClick={onPick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick() } }}
      className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:shadow-sm ${
        o.recommended ? 'border-violet-300 bg-violet-50/40 hover:border-violet-400 hover:bg-violet-50' : 'border-ink-200 hover:border-violet-400 hover:bg-violet-50/50'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-[13px] font-bold leading-tight text-ink-900">{o.name}</span>
          {o.recommended && (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white">
              <Sparkles size={9} /> {t('hotels.recommended')}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {o.review_score != null && (
            <span className="grid h-[18px] min-w-[26px] place-items-center rounded-md rounded-bl-none bg-violet-600/90 px-1 text-[10.5px] font-bold leading-none text-white">
              {o.review_score.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
          )}
          {o.review_count != null && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${lowReviews ? 'text-amber-600' : 'text-ink-500'}`}>
              {lowReviews && <TriangleAlert size={10} />}
              {t('hotels.reviews', { count: o.review_count, n: o.review_count.toLocaleString(i18n.language) })}
            </span>
          )}
          <DetourChip km={detourKm} />
          {hasCoords && (
            <button
              onClick={showOnMap}
              title={t('hotels.map')}
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10.5px] font-bold text-violet-600 transition hover:bg-violet-100"
            >
              <MapPin size={10} /> {t('hotels.map')}
            </button>
          )}
          {o.url && (
            <a
              href={o.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={t('hotels.openBooking')}
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10.5px] font-bold text-violet-600 transition hover:bg-violet-100"
            >
              Booking.com <ExternalLink size={10} />
            </a>
          )}
        </div>
        {o.note && <p className="mt-1 text-[11px] leading-snug text-ink-400">{o.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-[15px] font-extrabold leading-tight text-ink-900">
          {fmtMoney(o.price_per_night, cur)}
          <span className="text-[10.5px] font-bold text-ink-400">{t('hotels.perNight')}</span>
        </span>
        {o.total_price != null && (
          <span className="text-[10.5px] font-semibold text-ink-400">{t('hotels.total', { price: fmtMoney(o.total_price, cur) })}</span>
        )}
        <span className="mt-1 hidden items-center gap-1 rounded-lg bg-violet-600 px-2 py-1 text-[10.5px] font-bold text-white group-hover:inline-flex">
          <Check size={10} strokeWidth={3.5} /> {t('hotels.pick')}
        </span>
      </div>
    </div>
  )
}
