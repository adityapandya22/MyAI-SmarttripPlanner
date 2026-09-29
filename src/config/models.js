/**
 * Centralized Model IDs & Provider Configuration.
 * Single source of truth for valid model IDs across the client and server.
 */

export const PROVIDER_MODELS = {
  free: [
    { id: 'smart-planner', label: 'Ulisse AI Planner', noteKey: 'chat.models.smartPlanner' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', noteKey: 'chat.models.geminiFlash' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', noteKey: 'chat.models.gemini15' },
  ],
  claude: [
    { id: 'sonnet', label: 'Sonnet', noteKey: 'chat.models.sonnet' },
    { id: 'opus', label: 'Opus', noteKey: 'chat.models.opus' },
    { id: 'haiku', label: 'Haiku', noteKey: 'chat.models.haiku' },
  ],
  codex: [
    { id: 'gpt-5.5', label: 'GPT-5.5', noteKey: 'chat.models.gpt5_5' },
    { id: 'gpt-5.4', label: 'GPT-5.4', noteKey: 'chat.models.gpt5_4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', noteKey: 'chat.models.gpt5_4_mini' },
  ],
}

export const CLAUDE_MODELS_LIST = ['sonnet', 'opus', 'haiku']
export const CLAUDE_MODELS = new Set(CLAUDE_MODELS_LIST)
export const CODEX_MODELS = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini']
export const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash']
export const VALID_ENGINES = ['free', 'gemini', 'claude', 'codex']

