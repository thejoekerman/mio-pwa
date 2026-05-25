// Lightweight, dependency-free helpers for the on-device Review Draft feature.
// Kept separate from localReviewDraft.ts so importing the model registry or the
// WebGPU check never pulls the (~6 MB) WebLLM runtime into eager app chunks.
// The heavy generation path lives in localReviewDraft.ts and is loaded lazily.
import type { AppLanguage } from '../types'

export type LocalReviewModelTier = 'balanced' | 'fast' | 'quality'

export interface LocalReviewModelOption {
  id: string
  name: string
  tier: LocalReviewModelTier
  sizeLabel: string
  // App languages this model produces acceptable drafts in. Small models are
  // English-only; German/Japanese need a capable multilingual model. Curated by
  // testing — the small Qwen/Llama models output garbage in German.
  languages: AppLanguage[]
}

/**
 * On-device models offered for the local Review Draft feature. The ids match
 * entries in WebLLM's prebuilt app config, so the weights are fetched and
 * cached by WebLLM itself (never by our service worker).
 */
export const LOCAL_REVIEW_MODELS: LocalReviewModelOption[] = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', tier: 'fast', sizeLabel: '~0.4 GB', languages: ['en'] },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', tier: 'balanced', sizeLabel: '~0.9 GB', languages: ['en'] },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', tier: 'quality', sizeLabel: '~1.2 GB', languages: ['en'] },
  // Gemma 2 2B is the least-bad German model so far (small Qwen/Llama output
  // garbage in DE; Gemma 3 1B and StableLM 2 were tested and rejected). Strong
  // English too. Capable devices only (~1.5 GB — not the iPhone 14).
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', tier: 'quality', sizeLabel: '~1.5 GB', languages: ['en', 'de'] },
]

// Per-language default model. TS forces an entry here for every AppLanguage, so
// adding `ja` will surface a compile error until a Japanese model is wired up.
const LANGUAGE_MODEL_DEFAULTS: Record<AppLanguage, string> = {
  en: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  de: 'gemma-2-2b-it-q4f16_1-MLC',
}

// Used by useSettings for the initial stored value; per-language resolution
// happens at use time via resolveLocalReviewModel().
export const DEFAULT_LOCAL_REVIEW_MODEL = LANGUAGE_MODEL_DEFAULTS.en

export function isLocalReviewModelId(value: string): boolean {
  return LOCAL_REVIEW_MODELS.some((model) => model.id === value)
}

/** Models that produce acceptable drafts in the given app language. */
export function getModelsForLanguage(language: AppLanguage): LocalReviewModelOption[] {
  return LOCAL_REVIEW_MODELS.filter((model) => model.languages.includes(language))
}

export function hasLocalReviewModelForLanguage(language: AppLanguage): boolean {
  return getModelsForLanguage(language).length > 0
}

export function getDefaultModelForLanguage(language: AppLanguage): string {
  return LANGUAGE_MODEL_DEFAULTS[language] ?? LOCAL_REVIEW_MODELS[0].id
}

/**
 * The model actually used for the current app language: the user's stored choice
 * if it supports that language, otherwise the language default. (Drafts follow
 * the app language, so a model must be able to write in it.)
 */
export function resolveLocalReviewModel(storedId: string, language: AppLanguage): string {
  const stored = LOCAL_REVIEW_MODELS.find((model) => model.id === storedId)
  if (stored && stored.languages.includes(language)) {
    return storedId
  }
  return getDefaultModelForLanguage(language)
}

/** Fast, synchronous check that the WebGPU API surface merely exists. */
export function isWebGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

let webGpuSupportPromise: Promise<boolean> | null = null

// WebLLM's shaders need 10 storage buffers per shader stage. Firefox currently
// caps this at 8, so it can hand out an adapter that still can't run a model.
const REQUIRED_MAX_STORAGE_BUFFERS = 10

/**
 * Reliable WebGPU check: the API existing isn't enough. We request an adapter
 * (Firefox/macOS may expose the API but return none) and confirm it actually
 * meets WebLLM's storage-buffer requirement. Memoized for the session.
 */
export function detectWebGpuSupport(): Promise<boolean> {
  if (!webGpuSupportPromise) {
    webGpuSupportPromise = (async () => {
      if (!isWebGpuAvailable()) {
        return false
      }

      try {
        const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
        const adapter = (await gpu?.requestAdapter()) as
          | { limits?: { maxStorageBuffersPerShaderStage?: number } }
          | null
          | undefined

        if (!adapter) {
          return false
        }

        const maxStorageBuffers = adapter.limits?.maxStorageBuffersPerShaderStage ?? 0
        return maxStorageBuffers >= REQUIRED_MAX_STORAGE_BUFFERS
      } catch {
        return false
      }
    })()
  }

  return webGpuSupportPromise
}

/** True when an error looks like the browser ran out of storage quota. */
export function isStorageQuotaError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  if (name === 'QuotaExceededError') {
    return true
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  return /quota|storage full|out of space|insufficient.*(storage|space)/i.test(message)
}

/** True when an error looks like WebGPU is missing or too limited to run a model. */
export function isWebGpuError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /webgpu|gpu.*adapter|requestadapter|no available adapter|compatible adapter|gpu device|maxstoragebuffers|exceeds limit|cannot initialize runtime/i.test(
    message,
  )
}

export type LocalReviewProgress =
  | { phase: 'loading'; text: string; progress: number }
  | { phase: 'generating' }

// Crash sentinel: on-device inference can exceed iOS Safari's memory ceiling and
// the OS kills the whole tab — uncatchable, no JS error. We drop a marker in
// localStorage before generating and clear it on a clean finish; if it survives
// to the next attempt, the previous run crashed the tab and we warn instead of
// silently crashing again.
const LOCAL_DRAFT_PENDING_KEY = 'miolog-local-draft-pending'

export function setLocalDraftPending(modelId: string): void {
  try {
    window.localStorage.setItem(LOCAL_DRAFT_PENDING_KEY, JSON.stringify({ modelId, at: Date.now() }))
  } catch {
    // Best-effort only.
  }
}

export function clearLocalDraftPending(): void {
  try {
    window.localStorage.removeItem(LOCAL_DRAFT_PENDING_KEY)
  } catch {
    // Best-effort only.
  }
}

export function hasPendingLocalDraft(): boolean {
  try {
    return window.localStorage.getItem(LOCAL_DRAFT_PENDING_KEY) !== null
  } catch {
    return false
  }
}
