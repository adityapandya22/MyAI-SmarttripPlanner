/**
 * Server-side Provider Health & Authentication Status Checker.
 * Checks availability and login status for Free, Gemini, Claude, and Codex.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function resolveBinary(name) {
  if (process.platform === 'win32') {
    const localCmd = join(__dirname, '..', '..', 'node_modules', '.bin', `${name}.cmd`)
    if (existsSync(localCmd)) return localCmd
  }
  const local = join(__dirname, '..', '..', 'node_modules', '.bin', name)
  if (existsSync(local)) return local
  return name
}

export function checkProviderStatus(auth = null) {
  const home = homedir()
  const status = {
    free: {
      ready: true,
      status: 'ready',
      message: 'Autonomous Free Agent · Ulisse AI Planner',
    },
    gemini: {
      ready: false,
      status: 'no_key',
      message: 'No API key set in Admin',
    },
    claude: {
      ready: false,
      status: 'not_logged_in',
      message: 'Not logged in. Run `claude login` in a terminal',
    },
    codex: {
      ready: false,
      status: 'not_logged_in',
      message: 'Not logged in. Run `codex login` in a terminal',
    },
  }

  // Gemini check
  const geminiKey = auth?.getGeminiKey?.() || process.env.GEMINI_API_KEY
  if (geminiKey) {
    status.gemini = {
      ready: true,
      status: 'ready',
      message: 'Gemini API key configured',
    }
  }

  // Claude check
  const claudeToken = auth?.getClaudeToken?.() || process.env.CLAUDE_CODE_OAUTH_TOKEN
  const claudeHomeConfig = join(home, '.claude.json')
  let claudeLoggedIn = !!claudeToken
  if (!claudeLoggedIn && existsSync(claudeHomeConfig)) {
    try {
      const data = JSON.parse(readFileSync(claudeHomeConfig, 'utf8'))
      if (data?.oauthAccount || data?.primaryApiKey || data?.sessionKey) {
        claudeLoggedIn = true
      }
    } catch {
      // ignore read error
    }
  }

  if (claudeLoggedIn) {
    status.claude = {
      ready: true,
      status: 'ready',
      message: 'Claude authenticated',
    }
  } else {
    status.claude = {
      ready: false,
      status: 'not_logged_in',
      message: 'Not logged in. Run `claude login` in a terminal',
    }
  }

  // Codex check
  const codexAuthPath = join(home, '.codex', 'auth.json')
  let codexLoggedIn = existsSync(codexAuthPath)
  if (!codexLoggedIn) {
    // Check if auth file has valid tokens or if custom token provided
    if (process.env.OPENAI_API_KEY || auth?.getCodexKey?.()) {
      codexLoggedIn = true
    }
  }

  if (codexLoggedIn) {
    status.codex = {
      ready: true,
      status: 'ready',
      message: 'ChatGPT connected',
    }
  } else {
    status.codex = {
      ready: false,
      status: 'not_logged_in',
      message: 'Not logged in. Run `codex login` in a terminal',
    }
  }

  return status
}
