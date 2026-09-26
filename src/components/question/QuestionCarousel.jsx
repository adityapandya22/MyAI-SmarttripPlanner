import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleHelp, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import QuestionSlide from './QuestionSlide'

export default function QuestionCarousel({ questions, onSubmit }) {
  const { t } = useTranslation()
  const n = questions.length
  const single = n === 1
  const [idx, setIdx] = useState(0)
  /* per-question draft state; answers can be revisited until the final send */
  const [drafts, setDrafts] = useState(() => questions.map(() => ({ selected: [], other: '' })))
  const slideRefs = useRef([])
  const footRef = useRef(null)
  const [trackH, setTrackH] = useState(null)
  const touch = useRef(null)

  const patch = (i, p) => setDrafts((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const answersOf = (i) => {
    const q = questions[i]
    const st = drafts[i]
    const other = st.other.trim()
    if (q.kind === 'multi') return [...st.selected, ...(other ? [other] : [])]
    if (q.kind === 'open') return other ? [other] : []
    return st.selected.length ? [st.selected[0]] : other ? [other] : []
  }
  const isDone = (i) => answersOf(i).length > 0
  const missing = questions.reduce((c, _, i) => c + (isDone(i) ? 0 : 1), 0)
  const allDone = missing === 0
  const firstMissing = questions.findIndex((_, i) => !isDone(i))

  const go = (i) => setIdx(Math.max(0, Math.min(n - 1, i)))

  const submitAll = () => {
    if (!allDone) {
      if (firstMissing >= 0) go(firstMissing)
      return
    }
    onSubmit(questions.map((q, i) => ({ question: q.question, answers: answersOf(i) })))
  }

  /* single-choice click: record it, then glide to the next question */
  const pick = (i, label) => {
    patch(i, { selected: [label], other: '' })
    if (single) {
      onSubmit([{ question: questions[i].question, answers: [label] }])
      return
    }
    if (i < n - 1) setTimeout(() => setIdx((cur) => (cur === i ? i + 1 : cur)), 260)
  }

  const next = () => (idx < n - 1 ? go(idx + 1) : submitAll())

  /* the card's height follows the active slide (each question has its own) */
  useLayoutEffect(() => {
    const el = slideRefs.current[idx]
    if (!el) return
    const update = () => setTrackH(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [idx])

  /* a taller slide can push the nav under the interview's sticky composer
     (visually inside the scrollport, so scrollIntoView is a no-op): once the
     height transition settles, follow the app's own convention and scroll
     the hosting message list to its bottom */
  useEffect(() => {
    if (idx === 0) return
    const timeout = setTimeout(() => {
      const scroller = footRef.current?.closest('.nice-scroll')
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
    }, 340)
    return () => clearTimeout(timeout)
  }, [idx])

  const onTouchStart = (e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e) => {
    const t0 = touch.current
    touch.current = null
    if (!t0 || single) return
    const dx = e.changedTouches[0].clientX - t0.x
    const dy = e.changedTouches[0].clientY - t0.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    go(idx + (dx < 0 ? 1 : -1))
  }

  const onKeyDown = (e) => {
    if (single || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(idx + 1)
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(idx - 1)
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className="anim-fade-up mb-3 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-md shadow-violet-500/10"
    >
      {/* header: the question itself (single) or kicker + progress (batch) */}
      {single ? (
        <div className="flex items-start gap-2.5 border-b border-violet-100 bg-violet-50/60 px-3.5 py-2.5">
          <CircleHelp size={16} className="mt-0.5 shrink-0 text-violet-600" />
          <p className="text-[13px] font-bold leading-snug text-ink-900">{questions[0].question}</p>
        </div>
      ) : (
        <div className="border-b border-violet-100 bg-violet-50/60 px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <CircleHelp size={15} className="shrink-0 text-violet-600" />
            <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
              {t('question.groupTitle')}
            </p>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-violet-500">
              {t('question.counter', { i: idx + 1, n })}
            </span>
          </div>
          <div className="mt-2 flex gap-1">
            {questions.map((q, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={t('question.goToQuestion', { n: i + 1 })}
                aria-current={i === idx || undefined}
                className="group -my-1 flex-1 py-1"
              >
                <span
                  className={`block h-1 rounded-full transition-colors duration-300 ${
                    i === idx
                      ? 'bg-violet-600'
                      : isDone(i)
                        ? 'bg-violet-300'
                        : 'bg-ink-200 group-hover:bg-ink-300'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* sliding track */}
      <div
        className="overflow-hidden transition-[height] duration-300 ease-out"
        style={trackH != null && !single ? { height: trackH } : undefined}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex items-start transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {questions.map((q, i) => (
            <div
              key={i}
              ref={(el) => {
                slideRefs.current[i] = el
              }}
              inert={i !== idx || undefined}
              aria-hidden={i !== idx}
              className={`w-full shrink-0 transition-opacity duration-300 ${i === idx ? 'opacity-100' : 'opacity-0'}`}
            >
              <QuestionSlide
                q={q}
                st={drafts[i]}
                active={i === idx}
                single={single}
                onPatch={(p) => patch(i, p)}
                onPick={(label) => pick(i, label)}
                onEnter={() => {
                  if (isDone(i)) next()
                }}
                onSubmitOpen={() => {
                  if (single) {
                    if (isDone(i)) submitAll()
                  } else next()
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* footer: batch navigation, or the classic confirm for one multi question */}
      {!single && (
        <div ref={footRef} className="flex items-center gap-2 border-t border-ink-100 px-3 py-2.5">
          <button
            onClick={() => go(idx - 1)}
            className={`flex items-center gap-1 rounded-xl px-2.5 py-2 text-[12px] font-bold text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 ${
              idx === 0 ? 'invisible' : ''
            }`}
          >
            <ChevronLeft size={14} /> {t('question.back')}
          </button>
          <div className="flex-1" />
          {allDone ? (
            <button
              onClick={submitAll}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-[12.5px] font-bold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700 active:scale-95"
            >
              <Send size={13} /> {t('question.sendAll')}
            </button>
          ) : idx < n - 1 ? (
            <button
              onClick={() => go(idx + 1)}
              className="flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[12.5px] font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
            >
              {t('question.next')} <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={() => go(firstMissing)}
              className="flex items-center gap-1 rounded-xl border border-ink-200 px-3 py-2 text-[12px] font-bold text-ink-500 transition hover:border-violet-300 hover:text-violet-700"
            >
              {t('question.missing', { count: missing })} <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
      {single && questions[0].kind === 'multi' && (
        <div className="px-3 pb-3">
          <button
            onClick={submitAll}
            disabled={!allDone}
            className="w-full rounded-xl bg-violet-600 py-2 text-[12.5px] font-bold text-white transition hover:bg-violet-700 disabled:opacity-40"
          >
            {t('question.confirm')} {drafts[0].selected.length > 0 ? `(${drafts[0].selected.length})` : ''}
          </button>
        </div>
      )}
    </div>
  )
}
