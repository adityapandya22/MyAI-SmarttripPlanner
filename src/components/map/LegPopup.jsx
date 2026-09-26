import { useTranslation } from 'react-i18next'
import { useUI } from '../../store'
import { fmtKm } from '../../lib/utils'
import { haversineKm } from '../../lib/geo'
import { MODE_META } from '../typeMeta'
import { fmtMin } from './mapUtils'

export default function LegPopup({ leg, road, color }) {
  const { t } = useTranslation()
  const meta = MODE_META[leg.mode] ?? MODE_META.car
  const setFocusItem = useUI((s) => s.setFocusItem)
  const revealList = useUI((s) => s.revealList)
  const km = road?.km ?? haversineKm(leg.from, leg.to)
  return (
    <div className="min-w-44 max-w-60">
      <div className="flex items-center gap-1.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg text-white" style={{ background: color }}>
          <meta.Icon size={13} />
        </span>
        <span className="font-display text-[13px] font-bold text-ink-900">
          {t(meta.labelKey)} · {t('common.dayN', { n: leg.dayN })}
        </span>
      </div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-ink-600">
        <span className="font-semibold text-ink-800">{leg.fromTitle}</span>
        {' → '}
        <span className="font-semibold text-ink-800">{leg.toTitle}</span>
      </div>
      <div className="mt-1.5 text-[12px] font-bold text-ink-900">
        {fmtKm(km)}
        {road?.min ? <span className="font-semibold text-ink-500"> · ~{fmtMin(road.min, t)}</span> : null}
        {!road && <span className="font-medium text-ink-400"> {t('map.leg.straightLine')}</span>}
      </div>
      <button
        onClick={() => {
          setFocusItem(leg.driveId ?? leg.toId, color)
          revealList('itinerary')
        }}
        className="mt-2 rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-ink-700"
      >
        {t('common.seeInItinerary')}
      </button>
    </div>
  )
}
