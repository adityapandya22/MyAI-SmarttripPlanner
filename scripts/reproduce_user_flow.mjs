import puppeteer from 'puppeteer-core'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

async function run() {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  page.on('console', (msg) => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text())
  })

  page.on('pageerror', (err) => {
    console.error('[BROWSER ERROR]:', err)
  })

  console.log('Navigating to http://localhost:5199...')
  await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' })

  // Log in as traveler
  console.log('Logging in...')
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email: 'traveler@example.com', password: 'Traveler123!', rememberMe: true })
    })
  })

  await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 1000))

  // Find input or create trip
  console.log('Creating new trip with agent interview...')
  await page.evaluate(() => {
    // Click "New Trip" or call createTrip
    window.__stores.useTrip.getState().createTrip('New Trip', 'interview')
  })

  await new Promise((r) => setTimeout(r, 1000))

  // Listen to WebSocket messages directly in browser
  await page.evaluate(() => {
    window.__wsEvents = []
    const origPush = window.__stores.useAgentChat.getState().send
    // We can monitor state changes
  })

  console.log('Sending "bali trip" via chat...')
  await page.evaluate(() => {
    window.__stores.useAgentChat.getState().send('bali trip')
  })

  // Poll state every second for 25 seconds
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const state = await page.evaluate((sec) => {
      const chat = window.__stores?.useAgentChat?.getState()
      const trip = window.__stores?.useTrip?.getState()
      const t = trip?.trips?.find((x) => x.id === trip.activeId)
      return {
        sec,
        thinking: chat?.thinking,
        streamText: chat?.streamText,
        messages: chat?.messages?.map((m) => ({ role: m.role, name: m.name, text: m.text?.slice(0, 40) })),
        editsCount: chat?.edits?.length,
        tripPhase: t?.phase,
        days: t?.days?.map((d) => ({ title: d.title, itemsCount: d.items?.length })),
      }
    }, i)
    console.log(`[sec ${i}]:`, JSON.stringify(state))
  }

  await browser.close()
}

run().catch(console.error)
