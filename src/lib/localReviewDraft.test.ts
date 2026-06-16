import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Game, LogEntry } from '../types'

const webLlm = vi.hoisted(() => ({
  createEngine: vi.fn(),
  deleteModel: vi.fn(),
  hasModel: vi.fn(),
}))

vi.mock('@mlc-ai/web-llm', () => ({
  CreateWebWorkerMLCEngine: webLlm.createEngine,
  deleteModelAllInfoInCache: webLlm.deleteModel,
  hasModelInCache: webLlm.hasModel,
}))

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game',
    title: 'Mio Adventure',
    status: 'finished',
    rating: 9,
    playTimeHours: 24,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function log(content: string, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: content,
    gameId: 'game',
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function engine(draft = ' Draft text ') {
  return {
    setInitProgressCallback: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    unload: vi.fn().mockResolvedValue(undefined),
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: draft } }],
        }),
      },
    },
  }
}

function setWebGpu(available: boolean) {
  if (available) {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {},
    })
    return
  }

  delete (navigator as { gpu?: unknown }).gpu
}

describe('localReviewDraft', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('Worker', vi.fn())
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: vi.fn() },
    })
    setWebGpu(true)
  })

  it('checks cache state defensively', async () => {
    webLlm.hasModel.mockResolvedValueOnce(true)
    webLlm.hasModel.mockRejectedValueOnce(new Error('cache unavailable'))
    const { isLocalModelCached } = await import('./localReviewDraft')

    await expect(isLocalModelCached('model-a')).resolves.toBe(true)
    await expect(isLocalModelCached('model-b')).resolves.toBe(false)
  })

  it('prepares a model, reports progress, and unloads it afterwards', async () => {
    const preparedEngine = engine()
    webLlm.createEngine.mockImplementation(async (_worker, _model, options) => {
      options.initProgressCallback({ progress: 0.42, text: 'fetching shards' })
      return preparedEngine
    })
    const { prepareLocalModel } = await import('./localReviewDraft')
    const progress = vi.fn()

    await prepareLocalModel('model-a', progress)

    expect(progress).toHaveBeenCalledWith(0.42, 'fetching shards')
    expect(preparedEngine.unload).toHaveBeenCalledOnce()
  })

  it('generates a trimmed English draft from usable play logs', async () => {
    const reviewEngine = engine(' I loved the ending. ')
    webLlm.createEngine.mockResolvedValue(reviewEngine)
    const { generateLocalReviewDraft } = await import('./localReviewDraft')

    const draft = await generateLocalReviewDraft({
      game: game(),
      logs: [
        log(''),
        log('I loved the opening.'),
        log('Deleted note', { deletedAt: '2026-01-02T00:00:00.000Z' }),
      ],
      language: 'en',
      modelId: 'model-a',
    })

    expect(draft).toBe('I loved the ending.')
    expect(reviewEngine.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Write in the first person'),
        }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('I loved the opening.'),
        }),
      ]),
      frequency_penalty: 0.5,
      stop: ['```'],
    }))
  })

  it('reloads a warm worker for another model and can delete cached weights', async () => {
    const reviewEngine = engine()
    webLlm.createEngine.mockResolvedValue(reviewEngine)
    const { generateLocalReviewDraft, removeLocalModel } = await import('./localReviewDraft')

    await generateLocalReviewDraft({
      game: game(),
      logs: [log('Mir gefällt das Kampfsystem.')],
      language: 'de',
      modelId: 'model-a',
    })
    await generateLocalReviewDraft({
      game: game(),
      logs: [log('Mir gefällt das Ende.')],
      language: 'de',
      modelId: 'model-b',
    })
    await removeLocalModel('model-b')

    expect(webLlm.createEngine).toHaveBeenCalledOnce()
    expect(reviewEngine.reload).toHaveBeenCalledWith('model-b', { context_window_size: 2048 })
    expect(webLlm.deleteModel).toHaveBeenCalledWith('model-b')
  })

  it('rejects when WebGPU or usable notes are unavailable', async () => {
    const { generateLocalReviewDraft } = await import('./localReviewDraft')

    setWebGpu(false)
    await expect(generateLocalReviewDraft({
      game: game(),
      logs: [log('Nice')],
      language: 'en',
      modelId: 'model-a',
    })).rejects.toThrow('WebGPU is not available')

    setWebGpu(true)
    await expect(generateLocalReviewDraft({
      game: game(),
      logs: [log('  '), log('deleted', { deletedAt: '2026-01-02T00:00:00.000Z' })],
      language: 'en',
      modelId: 'model-a',
    })).rejects.toThrow('No play logs')
  })
})
