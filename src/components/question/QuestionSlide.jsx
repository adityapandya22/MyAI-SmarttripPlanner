import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Send } from 'lucide-react'

export default function QuestionSlide({
  q,
  st,
  active,
  single,
  onPatch,
  onPick,
  onEnter,
  onSubmitOpen,
}) {
  const { t } = useTranslation()
  const taRef = useRef(null)

  /* focus the free-text field when an open question slides in */
  useEffect(() => {
    if (active && q.kind === 'open') taRef.current?.focus()
  }, [active, q.kind])

  const other = st.other

  return (
    <div className="flex flex-col gap-1.5 p-3">
      {!single && (
        <p className="px-0.5 pb-1 text-[13px] font-bold leading-snug text-ink-900">{q.question}</p>
      )}

      {/* single: click = pick (and glide on) — the choice stays visible and editable */}
      {q.kind === 'single' && (
        <div role="radiogroup" aria-label={q.question} className="flex flex-col gap-1.5">
          {q.options.map((o) => {
            const on = st.selected[0] === o.label
            return (
              <button
                key={o.label}
                role="radio"
                aria-checked={on}
                onClick={() => onPick(o.label)}
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                  on ? 'border-violet-400 bg-violet-50' : 'border-ink-200 hover:border-violet-400 hover:bg-violet-50/50'
                }`}
              >
                <span
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] transition ${
                    on ? 'border-violet-500 bg-violet-500 text-white' : 'border-ink-300 text-transparent'
                  }`}
                >
                  <Check size={11} strokeWidth={3.5} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-ink-800">{o.label}</span>
                  {o.description && (
                    <span className="block text-[11px] leading-snug text-ink-400">{o.description}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* multi: toggle freely, the footer confirms */}
      {q.kind === 'multi' && (
        <div role="group" aria-label={q.question} className="flex flex-col gap-1.5">
          {q.options.map((o) => {
            const on = st.selected.includes(o.label)
            return (
              <button
                key={o.label}
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  onPatch({
                    selected: on ? st.selected.filter((x) => x !== o.label) : [...st.selected, o.label],
                  })
                }
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                  on ? 'border-violet-400 bg-violet-50' : 'border-ink-200 hover:border-ink-300'
                }`}
              >
                <span
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border-[1.5px] transition ${
                    on ? 'border-violet-500 bg-violet-500 text-white' : 'border-ink-300 text-transparent'
                  }`}
                >
                  <Check size={11} strokeWidth={3.5} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-ink-800">{o.label}</span>
                  {o.description && (
                    <span className="block text-[11px] leading-snug text-ink-400">{o.description}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* free text: open kind, or the "other" escape hatch */}
      {(q.kind === 'open' || q.allowOther) && (
        <div className="mt-0.5 flex items-end gap-2">
          <textarea
            ref={taRef}
            value={other}
            onChange={(e) => {
              const v = e.target.value
              /* typing a custom answer to a single-choice question overrides the pick */
              onPatch(q.kind === 'single' && v.trim() ? { other: v, selected: [] } : { other: v })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onEnter()
              }
            }}
            rows={Math.min(3, Math.max(1, other.split('\n').length))}
            placeholder={q.kind === 'open' ? t('question.openPlaceholder') : t('question.otherPlaceholder')}
            aria-label={
              q.kind === 'open'
                ? q.question || t('question.openPlaceholder')
                : t('question.otherPlaceholder')
            }
            className="min-h-9 w-full resize-none rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] text-ink-800 outline-none transition placeholder:text-ink-300 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-400/20"
          />
          {single && q.kind !== 'multi' && (
            <button
              onClick={onSubmitOpen}
              disabled={!other.trim()}
              aria-label={t('question.send')}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
