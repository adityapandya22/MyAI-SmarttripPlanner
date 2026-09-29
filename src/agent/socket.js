/* WebSocket client to the local agent server: streamed chat events, tool
   execution against the live store, per-edit undo, and persistent chats
   tied to each trip (localStorage). */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useTrip, useUI, activeTrip, toast } from '../store'
import { uid } from '../lib/utils'
import { executeTool, applyUndoOp, WRITE_TOOLS, hooks } from './toolExecutors'
import i18n from '../i18n'

const AGENT_PORT = import.meta.env.VITE_AGENT_PORT ?? 5200

let connectionAttempts = 0

function getWsUrl() {
  const isHttps = typeof location !== 'undefined' && location.protocol === 'https:'
  const proto = isHttps ? 'wss:' : 'ws:'
  const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1'
  const agentPort = import.meta.env.VITE_AGENT_PORT ?? (typeof location !== 'undefined' && location.port === '5199' ? 5200 : (location?.port || 5200))
  // On alternate retry attempts on localhost, try explicit 127.0.0.1 to avoid IPv6 ::1 resolution mismatches on Windows
  const targetHost = (host === 'localhost' && connectionAttempts % 2 === 1) ? '127.0.0.1' : host
  return `${proto}//${targetHost}:${agentPort}/agent`
}

/* demo builds (the public showcase) replace the WebSocket with a scripted
   agent that emits the same event protocol — see src/demo/agent.js */
const DEMO = import.meta.env.VITE_DEMO === '1'
let demoAgent = null

/* ---------- saved conversations, per trip ---------- */
export const useChats = create(
  persist(
    (set) => ({
      byTrip: {},
      saveChat: (tripId, chat) =>
        set((s) => {
          const list = s.byTrip[tripId] ?? []
          const i = list.findIndex((c) => c.id === chat.id)
          const next = i >= 0 ? list.map((c) => (c.id === chat.id ? chat : c)) : [chat, ...list]
          return { byTrip: { ...s.byTrip, [tripId]: next.slice(0, 40) } }
        }),
      deleteChat: (tripId, chatId) =>
        set((s) => ({
          byTrip: { ...s.byTrip, [tripId]: (s.byTrip[tripId] ?? []).filter((c) => c.id !== chatId) },
        })),
    }),
    /* demo builds keep everything per-session: every visit starts pristine */
    { name: 'tripplanner.chats.v1', storage: createJSONStorage(() => (import.meta.env.VITE_DEMO === '1' ? sessionStorage : localStorage)) },
  ),
)
import { CLAUDE_MODELS_LIST, CODEX_MODELS, GEMINI_MODELS, VALID_ENGINES } from '../config/models'

const storedFor = (engine, fallback, valid) => {
  const v = localStorage.getItem(`agent.model.${engine}`)
  return valid.includes(v) ? v : fallback
}

const savedEngine = localStorage.getItem('agent.engine')
const initialEngine = savedEngine && VALID_ENGINES.includes(savedEngine) ? savedEngine : 'free'

export const useAgentChat = create((set, get) => ({
  connected: false,
<<<<<<< HEAD
  connectionState: 'connecting', // 'connecting' | 'connected' | 'disconnected'
=======
  connecting: true,
  connectionError: null,
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
  thinking: false,
  open: true,
  panelW: 0,
  messages: [],
  streamText: '',
  engine: initialEngine,
  providerStatus: null,
  models: {
    free: 'smart-planner',
    gemini: storedFor('gemini', 'gemini-2.0-flash', GEMINI_MODELS),
    claude: storedFor('claude', 'sonnet', CLAUDE_MODELS_LIST),
    codex: storedFor('codex', 'gpt-5.4', CODEX_MODELS),
  },
  codexModels: null,            // [{id,label,note}] from the CLI cache, via the server
  resolvedClaude: localStorage.getItem('agent.resolved.claude') || null, // real model id behind the alias
  chatId: null,                   // active saved-chat id
  sessionId: null,                // engine session/thread to resume
  edits: [],                      // per-turn write log: { id, name, args, result, undo, detail, reverted }
  progress: [],                   // live planning stepper: { id, step, status, detail }
  pendingQuestion: null,          // interactive ask_user carousel { questions, resolve } — or hotel picker { hotels, resolve }
  undoSnapshot: null,
  undoReady: false,
  showEdits: false,
  auth: { engine: null, phase: 'idle', url: null, needsCode: false, error: null }, // guided sign-in flow

  retryConnection: () => retryAgentConnection(),
  setOpen: (open) => set({ open }),
  retry: () => {
    if (get().connected) {
      sendWs({ type: 'models_get' })
      sendWs({ type: 'providers_get' })
    } else {
      retryConnection()
    }
  },

  /* guided sign-in: the server drives the CLI login, we render progress */
  startAuth(engine) {
    set({ auth: { engine, phase: 'waiting', url: null, needsCode: engine === 'claude', error: null } })
    sendWs({ type: 'auth_start', engine })
  },
  sendAuthCode(code) {
    if (!code.trim()) return
    sendWs({ type: 'auth_code', code: code.trim() })
    set((s) => ({ auth: { ...s.auth, phase: 'verifying' } }))
  },
  cancelAuth() {
    sendWs({ type: 'auth_cancel' })
    set({ auth: { engine: null, phase: 'idle', url: null, needsCode: false, error: null } })
  },
  setShowEdits: (showEdits) => set({ showEdits }),
  /* explicit engine+model selection: nothing is ever picked at random */
  select(engine, model) {
    let targetEngine = engine
    const status = get().providerStatus?.[targetEngine]
    if (targetEngine !== 'free' && status && !status.ready) {
      toast(status.message || `Provider ${targetEngine} is not available`)
      targetEngine = 'free'
      model = 'smart-planner'
    }

    let valid
    if (targetEngine === 'free') valid = ['smart-planner']
    else if (targetEngine === 'gemini') valid = GEMINI_MODELS
    else if (targetEngine === 'codex') valid = (get().codexModels?.map((m) => m.id) ?? CODEX_MODELS)
    else valid = CLAUDE_MODELS_LIST

    const m = valid.includes(model) ? model : valid.includes(get().models[targetEngine]) ? get().models[targetEngine] : valid[0]
    localStorage.setItem('agent.engine', targetEngine)
    localStorage.setItem(`agent.model.${targetEngine}`, m)
    if (targetEngine !== get().engine && get().messages.length) get().newChat()
    set((s) => ({ engine: targetEngine, models: { ...s.models, [targetEngine]: m } }))
  },

  send(text) {
    const t = text.trim()
    if (!t || !get().connected || get().thinking) return
    const chatId = get().chatId ?? uid()
    set((s) => ({
      chatId,
      messages: [...s.messages, { id: uid(), role: 'user', text: t }],
      undoReady: false,
      undoSnapshot: null,
      edits: [],
      progress: [],
      showEdits: false,
      streamText: '',
    }))
    persistChat()
    const phase = activeTrip(useTrip.getState())?.phase
    const trip = activeTrip(useTrip.getState())
    const apiKey = localStorage.getItem(`agent.key.${get().engine}`) || null
    sendWs({
      type: 'chat', text: t,
      model: get().models[get().engine],
      engine: get().engine,
      apiKey,
      sessionId: get().sessionId,
      mode: phase === 'interview' ? 'interview' : 'planner',
      notes: trip?.notes ?? '',
      currency: trip?.currency ?? 'INR',
      language: i18n.language,
    })
  },

  stop: () => sendWs({ type: 'stop' }),

  /* after a successful guided sign-in: retry the message that hit the auth
     error, without duplicating the user bubble */
  resendLast() {
    const lastUser = [...get().messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || get().thinking || !get().connected) return
    set({ undoReady: false, undoSnapshot: null, edits: [], progress: [], showEdits: false, streamText: '' })
    const trip = activeTrip(useTrip.getState())
    const apiKey = localStorage.getItem(`agent.key.${get().engine}`) || null
    sendWs({
      type: 'chat', text: lastUser.text,
      model: get().models[get().engine],
      engine: get().engine,
      apiKey,
      sessionId: get().sessionId,
      mode: trip?.phase === 'interview' ? 'interview' : 'planner',
      notes: trip?.notes ?? '',
      currency: trip?.currency ?? 'INR',
      language: i18n.language,
    })
  },

  newChat() {
    if (get().thinking) sendWs({ type: 'stop' })
    set({
      messages: [], chatId: null, sessionId: null,
      undoReady: false, undoSnapshot: null, edits: [], progress: [], showEdits: false, thinking: false, streamText: '',
    })
  },

  openChat(chat) {
    if (get().thinking) sendWs({ type: 'stop' })
    set({
      messages: chat.messages ?? [],
      chatId: chat.id,
      sessionId: chat.sessionId ?? null,
      engine: chat.engine ?? get().engine,
      undoReady: false, undoSnapshot: null, edits: [], progress: [], showEdits: false, thinking: false, streamText: '',
    })
  },

  undoAll() {
    const snap = get().undoSnapshot
    if (!snap) return
    useTrip.getState().importTrip(snap)
    set((s) => ({
      undoReady: false, undoSnapshot: null,
      edits: s.edits.map((e) => ({ ...e, reverted: true })),
    }))
    toast(i18n.t('chat.toasts.turnUndone'))
  },

  /* answer the agent's interactive questions (all at once); unblocks its
     tool call. items: [{ question, answers: [string] }], one per question */
  answerQuestions(items) {
    const q = get().pendingQuestion
    if (!q) return
    set((s) => ({
      pendingQuestion: null,
      messages: [...s.messages, { id: uid(), role: 'qa', items }],
    }))
    persistChat()
    q.resolve({
      ok: true,
      answers: items.map((x) => ({ question: x.question, answer: x.answers.length > 1 ? x.answers : x.answers[0] ?? '' })),
    })
  },

  /* pick a proposed hotel (name) or reject them all (null) */
  chooseHotel(name) {
    const q = get().pendingQuestion
    if (!q?.hotels) return
    useUI.getState().setPlacePreview(null)
    set((s) => ({
      pendingQuestion: null,
      messages: [...s.messages, { id: uid(), role: 'hotelpick', hotels: q.hotels, choice: name }],
    }))
    persistChat()
    q.resolve(name
      ? { ok: true, choice: name, note: "Applica SUBITO la scelta: aggiorna l'item hotel con prezzo/notte reale e il link Booking.com nei links." }
      : { ok: true, choice: 'none', note: "Nessuna proposta piace all'utente: chiedi cosa non va (zona, prezzo, stile) o proponi alternative diverse." })
  },

  /* pick a proposed restaurant (name) or reject them all (null) */
  chooseRestaurant(name) {
    const q = get().pendingQuestion
    if (!q?.restaurants) return
    useUI.getState().setPlacePreview(null)
    set((s) => ({
      pendingQuestion: null,
      messages: [...s.messages, { id: uid(), role: 'restpick', restaurants: q.restaurants, choice: name }],
    }))
    persistChat()
    q.resolve(name
      ? { ok: true, choice: name, note: "Applica SUBITO la scelta: crea o aggiorna l'item food con il link Google Maps nei links e la fascia di prezzo nelle note." }
      : { ok: true, choice: 'none', note: "Nessuna proposta piace all'utente: chiedi cosa non va (zona, prezzo, cucina) o proponi alternative diverse." })
  },

  undoOne(editId) {
    const edit = get().edits.find((e) => e.id === editId)
    if (!edit || edit.reverted || !edit.undo) return
    try {
      applyUndoOp(edit.undo)
      set((s) => {
        const edits = s.edits.map((e) => (e.id === editId ? { ...e, reverted: true } : e))
        const anyLeft = edits.some((e) => !e.reverted)
        return { edits, undoReady: anyLeft && !!s.undoSnapshot }
      })
      toast(i18n.t('chat.toasts.editUndone'))
    } catch (e) {
      toast(i18n.t('chat.toasts.undoFailed', { error: e?.message ?? e }))
    }
  },
}))

/* write the working conversation into the saved-chats store */
function persistChat() {
  const s = useAgentChat.getState()
  const tripId = useTrip.getState().activeId
  if (!s.chatId || !tripId) return
  const firstUser = s.messages.find((m) => m.role === 'user')
  useChats.getState().saveChat(tripId, {
    id: s.chatId,
    engine: s.engine,
    model: s.models[s.engine],
    sessionId: s.sessionId,
    title: (firstUser?.text ?? i18n.t('store.conversation')).slice(0, 70),
    updatedAt: Date.now(),
    messages: s.messages,
  })
}

/* executor hooks: live stepper + view flip on start_planning */
hooks.onProgress = (a) => {
  useAgentChat.setState((s) => {
    const existing = s.progress.find((p) => p.step === a.step)
    if (existing) {
      return { progress: s.progress.map((p) => (p.step === a.step ? { ...p, status: a.status, detail: a.detail ?? p.detail } : p)) }
    }
    return { progress: [...s.progress, { id: uid(), step: a.step, status: a.status, detail: a.detail }] }
  })
}
hooks.onStartPlanning = () => {
  useAgentChat.setState({ open: true })
}
hooks.onNotebook = () => {
  useAgentChat.setState({ notebookFlash: Date.now() })
}
hooks.onAskUser = (a, resolve) => {
  /* only one live carousel at a time: cancel a stale one */
  useAgentChat.getState().pendingQuestion?.resolve({ ok: false, error: 'Domanda sostituita da una nuova.' })
  /* accept both the batched shape ({ questions: [...] }) and the legacy
     single-question shape, normalized to a list for the carousel */
  const raw = Array.isArray(a.questions) && a.questions.length ? a.questions : [a]
  const questions = raw.slice(0, 6).map((q) => ({
    question: q.question ?? '',
    kind: q.kind ?? 'open',
    options: q.options ?? [],
    allowOther: !!q.allow_other,
  }))
  useAgentChat.setState({ pendingQuestion: { questions, resolve } })
}
hooks.onProposeHotels = (a, resolve) => {
  useAgentChat.getState().pendingQuestion?.resolve({ ok: false, error: 'Proposta sostituita da una nuova.' })
  useAgentChat.setState({
    pendingQuestion: {
      hotels: {
        location: a.location ?? '',
        checkin: a.checkin ?? null,
        checkout: a.checkout ?? null,
        dayNumber: a.day_number ?? null,
        options: (a.options ?? []).slice(0, 4),
      },
      resolve,
    },
  })
}
hooks.onProposeRestaurants = (a, resolve) => {
  useAgentChat.getState().pendingQuestion?.resolve({ ok: false, error: 'Proposta sostituita da una nuova.' })
  useAgentChat.setState({
    pendingQuestion: {
      restaurants: {
        location: a.location ?? '',
        dayNumber: a.day_number ?? null,
        meal: a.meal ?? null,
        options: (a.options ?? []).slice(0, 4),
      },
      resolve,
    },
  })
}

/* dev-only handle for automated UI tests */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__stores = { useAgentChat, useTrip, useUI }
}

let ws = null
let retryTimer = null

function sendWs(obj) {
  if (DEMO) { demoAgent?.send(obj); return }
  if (ws?.readyState === 1) ws.send(JSON.stringify(obj))
}

export function sendAdminMessage(obj) {
  sendWs(obj)
}

const push = (msg) => useAgentChat.setState((s) => ({ messages: [...s.messages, { id: uid(), ...msg }] }))

async function handleToolCall(msg) {
  if (WRITE_TOOLS.has(msg.name) && !useAgentChat.getState().undoSnapshot) {
    const t = activeTrip(useTrip.getState())
    if (t) useAgentChat.setState({ undoSnapshot: structuredClone(t) })
  }
  try {
    const result = await executeTool(msg.name, msg.args)
    if (WRITE_TOOLS.has(msg.name)) {
      const { undo, detail, ...rest } = result ?? {}
      useAgentChat.setState((s) => ({
        edits: [...s.edits, { id: uid(), name: msg.name, args: msg.args ?? {}, result: rest, undo, detail, reverted: false }],
      }))
    }
    sendWs({ type: 'tool_result', id: msg.id, result })
  } catch (e) {
    sendWs({ type: 'tool_result', id: msg.id, error: String(e?.message ?? e) })
  }
}

function handleEvent(msg) {
  switch (msg.type) {
    case 'tool_call':
      handleToolCall(msg)
      break
    case 'assistant_delta':
      useAgentChat.setState((s) => ({ streamText: s.streamText + msg.text }))
      break
    case 'assistant_text':
      useAgentChat.setState({ streamText: '' })
      push({ role: 'assistant', text: msg.text })
      persistChat()
      break
    case 'agent_tool':
      /* ask_user / propose_* render as interactive cards, report_progress as the stepper */
      if (msg.name !== 'ask_user' && msg.name !== 'propose_hotels' && msg.name !== 'propose_restaurants' && msg.name !== 'report_progress') {
        push({ role: 'tool', name: msg.name, args: msg.args })
      }
      break
    case 'agent_error':
      if (msg.auth) push({ role: 'setup', engine: msg.auth, text: msg.error, canUseFree: !!msg.canUseFree })
      else push({ role: 'error', text: msg.error, canUseFree: !!msg.canUseFree })
      break
    case 'provider_status': {
      const providers = msg.providers || {}
      useAgentChat.setState({ providerStatus: providers })
      const cur = useAgentChat.getState().engine
      if (cur !== 'free' && providers[cur] && !providers[cur].ready) {
        console.warn(`[agent/socket] Engine ${cur} not ready (${providers[cur].message}). Falling back to free agent.`)
        toast(`Switched to Free AI Agent (Ulisse AI Planner)`)
        useAgentChat.getState().select('free', 'smart-planner')
      }
      break
    }
    case 'codex_models': {
      /* the CLI's currently valid slugs: heal a stale saved selection */
      const list = Array.isArray(msg.models) ? msg.models.filter((m) => m?.id) : []
      if (!list.length) break
      useAgentChat.setState({ codexModels: list })
      const cur = useAgentChat.getState().models.codex
      const good = list.some((m) => m.id === cur) ? cur : list.find((m) => m.id === 'gpt-5.4')?.id ?? list[0].id
      localStorage.setItem('agent.model.codex', good)
      if (good !== cur) useAgentChat.setState((s) => ({ models: { ...s.models, codex: good } }))
      break
    }
    case 'auth_event': {
      const cur = useAgentChat.getState().auth
      if (msg.engine !== cur.engine && msg.phase !== 'done') break
      if (msg.phase === 'started') useAgentChat.setState({ auth: { ...cur, phase: 'waiting' } })
      else if (msg.phase === 'url') useAgentChat.setState({ auth: { ...cur, phase: 'waiting', url: msg.url, needsCode: !!msg.needsCode || cur.needsCode } })
      else if (msg.phase === 'done') {
        useAgentChat.setState({ auth: { ...cur, engine: msg.engine, phase: 'done', error: null } })
        toast(i18n.t('chat.toasts.accountLinked'))
        setTimeout(() => useAgentChat.getState().resendLast(), 800)
      } else if (msg.phase === 'error') useAgentChat.setState({ auth: { ...cur, phase: 'error', error: msg.error } })
      break
    }
    case 'model':
      /* the SDK reports the real model behind the alias (e.g. claude-sonnet-5):
         shown in the picker so the list is always current without a model API */
      if (String(msg.model ?? '').startsWith('claude')) {
        localStorage.setItem('agent.resolved.claude', msg.model)
        useAgentChat.setState({ resolvedClaude: msg.model })
      }
      break
    case 'session':
      useAgentChat.setState({ sessionId: msg.sessionId })
      persistChat()
      break
    case 'admin_config':
      window.dispatchEvent(new CustomEvent('ulisse:admin_config', { detail: msg }))
      break
    case 'turn_start':
      useAgentChat.setState({ thinking: true })
      break
    case 'storage_changed':
      /* files touched by hand on disk; storageSync listens (no import: cycle) */
      window.dispatchEvent(new CustomEvent('ulisse:storage-changed', { detail: msg }))
      break
    case 'turn_end':
      useAgentChat.getState().pendingQuestion?.resolve({ ok: false, error: 'Turno terminato.' })
      useAgentChat.setState((s) => {
        const leftovers = s.streamText.trim()
        return {
          thinking: false,
          pendingQuestion: null,
          undoReady: s.edits.some((e) => !e.reverted) && !!s.undoSnapshot,
          streamText: '',
          messages: leftovers ? [...s.messages, { id: uid(), role: 'assistant', text: leftovers }] : s.messages,
        }
      })
      persistChat()
      break
  }
}

<<<<<<< HEAD
export function connectAgent(isManual = false) {
=======
export function connectAgent(force = false) {
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
  if (DEMO) {
    if (demoAgent) return
    import('../demo/agent').then((m) => {
      demoAgent = m.createDemoAgent(handleEvent)
<<<<<<< HEAD
      useAgentChat.setState({ connected: true, connectionState: 'connected' })
=======
      useAgentChat.setState({ connected: true, connecting: false, connectionError: null })
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
      sendWs({ type: 'models_get' })
    })
    return
  }
<<<<<<< HEAD
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
    if (ws.readyState === 1) {
      useAgentChat.setState({ connected: true, connectionState: 'connected' })
    }
    return
  }
  if (isManual) {
    connectionAttempts = 0
  }
  useAgentChat.setState({ connectionState: 'connecting' })
  const url = getWsUrl()
  console.log(`[Ulisse Agent] Connecting to WebSocket at ${url} (attempt ${connectionAttempts + 1})...`)

  try {
    ws = new WebSocket(url)
  } catch (err) {
    console.warn(`[Ulisse Agent] Failed to create WebSocket for ${url}:`, err)
    useAgentChat.setState({ connected: false, connectionState: 'disconnected' })
=======
  if (!force && ws && (ws.readyState === 0 || ws.readyState === 1)) return
  if (force && ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
  }
  useAgentChat.setState({ connecting: true, connectionError: null })
  console.log(`[agent/socket] Connecting to ${WS_URL}`)
  try {
    ws = new WebSocket(WS_URL)
  } catch (err) {
    console.error(`[agent/socket] WebSocket connection constructor failed:`, err)
    useAgentChat.setState({ connected: false, connecting: false, connectionError: err.message || 'Connection failed' })
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
    scheduleRetry()
    return
  }

  ws.onopen = () => {
<<<<<<< HEAD
    console.log(`[Ulisse Agent] Connected successfully to ${url}`)
    connectionAttempts = 0
    useAgentChat.setState({ connected: true, connectionState: 'connected' })
=======
    console.log(`[agent/socket] Connected successfully to ${WS_URL}`)
    useAgentChat.setState({ connected: true, connecting: false, connectionError: null })
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
    sendWs({ type: 'models_get' })
    sendWs({ type: 'providers_get' })
  }
  ws.onmessage = (e) => {
    try { handleEvent(JSON.parse(e.data)) } catch { /* ignore malformed frames */ }
  }
  ws.onclose = (ev) => {
<<<<<<< HEAD
    console.log(`[Ulisse Agent] WebSocket closed (code: ${ev.code}, clean: ${ev.wasClean})`)
    connectionAttempts++
    useAgentChat.setState({ connected: false, connectionState: 'disconnected', thinking: false })
    scheduleRetry()
  }
  ws.onerror = (err) => {
    console.warn(`[Ulisse Agent] WebSocket error on ${url}:`, err)
=======
    console.warn(`[agent/socket] Disconnected (code: ${ev.code}, reason: ${ev.reason || 'normal'})`)
    useAgentChat.setState({ connected: false, connecting: false, thinking: false })
    scheduleRetry()
  }
  ws.onerror = (err) => {
    console.error(`[agent/socket] Connection error:`, err)
    useAgentChat.setState({ connectionError: 'Failed to connect to agent server' })
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
    ws?.close()
  }
}

<<<<<<< HEAD
export function retryAgentConnection() {
  clearTimeout(retryTimer)
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }
=======
export function retryConnection() {
  clearTimeout(retryTimer)
>>>>>>> 8693e58 (Consumer bridge mode, provider status, model config, destination aliases)
  connectAgent(true)
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(connectAgent, 3000)
}
