/**
 * End-to-end verification script for Authentication & Data Isolation
 * Runs real HTTP requests against the backend server to verify:
 * 1. Missing header rejection
 * 2. Preflight OPTIONS CORS check
 * 3. Signup lifecycle
 * 4. Duplicate signup rejection (409)
 * 5. Wrong password rejection (401)
 * 6. Login & Session cookie issuance (rememberMe = true, 30 days)
 * 7. GET /api/auth/me session persistence
 * 8. Trip creation & retrieval linked to logged-in user
 * 9. RBAC: Normal user denied from admin route (403)
 * 10. Admin login & successful access to admin overview
 * 11. Logout & session invalidation
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 5566
const BASE_URL = `http://127.0.0.1:${PORT}`

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, options)
  const contentType = res.headers.get('content-type') || ''
  let data = null
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null)
  } else {
    data = await res.text().catch(() => null)
  }
  return {
    status: res.status,
    headers: res.headers,
    data,
  }
}

async function runVerification() {
  console.log('--- Starting verification test server on port', PORT, '---')
  const env = {
    ...process.env,
    PORT: String(PORT),
    ADMIN_EMAIL: 'admin@mytripplanner.local',
    ADMIN_PASSWORD: 'AdminPass2026!',
    NODE_ENV: 'development',
  }

  const serverProc = spawn('node', ['server/index.mjs'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverProc.stdout.on('data', (d) => process.stdout.write(`[srv] ${d}`))
  serverProc.stderr.on('data', (d) => process.stderr.write(`[srv-err] ${d}`))

  try {
    // Wait for server to bind
    let ready = false
    for (let i = 0; i < 20; i++) {
      await wait(500)
      try {
        const health = await fetch(`${BASE_URL}/health`)
        if (health.ok) {
          ready = true
          break
        }
      } catch {}
    }

    if (!ready) {
      throw new Error('Server failed to start within 10 seconds')
    }
    console.log('\n Server started successfully!')

    // 1. Test missing X-Requested-With header on POST /api/auth/login
    console.log('\n[1/11] Testing POST without X-Requested-With header...')
    const noHeaderRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
    })
    console.log('Status:', noHeaderRes.status, 'Error:', noHeaderRes.data?.error)
    if (noHeaderRes.status !== 403 || !noHeaderRes.data?.error?.includes('X-Requested-With')) {
      throw new Error('Expected 403 Missing or invalid X-Requested-With header')
    }

    // 2. Test CORS Preflight OPTIONS on /api/auth/login
    console.log('\n[2/11] Testing CORS Preflight OPTIONS request...')
    const optionsRes = await request('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5199',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-Requested-With, Content-Type',
      },
    })
    console.log('Status:', optionsRes.status)
    console.log('Access-Control-Allow-Origin:', optionsRes.headers.get('access-control-allow-origin'))
    if (optionsRes.status !== 204 || optionsRes.headers.get('access-control-allow-origin') !== 'http://localhost:5199') {
      throw new Error('OPTIONS preflight failed')
    }

    // 3. Test Signup end-to-end
    const testEmail = `traveler.${Date.now()}@test.local`
    console.log(`\n[3/11] Testing Signup with ${testEmail}...`)
    const signupRes = await request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'http://localhost:5199',
      },
      body: JSON.stringify({
        fullName: 'Test Traveler',
        email: testEmail,
        password: 'ValidPassword123!',
        phone: '+91 9999999999',
        homeCity: 'Jaipur',
      }),
    })
    console.log('Status:', signupRes.status, 'User:', signupRes.data?.user?.email)
    if (signupRes.status !== 201 || !signupRes.data?.success) {
      throw new Error('Signup failed: ' + JSON.stringify(signupRes.data))
    }
    const signupCookie = signupRes.headers.get('set-cookie')
    if (!signupCookie || !signupCookie.includes('sid=')) {
      throw new Error('Signup did not set session cookie')
    }

    // 4. Test Duplicate Signup (409)
    console.log('\n[4/11] Testing duplicate signup rejection...')
    const dupRes = await request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        fullName: 'Test Duplicate',
        email: testEmail,
        password: 'ValidPassword123!',
      }),
    })
    console.log('Status:', dupRes.status, 'Error:', dupRes.data?.error)
    if (dupRes.status !== 409 || !dupRes.data?.error?.includes('already exists')) {
      throw new Error('Duplicate signup did not return 409')
    }

    // 5. Test Wrong Password (401)
    console.log('\n[5/11] Testing wrong password rejection...')
    const wrongPwRes = await request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'IncorrectPassword999!',
      }),
    })
    console.log('Status:', wrongPwRes.status, 'Error:', wrongPwRes.data?.error)
    if (wrongPwRes.status !== 401 || !wrongPwRes.data?.error?.includes('Invalid email or password')) {
      throw new Error('Wrong password did not return 401')
    }

    // 6. Test Sign In with rememberMe = true (30 day cookie)
    console.log('\n[6/11] Testing Sign In with rememberMe = true...')
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'http://localhost:5199',
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'ValidPassword123!',
        rememberMe: true,
      }),
    })
    console.log('Status:', loginRes.status, 'User Role:', loginRes.data?.user?.role)
    const loginCookie = loginRes.headers.get('set-cookie')
    console.log('Set-Cookie:', loginCookie)
    if (loginRes.status !== 200 || !loginCookie?.includes('Max-Age=2592000')) {
      throw new Error('Login failed or rememberMe 30-day Max-Age missing')
    }

    const sidToken = loginCookie.match(/sid=([^;]+)/)[1]
    const cookieHeader = `sid=${sidToken}`

    // 7. Test Session Persistence: GET /api/auth/me
    console.log('\n[7/11] Testing session persistence via GET /api/auth/me...')
    const meRes = await request('/api/auth/me', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    console.log('Status:', meRes.status, 'Authenticated:', meRes.data?.authenticated, 'User:', meRes.data?.user?.email)
    if (meRes.status !== 200 || !meRes.data?.authenticated || meRes.data?.user?.email !== testEmail) {
      throw new Error('Session check /api/auth/me failed')
    }

    // 8. Test Data Saving: Create Trip -> GET Trips
    console.log('\n[8/11] Testing trip creation and retrieval linked to user...')
    const newTrip = {
      id: `trip-test-${Date.now()}`,
      title: 'Golden Triangle Adventure',
      days: [{ id: 'd1', title: 'Day 1 in Delhi', night: 'Delhi', items: [] }],
    }
    const createTripRes = await request('/api/trips', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(newTrip),
    })
    console.log('Create Trip Status:', createTripRes.status, 'Trip Title:', createTripRes.data?.trip?.title)
    if (createTripRes.status !== 201) {
      throw new Error('Trip creation failed')
    }

    const listTripsRes = await request('/api/trips', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    console.log('List Trips Count:', listTripsRes.data?.trips?.length)
    if (listTripsRes.status !== 200 || listTripsRes.data?.trips?.length !== 1) {
      throw new Error('Failed to retrieve user trips')
    }

    // 9. Test RBAC: Normal user denied from admin route (403)
    console.log('\n[9/11] Testing RBAC: normal user access to /api/admin/overview...')
    const adminCheckRes = await request('/api/admin/overview', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    console.log('Status:', adminCheckRes.status, 'Error:', adminCheckRes.data?.error)
    if (adminCheckRes.status !== 403) {
      throw new Error('Normal user was not denied from admin route (expected 403)')
    }

    // 10. Test Admin Login & Admin Route Access
    console.log('\n[10/11] Testing Admin Login...')
    const adminLoginRes = await request('/api/auth/admin-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        email: 'admin@mytripplanner.local',
        password: 'AdminPass2026!',
      }),
    })
    console.log('Admin Login Status:', adminLoginRes.status, 'Role:', adminLoginRes.data?.user?.role)
    if (adminLoginRes.status !== 200 || adminLoginRes.data?.user?.role !== 'admin') {
      throw new Error('Admin login failed')
    }
    const adminCookie = adminLoginRes.headers.get('set-cookie')
    const adminSid = adminCookie.match(/sid=([^;]+)/)[1]

    const adminOverviewRes = await request('/api/admin/overview', {
      method: 'GET',
      headers: {
        Cookie: `sid=${adminSid}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    console.log('Admin Overview Status:', adminOverviewRes.status, 'Total Users:', adminOverviewRes.data?.stats?.users)
    if (adminOverviewRes.status !== 200 || adminOverviewRes.data?.stats?.users < 2) {
      throw new Error('Admin overview access failed')
    }

    // 11. Test Logout
    console.log('\n[11/11] Testing Logout...')
    const logoutRes = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    console.log('Logout Status:', logoutRes.status, 'Set-Cookie:', logoutRes.headers.get('set-cookie'))
    if (logoutRes.status !== 200 || !logoutRes.headers.get('set-cookie')?.includes('Max-Age=0')) {
      throw new Error('Logout failed to clear cookie')
    }

    const meAfterLogout = await request('/api/auth/me', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    console.log('GET /me after logout authenticated:', meAfterLogout.data?.authenticated)
    if (meAfterLogout.data?.authenticated) {
      throw new Error('Session was still authenticated after logout')
    }

    // 12. Test Server Restart & Data Persistence
    console.log('\n[12/12] Testing Server Restart & Data Persistence...')
    serverProc.kill()
    await wait(1000)

    const serverProc2 = spawn('node', ['server/index.mjs'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    try {
      let ready2 = false
      for (let i = 0; i < 20; i++) {
        await wait(500)
        try {
          const health = await fetch(`${BASE_URL}/health`)
          if (health.ok) {
            ready2 = true
            break
          }
        } catch {}
      }
      if (!ready2) throw new Error('Second server failed to start')

      // Login again with testEmail and verify the trip created before restart is still present
      const reloginRes = await request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          email: testEmail,
          password: 'ValidPassword123!',
        }),
      })
      if (reloginRes.status !== 200) throw new Error('Failed to relogin after restart')
      const restartCookie = reloginRes.headers.get('set-cookie').match(/sid=([^;]+)/)[1]

      const tripsAfterRestart = await request('/api/trips', {
        method: 'GET',
        headers: {
          Cookie: `sid=${restartCookie}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
      console.log('Trips count after restart:', tripsAfterRestart.data?.trips?.length)
      console.log('Trip title:', tripsAfterRestart.data?.trips?.[0]?.title)
      if (tripsAfterRestart.data?.trips?.length !== 1 || tripsAfterRestart.data?.trips?.[0]?.title !== 'Golden Triangle Adventure') {
        throw new Error('Trip data was lost after server restart')
      }
      console.log('Data persistence verified successfully!')
    } finally {
      serverProc2.kill()
    }

    console.log('\n ALL 12 VERIFICATION CHECKS (INCLUDING SERVER RESTART) PASSED PERFECTLY! \n')
  } finally {
    serverProc.kill()
  }
}

runVerification().catch((err) => {
  console.error('\n VERIFICATION FAILED:', err)
  process.exit(1)
})
