import { Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/* "sul percorso" / "+N km dal percorso" chip, shared by both pickers */
export default function DetourChip({ km }) {
  const { t, i18n } = useTranslation()
  if (km == null) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-600">
      <Route size={10} />
      {km < 0.95
        ? t('hotels.onRoute')
        : t('hotels.fromRoute', {
            km: km.toLocaleString(i18n.language, { maximumFractionDigits: km < 10 ? 1 : 0 }),
          })}
    </span>
  )
}
