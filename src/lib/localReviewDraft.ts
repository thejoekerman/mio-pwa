// Heavy WebLLM-backed generation path. This module statically imports the
// ~6 MB WebLLM runtime, so it must only ever be loaded via dynamic import()
// (see aiFeatures.ts) — never with a top-level import from eager app code.
import {
  CreateWebWorkerMLCEngine,
  deleteModelAllInfoInCache,
  hasModelInCache,
  type ChatCompletionMessageParam,
  type InitProgressReport,
  type MLCEngineInterface,
} from '@mlc-ai/web-llm'
import { isWebGpuAvailable, type LocalReviewProgress } from './localReviewModels'
import type { AppLanguage, Game, LogEntry } from '../types'

// A single Web Worker is spawned on first use and reused for the whole session.
// Switching models reloads weights into the same worker rather than spawning new
// ones. All create/reload/unload calls are serialized through engineQueue so two
// never run on one worker at once.
let engine: MLCEngineInterface | null = null
let loadedModelId: string | null = null
let engineQueue: Promise<unknown> = Promise.resolve()
let persistenceRequested = false

// Our prompts are tiny (capped logs + a short draft), so a small context window
// is plenty — and it shrinks the KV cache, easing memory pressure on phones.
const CHAT_OPTS = { context_window_size: 2048 }

// Ask the browser to keep our cached weights through storage pressure (esp. iOS
// Safari, which otherwise evicts best-effort caches). Best-effort, once per session.
function requestPersistentStorage(): void {
  if (persistenceRequested) {
    return
  }
  persistenceRequested = true

  try {
    void navigator.storage?.persist?.()
  } catch {
    // Best-effort only — never block a draft on this.
  }
}

function getEngine(
  modelId: string,
  onProgress?: (report: InitProgressReport) => void,
): Promise<MLCEngineInterface> {
  requestPersistentStorage()

  const run = engineQueue.then(async () => {
    // Reuse a warm engine when the model has not changed.
    if (engine && loadedModelId === modelId) {
      if (onProgress) engine.setInitProgressCallback(onProgress)
      return engine
    }

    try {
      if (!engine) {
        // First use: spawn one worker and load the model into it.
        engine = await CreateWebWorkerMLCEngine(
          new Worker(new URL('./localReviewDraftWorker.ts', import.meta.url), { type: 'module' }),
          modelId,
          { initProgressCallback: onProgress },
          CHAT_OPTS,
        )
      } else {
        // Reuse the existing worker; just swap the model (no new worker).
        if (onProgress) engine.setInitProgressCallback(onProgress)
        await engine.reload(modelId, CHAT_OPTS)
      }

      loadedModelId = modelId
      return engine
    } catch (error) {
      // Reset the marker so the next attempt reloads cleanly.
      loadedModelId = null
      throw error
    }
  })

  // Keep the queue alive regardless of this run's outcome.
  engineQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** True when the model's weights are already cached for offline use. */
export async function isLocalModelCached(modelId: string): Promise<boolean> {
  try {
    return await hasModelInCache(modelId)
  } catch {
    return false
  }
}

/**
 * Download + warm a model deliberately (e.g. from Settings on Wi-Fi). Resolves
 * once the model is cached and ready, so later drafts run offline and instantly.
 */
export async function prepareLocalModel(
  modelId: string,
  onProgress?: (progress: number, text: string) => void,
): Promise<void> {
  await getEngine(modelId, (report) => {
    onProgress?.(report.progress, report.text)
  })
  // Downloading only needs to populate the on-disk cache — don't keep the model
  // resident afterwards; the first draft loads it on demand.
  await unloadLocalEngine()
}

/** Free the cached weights for a model and drop it from memory if loaded. */
export async function removeLocalModel(modelId: string): Promise<void> {
  const task = engineQueue.then(async () => {
    if (engine && loadedModelId === modelId) {
      loadedModelId = null
      try {
        await engine.unload()
      } catch {
        // Ignore — we only need the cache cleared below.
      }
    }
  })
  engineQueue = task.then(
    () => undefined,
    () => undefined,
  )
  await task

  await deleteModelAllInfoInCache(modelId)
}

/**
 * Free the loaded model from memory but keep the worker alive for a fast reload.
 * We load-and-unload on demand (download → cache, draft → load/generate/unload)
 * so a ~1 GB model never sits resident between uses — important on memory-tight
 * phones, and the behaviour people expect from on-device models.
 */
export async function unloadLocalEngine(): Promise<void> {
  const task = engineQueue.then(async () => {
    if (engine && loadedModelId !== null) {
      loadedModelId = null
      try {
        await engine.unload()
      } catch {
        // Best-effort — nothing to do if it's already gone.
      }
    }
  })
  engineQueue = task.then(
    () => undefined,
    () => undefined,
  )
  await task
}

// Keep prompts comfortably inside the 2048-token context window above.
const MAX_LOG_CHARS = 4000
const MAX_LOG_COUNT = 50

/**
 * Trim a long play history to the most recent notes within a budget, so games
 * with hundreds of logs don't overflow the context window. Order stays
 * chronological; at least one log is always kept.
 */
function selectLogsWithinBudget(logs: LogEntry[]): LogEntry[] {
  const picked: LogEntry[] = []
  let chars = 0

  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const log = logs[i]
    const length = log.content.trim().length

    if (picked.length >= MAX_LOG_COUNT) break
    if (picked.length > 0 && chars + length > MAX_LOG_CHARS) break

    picked.push(log)
    chars += length
  }

  return picked.reverse()
}

// Deliberately short and simple. The elaborate MioServer-distilled ruleset
// overwhelms small on-device models — they flail into title/section templates,
// preambles, and repetition. A terse instruction (+ frequency_penalty) is what
// made both EN and DE produce clean, grounded drafts.
const SYSTEM_PROMPT_EN =
  'Turn the following play notes into a short review draft in flowing prose. ' +
  'Use only what is in the notes — do not make anything up. ' +
  'Write 1–2 short paragraphs, with no title, headings, or bullet points.'

const SYSTEM_PROMPT_DE =
  'Mach aus den folgenden Spielnotizen einen kurzen Review-Entwurf als Fließtext. ' +
  'Nutze nur, was in den Notizen steht – erfinde nichts dazu. ' +
  'Schreibe 1–2 kurze Absätze, ohne Titel, Überschriften oder Aufzählungen.'

// First-person pronouns in EN + DE — used to mirror the user's own voice.
const FIRST_PERSON_PATTERN =
  /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself|ich|mir|mich|mein|meine|meinem|meinen|meiner)\b/i

// True when the notes are written largely in the first person, so the draft
// should keep that voice; terse/observational notes leave it neutral.
function notesAreFirstPerson(logs: LogEntry[]): boolean {
  if (logs.length === 0) {
    return false
  }

  const firstPersonLogs = logs.filter((log) => FIRST_PERSON_PATTERN.test(log.content)).length
  return firstPersonLogs / logs.length >= 0.3
}

function buildGameDataLines(game: Game, language: AppLanguage): string {
  const lines: string[] = []

  if (language === 'de') {
    lines.push(`Spiel: ${game.title}`)
    if (game.rating != null) lines.push(`Bewertung: ${game.rating}/10`)
    if (game.playTimeHours != null) lines.push(`Spielzeit: ${game.playTimeHours} Std.`)
  } else {
    lines.push(`Game: ${game.title}`)
    if (game.rating != null) lines.push(`Rating: ${game.rating}/10`)
    if (game.playTimeHours != null) lines.push(`Play time: ${game.playTimeHours} h`)
  }

  return lines.join('\n')
}

function buildMessages(
  game: Game,
  logs: LogEntry[],
  language: AppLanguage,
): ChatCompletionMessageParam[] {
  const notes = logs.map((log) => `- ${log.content.trim()}`).join('\n')
  const data = buildGameDataLines(game, language)
  const firstPerson = notesAreFirstPerson(logs)

  if (language === 'de') {
    const system = firstPerson
      ? `${SYSTEM_PROMPT_DE} Schreibe in der Ich-Perspektive („ich“), so wie die Notizen.`
      : SYSTEM_PROMPT_DE
    return [
      { role: 'system', content: system },
      { role: 'user', content: `${data}\n\nNotizen:\n${notes}\n\nSchreibe den Review-Entwurf.` },
    ]
  }

  const system = firstPerson
    ? `${SYSTEM_PROMPT_EN} Write in the first person (“I”), the way the notes do.`
    : SYSTEM_PROMPT_EN
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${data}\n\nNotes:\n${notes}\n\nWrite the review draft.` },
  ]
}

export interface GenerateLocalReviewDraftParams {
  game: Game
  logs: LogEntry[]
  language: AppLanguage
  modelId: string
  onProgress?: (progress: LocalReviewProgress) => void
}

export async function generateLocalReviewDraft({
  game,
  logs,
  language,
  modelId,
  onProgress,
}: GenerateLocalReviewDraftParams): Promise<string> {
  if (!isWebGpuAvailable()) {
    throw new Error('WebGPU is not available in this browser.')
  }

  const usableLogs = logs.filter(
    (log) => log.deletedAt === null && log.content.trim().length > 0,
  )

  if (usableLogs.length === 0) {
    throw new Error('No play logs to draft from.')
  }

  const budgetedLogs = selectLogsWithinBudget(usableLogs)

  try {
    const engine = await getEngine(modelId, (report) => {
      onProgress?.({ phase: 'loading', text: report.text, progress: report.progress })
    })

    onProgress?.({ phase: 'generating' })

    const completion = await engine.chat.completions.create({
      messages: buildMessages(game, budgetedLogs, language),
      temperature: 0.7,
      max_tokens: 400,
      // Discourage the repetition/degeneration small models spiral into (LM Studio
      // applies a repetition penalty by default; we didn't). Belt-and-suspenders
      // with the code-fence stop.
      frequency_penalty: 0.5,
      stop: ['```'],
    })

    return (completion.choices[0]?.message?.content ?? '').trim()
  } finally {
    // Free the model after each draft (fire-and-forget so the draft shows at once).
    void unloadLocalEngine()
  }
}
