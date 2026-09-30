import puppeteer from 'puppeteer-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

async function run() {
  console.log('[puppeteer] Launching Edge...')
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  page.on('console', (msg) => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text())
  })

  page.on('pageerror', (err) => {
    console.error('[BROWSER ERROR]:', err)
  })

  console.log('[puppeteer] Navigating to http://localhost:5199...')
  await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' })

  // Wait a bit for stores and ws connection
  await new Promise((r) => setTimeout(r, 2000))

  // Log in as demo user
  const loginRes = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: 'traveler@example.com', password: 'Traveler123!', rememberMe: true })
    })
    const data = await res.json()
    // Re-check auth
    await window.__stores?.useTrip?.getState()
    return { status: res.status, data }
  })
  console.log('[puppeteer] Login result:', loginRes)

  // Reload page to hydrate as authenticated user
  await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' })
  await new Promise((r) => setTimeout(r, 2000))

  // Explicitly create trip with interview phase
  const tripInfo = await page.evaluate(() => {
    const id = window.__stores.useTrip.getState().createTrip('Bali Interview', 'interview')
    const s = window.__stores.useTrip.getState()
    const trip = s.trips.find((t) => t.id === id)
    return { id, phase: trip?.phase, activeId: s.activeId }
  })
  console.log('[puppeteer] Created trip info:', tripInfo)

  await new Promise((r) => setTimeout(r, 1000))

  const beforeSend = await page.evaluate(() => {
    const s = window.__stores.useTrip.getState()
    const trip = s.trips.find((t) => t.id === s.activeId)
    return {
      activeId: s.activeId,
      tripPhase: trip?.phase,
      connected: window.__stores.useAgentChat.getState().connected,
    }
  })
  console.log('[puppeteer] Before send:', beforeSend)

  console.log('[puppeteer] Sending "bali trip"...')
  await page.evaluate(() => {
    window.__stores.useAgentChat.getState().send('bali trip')
  })

  // Monitor for 30 seconds
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const status = await page.evaluate((sec) => {
      const chat = window.__stores?.useAgentChat?.getState()
      const trip = window.__stores?.useTrip?.getState()
      const t = trip?.trips?.find((x) => x.id === trip.activeId)
      return {
        second: sec,
        thinking: chat?.thinking,
        streamText: chat?.streamText?.slice(0, 50),
        messagesCount: chat?.messages?.length,
        lastMessage: chat?.messages?.[chat.messages.length - 1],
        editsCount: chat?.edits?.length,
        phase: t?.phase,
        daysCount: t?.days?.length,
      }
    }, i)
    console.log(`[puppeteer ${i}s]:`, JSON.stringify(status))
  }

  await browser.close()
}

run().catch((err) => {
  console.error('[puppeteer failed]:', err)
  process.exit(1)
})
