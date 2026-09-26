import { useTranslation } from 'react-i18next'
import { BedDouble, UtensilsCrossed, CircleHelp, Check } from 'lucide-react'
import { fmtMoney } from '../../lib/utils'
import { dateRange } from './questionUtils'

/* transcript record of a hotel proposal: the shortlist collapsed into the outcome */
export function HotelPickRecord({ m }) {
  const { t, i18n } = useTranslation()
  const chosen = m.choice ? m.hotels?.options?.find((o) => o.name === m.choice) : null
  const range = dateRange(m.hotels?.checkin, m.hotels?.checkout, i18n.language)
  return (
    <div className="mb-2.5 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2">
      <p className="flex items-start gap-1.5 text-[11.5px] font-semibold leading-snug text-violet-900/70">
        <BedDouble size={12} className="mt-px shrink-0 text-violet-400" />
        {t('hotels.recordTitle', { location: m.hotels?.location ?? '' })}
        {range && <span className="font-medium text-violet-900/50">· {range}</span>}
      </p>
      <div className="mt-1.5 pl-[18px]">
        {chosen ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[12px] font-semibold text-violet-800 ring-1 ring-violet-200">
            <Check size={11} strokeWidth={3} className="text-violet-500" />
            {chosen.name}
            <span className="font-medium text-ink-400">{fmtMoney(chosen.price_per_night, chosen.currency ?? 'EUR')}{t('hotels.perNight')}</span>
          </span>
        ) : m.choice ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[12px] font-semibold text-violet-800 ring-1 ring-violet-200">
            <Check size={11} strokeWidth={3} className="text-violet-500" /> {m.choice}
          </span>
        ) : (
          <span className="text-[12px] font-semibold italic text-ink-400">{t('hotels.recordNone')}</span>
        )}
      </div>
    </div>
  )
}

/* transcript record of a restaurant proposal: the shortlist collapsed into the outcome */
export function RestaurantPickRecord({ m }) {
  const { t } = useTranslation()
  const chosen = m.choice ? m.restaurants?.options?.find((o) => o.name === m.choice) : null
  return (
    <div className="mb-2.5 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2">
      <p className="flex items-start gap-1.5 text-[11.5px] font-semibold leading-snug text-violet-900/70">
        <UtensilsCrossed size={12} className="mt-px shrink-0 text-violet-400" />
        {t('restaurants.recordTitle', { location: m.restaurants?.location ?? '' })}
        {m.restaurants?.meal && <span className="font-medium text-violet-900/50">· {t(`restaurants.meal.${m.restaurants.meal}`)}</span>}
      </p>
      <div className="mt-1.5 pl-[18px]">
        {chosen ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[12px] font-semibold text-violet-800 ring-1 ring-violet-200">
            <Check size={11} strokeWidth={3} className="text-violet-500" />
            {chosen.name}
            {chosen.price_range && <span className="font-medium text-ink-400">{chosen.price_range}</span>}
          </span>
        ) : m.choice ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[12px] font-semibold text-violet-800 ring-1 ring-violet-200">
            <Check size={11} strokeWidth={3} className="text-violet-500" /> {m.choice}
          </span>
        ) : (
          <span className="text-[12px] font-semibold italic text-ink-400">{t('restaurants.recordNone')}</span>
        )}
      </div>
    </div>
  )
}

/* transcript record of an answered batch: each question + chosen answers */
export function QARecord({ m }) {
  /* new shape: { items: [{ question, answers }] }; legacy: { question, answers|text } */
  const items = m.items ?? [{ question: m.question, answers: m.answers ?? (m.text ? m.text.split(' · ') : []) }]
  return (
    <div className="mb-2.5 flex flex-col gap-2.5 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2">
      {items.map((it, k) => (
        <div key={k}>
          <p className="flex items-start gap-1.5 text-[11.5px] font-semibold leading-snug text-violet-900/70">
            <CircleHelp size={12} className="mt-px shrink-0 text-violet-400" />
            {it.question}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[18px]">
            {it.answers.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[12px] font-semibold text-violet-800 ring-1 ring-violet-200">
                <Check size={11} strokeWidth={3} className="text-violet-500" />
                {a}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
