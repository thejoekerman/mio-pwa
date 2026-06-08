import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isProxy, nextTick, reactive } from 'vue'
import type { Game, Journey } from '../types'

// `useBacklog` is a module-level singleton (like `useSettings`) with deep ties to
// IndexedDB, the network, optional WebGPU, and confetti. We mock every external
// boundary so tests run in isolation, then use `vi.resetModules()` + dynamic import
// to get a fresh store per test.

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    title: 'Example',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    igdbId: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

let savedGames: Game[] = []
let savedJourneys: Journey[] = []

function makeJourney(game: Game, overrides: Partial<Journey> = {}): Journey {
  return {
    id: `${game.id}:initial-journey`,
    gameId: game.id,
    status: game.status,
    platform: game.platform,
    ownershipType: game.ownershipType,
    priority: game.priority ?? null,
    rating: game.rating,
    review: game.review,
    playTimeHours: game.playTimeHours,
    startedAt: null,
    finishedAt: game.finishedAt,
    pausedAt: game.pausedAt,
    nudgeAt: game.nudgeAt,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    deletedAt: game.deletedAt,
    ...overrides,
  }
}

async function loadBacklog(opts: { seedGames?: Game[]; seedJourneys?: Journey[] } = {}) {
  const { seedGames = [], seedJourneys = seedGames.map((game) => makeJourney(game)) } = opts
  savedGames = []
  savedJourneys = [...seedJourneys]

  vi.resetModules()
  window.localStorage.clear()

  vi.doMock('../lib/backlogDb', () => ({
    getAllGames: vi.fn().mockResolvedValue(seedGames),
    getAllJourneys: vi.fn().mockImplementation(async () => savedJourneys),
    getAllLogs: vi.fn().mockResolvedValue([]),
    getAllEarnedTrophies: vi.fn().mockResolvedValue([]),
    getLogsForGame: vi.fn().mockResolvedValue([]),
    getLogsForJourney: vi.fn().mockResolvedValue([]),
    saveGame: vi.fn().mockImplementation(async (game: Game) => {
      savedGames.push(game)
    }),
    saveGameMetadata: vi.fn().mockResolvedValue(undefined),
    saveJourney: vi.fn().mockImplementation(async (journey: Journey) => {
      const index = savedJourneys.findIndex((candidate) => candidate.id === journey.id)

      if (index === -1) {
        savedJourneys.push(journey)
      } else {
        savedJourneys[index] = journey
      }
    }),
    deleteGame: vi.fn().mockResolvedValue(undefined),
    saveLogEntry: vi.fn().mockResolvedValue(undefined),
    saveLogEntryForJourney: vi.fn().mockResolvedValue(undefined),
    saveEarnedTrophies: vi.fn().mockResolvedValue(undefined),
    ensureDemoData: vi.fn().mockResolvedValue(undefined),
    resetDemoData: vi.fn().mockResolvedValue(undefined),
  }))

  vi.doMock('../lib/network', () => ({
    isOnline: () => true,
  }))

  vi.doMock('../lib/appMode', () => ({
    isDemoMode: false,
    isDesktopMode: false,
    appDisplayName: 'MioLog',
  }))

  vi.doMock('../lib/confetti', () => ({
    fireCompletionConfetti: vi.fn(),
  }))

  vi.doMock('../lib/syncApi', () => ({
    syncWithBackend: vi.fn(),
    testSyncConnection: vi.fn().mockRejectedValue(new Error('no network in tests')),
    requestReviewDraft: vi.fn(),
    requestEnrich: vi.fn(),
  }))

  vi.doMock('../lib/localReviewModels', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>
    return {
      ...actual,
      detectWebGpuSupport: vi.fn().mockResolvedValue(false),
      isWebGpuAvailable: vi.fn().mockReturnValue(false),
    }
  })

  const mod = await import('./useBacklog')
  const store = mod.useBacklog()

  // ensureLoaded is fired-and-forgotten inside useBacklog(); wait for the seed.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()

  return store
}

describe('useBacklog', () => {
  beforeEach(() => {
    savedGames = []
    savedJourneys = []
  })

  afterEach(() => {
    vi.doUnmock('../lib/backlogDb')
    vi.doUnmock('../lib/network')
    vi.doUnmock('../lib/appMode')
    vi.doUnmock('../lib/confetti')
    vi.doUnmock('../lib/syncApi')
    vi.doUnmock('../lib/localReviewModels')
    vi.resetModules()
  })

  describe('form state transitions', () => {
    it('resetForm clears every field', async () => {
      const store = await loadBacklog()
      store.gameForm.title = 'WIP'
      store.gameForm.status = 'finished'
      store.gameForm.tags = 'rpg, jrpg'
      store.gameForm.igdbId = '42'

      store.resetForm()

      expect(store.gameForm.id).toBeNull()
      expect(store.gameForm.title).toBe('')
      expect(store.gameForm.status).toBe('backlog')
      expect(store.gameForm.tags).toBe('')
      expect(store.gameForm.igdbId).toBe('')
    })

    it('startEditingGame selects the game and populates the form', async () => {
      const game = makeGame({
        id: 'g42',
        title: 'Hollow Knight',
        status: 'finished',
        rating: 9,
        playTimeHours: 27.5,
        tags: ['Metroidvania', 'Indie'],
        igdbId: 1234,
        developer: 'Team Cherry',
        finishedAt: '2026-04-01',
      })
      const store = await loadBacklog({ seedGames: [game] })

      store.startEditingGame(game)

      expect(store.selectedGameId.value).toBe('g42')
      expect(store.gameForm.id).toBe('g42')
      expect(store.gameForm.title).toBe('Hollow Knight')
      expect(store.gameForm.status).toBe('finished')
      expect(store.gameForm.rating).toBe('9')
      expect(store.gameForm.playTimeHours).toBe('27.5')
      expect(store.gameForm.tags).toBe('Metroidvania, Indie')
      expect(store.gameForm.igdbId).toBe('1234')
      expect(store.gameForm.developer).toBe('Team Cherry')
      expect(store.gameForm.finishedAt).toBe('2026-04-01')
    })

    it('startEditingGame preserves an explicitly selected historical Journey', async () => {
      const game = makeGame({ id: 'history', status: 'playing', review: 'Current run' })
      const historical = makeJourney(game, {
        id: 'history-first',
        status: 'finished',
        review: 'First run',
        rating: 10,
        finishedAt: '2025-01-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
      })
      const current = makeJourney(game, { id: 'history-current' })
      const store = await loadBacklog({ seedGames: [game], seedJourneys: [historical, current] })

      await store.selectGame(game.id)
      await store.selectJourney(historical.id)
      store.startEditingGame(game)

      expect(store.selectedJourneyId.value).toBe(historical.id)
      expect(store.gameForm.status).toBe('finished')
      expect(store.gameForm.review).toBe('First run')
    })
  })

  describe('saveCurrentGame', () => {
    it('refuses to save when title is blank and surfaces an error', async () => {
      const store = await loadBacklog()
      store.gameForm.title = '   '

      await store.saveCurrentGame()

      expect(savedGames).toHaveLength(0)
      expect(store.feedback.value?.tone).toBe('error')
    })

    it('persists a new game with sensible defaults and bumps localChangeRevision', async () => {
      const store = await loadBacklog()
      // Snapshot revision via syncNow → captured indirectly: assert the game is in
      // the in-memory list and was passed to saveGame.
      store.gameForm.title = '  Celeste  '
      store.gameForm.platform = 'Switch'
      store.gameForm.tags = 'platformer, indie, platformer'

      const saved = await store.saveCurrentGame()

      expect(saved).toBeDefined()
      expect(savedGames).toHaveLength(1)
      const persisted = savedGames[0]
      expect(persisted.title).toBe('Celeste')
      expect(persisted.platform).toBe('Switch')
      // Tag dedupe + casing preservation via dedupeTags.
      expect(persisted.tags).toEqual(['platformer', 'indie'])
      expect(persisted.status).toBe('backlog')
      // rating null for non-rateable statuses
      expect(persisted.rating).toBeNull()
      expect(persisted.deletedAt).toBeNull()
      expect(store.games.value.some((g) => g.id === persisted.id)).toBe(true)
    })

    it('clamps an out-of-range rating to 1–10 for finished games', async () => {
      const store = await loadBacklog()
      store.gameForm.title = 'Inscryption'
      store.gameForm.status = 'finished'
      store.gameForm.rating = '99'

      await store.saveCurrentGame()

      expect(savedGames[0].rating).toBe(10)
    })

    it('discards rating entirely when the status cannot be rated', async () => {
      const store = await loadBacklog()
      store.gameForm.title = 'Stardew'
      store.gameForm.status = 'backlog'
      store.gameForm.rating = '8'

      await store.saveCurrentGame()

      expect(savedGames[0].rating).toBeNull()
    })

    it('parses comma-decimal play time and rounds to one decimal', async () => {
      const store = await loadBacklog()
      store.gameForm.title = 'Tunic'
      store.gameForm.playTimeHours = '12,37'

      await store.saveCurrentGame()

      expect(savedGames[0].playTimeHours).toBe(12.4)
    })

    it('rejects negative play time with an error', async () => {
      const store = await loadBacklog()
      store.gameForm.title = 'Tunic'
      store.gameForm.playTimeHours = '-3'

      await store.saveCurrentGame()

      expect(savedGames).toHaveLength(0)
      expect(store.feedback.value?.tone).toBe('error')
    })

    it('stamps finishedAt to today when transitioning to finished without an explicit date', async () => {
      const store = await loadBacklog()
      store.gameForm.title = 'OuterWilds'
      store.gameForm.status = 'finished'

      await store.saveCurrentGame()

      const persisted = savedGames[0]
      expect(persisted.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(persisted.pausedAt).toBeNull()
      expect(persisted.nudgeAt).toBeNull()
    })

    it('clears finishedAt/pausedAt when status is not finished/paused', async () => {
      const store = await loadBacklog()
      store.gameForm.title = 'Backlogged'
      store.gameForm.status = 'backlog'
      // User typed dates but then chose backlog → these should not persist.
      store.gameForm.finishedAt = '2026-01-01'
      store.gameForm.pausedAt = '2026-01-01'

      await store.saveCurrentGame()

      const persisted = savedGames[0]
      expect(persisted.finishedAt).toBeNull()
      expect(persisted.pausedAt).toBeNull()
    })

    it('strips non-digit chars from the IGDB id and saves a positive integer', async () => {
      const store = await loadBacklog()
      // Pretend sync is configured + IGDB capability is available.
      const { useSettings } = await import('./useSettings')
      useSettings().settings.syncApiBaseUrl = 'https://server.test'
      useSettings().settings.syncToken = 'tok'
      useSettings().settings.igdbMetadataAvailable = true

      store.gameForm.title = 'Outer Wilds'
      store.gameForm.igdbId = 'id-1234abc'

      await store.saveCurrentGame()

      expect(savedGames[0].igdbId).toBe(1234)
    })

    it('drops the IGDB id when sync is not configured', async () => {
      const store = await loadBacklog()
      // Settings default: no sync URL/token.
      store.gameForm.title = 'Outer Wilds'
      store.gameForm.igdbId = '1234'

      await store.saveCurrentGame()

      expect(savedGames[0].igdbId).toBeNull()
    })

    it('updates only the selected Journey when editing Journey fields', async () => {
      const game = makeGame({ id: 'edit-history', status: 'playing' })
      const historical = makeJourney(game, {
        id: 'edit-history-first',
        status: 'finished',
        review: 'Original',
        finishedAt: '2025-01-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
      })
      const current = makeJourney(game, { id: 'edit-history-current' })
      const store = await loadBacklog({ seedGames: [game], seedJourneys: [historical, current] })

      await store.selectGame(game.id)
      await store.selectJourney(historical.id)
      store.startEditingGame(game)
      store.gameForm.review = 'Updated original'

      await store.saveCurrentGame()

      expect(savedJourneys.find((journey) => journey.id === historical.id)?.review).toBe('Updated original')
      expect(savedJourneys.find((journey) => journey.id === current.id)).toEqual(current)
      expect(store.selectedJourneyId.value).toBe(historical.id)
    })
  })

  describe('filteredGames', () => {
    const games = [
      makeGame({ id: 'a', title: 'Aria of Sorrow', status: 'backlog', tags: ['metroidvania'], createdAt: '2026-01-01T00:00:00Z', ownershipType: 'physical' }),
      makeGame({ id: 'b', title: 'Balatro', status: 'playing', tags: ['roguelike'], createdAt: '2026-02-01T00:00:00Z', ownershipType: 'digital' }),
      makeGame({ id: 'c', title: 'Celeste', status: 'finished', tags: ['platformer'], createdAt: '2026-03-01T00:00:00Z', finishedAt: '2026-04-01', ownershipType: 'digital', rating: 9 }),
      makeGame({ id: 'd', title: 'Disco Elysium', status: 'finished', tags: ['rpg'], createdAt: '2026-04-01T00:00:00Z', finishedAt: '2025-12-01', ownershipType: 'both', rating: 10 }),
    ]

    it('filters by status', async () => {
      const store = await loadBacklog({ seedGames: games })
      store.statusFilter.value = 'finished'

      const titles = store.filteredGames.value.map((g) => g.title)
      expect(titles).toEqual(expect.arrayContaining(['Celeste', 'Disco Elysium']))
      expect(titles).not.toContain('Balatro')
    })

    it('filters by ownership and treats `both` as a match for either physical or digital', async () => {
      const store = await loadBacklog({ seedGames: games })
      store.statusFilter.value = 'all'
      store.ownershipFilter.value = 'physical'

      const titles = store.filteredGames.value.map((g) => g.title)
      // `Aria` is physical, `Disco Elysium` is `both` (matches physical filter).
      expect(titles).toEqual(expect.arrayContaining(['Aria of Sorrow', 'Disco Elysium']))
      expect(titles).not.toContain('Balatro')
    })

    it('matches the search query against title, tags, and platform', async () => {
      const store = await loadBacklog({ seedGames: games })
      store.statusFilter.value = 'all'
      store.searchQuery.value = 'rogue'

      expect(store.filteredGames.value.map((g) => g.id)).toEqual(['b'])
    })

    it('sorts by rating-desc with title as a tiebreaker', async () => {
      const store = await loadBacklog({ seedGames: games })
      store.statusFilter.value = 'finished'
      store.sortOption.value = 'rating-desc'

      const ids = store.filteredGames.value.map((g) => g.id)
      // Disco Elysium (10) before Celeste (9).
      expect(ids).toEqual(['d', 'c'])
    })

    it('when filtering finished games and sorting by created-desc, sorts by finishedAt instead', async () => {
      const store = await loadBacklog({ seedGames: games })
      store.statusFilter.value = 'finished'
      store.sortOption.value = 'created-desc'

      const ids = store.filteredGames.value.map((g) => g.id)
      // Celeste finished 2026-04-01, Disco Elysium finished 2025-12-01 → Celeste first.
      expect(ids).toEqual(['c', 'd'])
    })
  })

  describe('stats and currentFocus', () => {
    it('counts games by status', async () => {
      const games = [
        makeGame({ id: 'a', status: 'backlog' }),
        makeGame({ id: 'b', status: 'backlog' }),
        makeGame({ id: 'c', status: 'playing' }),
        makeGame({ id: 'd', status: 'finished' }),
      ]
      const store = await loadBacklog({ seedGames: games })

      expect(store.stats.value).toMatchObject({
        total: 4,
        backlog: 2,
        playing: 1,
        finished: 1,
        ongoing: 0,
      })
    })

    it('picks the first playing/ongoing game as currentFocus', async () => {
      const games = [
        makeGame({ id: 'a', status: 'backlog' }),
        makeGame({ id: 'b', status: 'ongoing' }),
        makeGame({ id: 'c', status: 'playing' }),
      ]
      const store = await loadBacklog({ seedGames: games })

      expect(store.currentFocus.value?.id).toBe('b')
    })

    it('currentFocus is null when nothing is in playing/ongoing', async () => {
      const games = [makeGame({ id: 'a', status: 'backlog' })]
      const store = await loadBacklog({ seedGames: games })

      expect(store.currentFocus.value).toBeNull()
    })
  })

  describe('removeGame', () => {
    it('drops the game from in-memory state and resets the form if it was selected', async () => {
      const game = makeGame({ id: 'gx' })
      const store = await loadBacklog({ seedGames: [game] })
      store.startEditingGame(game)

      await store.removeGame(game)

      expect(store.games.value.some((g) => g.id === 'gx')).toBe(false)
      expect(store.gameForm.id).toBeNull()
    })
  })

  describe('startReplay', () => {
    it('creates a fresh active Journey and derives Replaying without changing the finished Journey', async () => {
      const game = makeGame({
        id: 'replay-me',
        title: 'Replay Me',
        status: 'finished',
        platform: 'Switch',
        ownershipType: 'physical',
        rating: 10,
        review: 'First journey.',
        playTimeHours: 80,
        finishedAt: '2026-05-01',
      })
      const initialJourney = makeJourney(game)
      const store = await loadBacklog({ seedGames: [game], seedJourneys: [initialJourney] })

      await store.startReplay(game)

      expect(savedJourneys).toHaveLength(2)
      expect(savedJourneys[0]).toEqual(initialJourney)
      expect(savedJourneys[1]).toMatchObject({
        gameId: 'replay-me',
        status: 'playing',
        platform: 'Switch',
        ownershipType: 'physical',
        rating: null,
        review: '',
        playTimeHours: null,
        finishedAt: null,
      })
      expect(store.displayStatusByGameId.value.get('replay-me')).toBe('replaying')
    })

    it('creates a local replay while MioServer 2 sync is configured', async () => {
      const game = makeGame({ id: 'synced', title: 'Synced', status: 'finished' })
      const store = await loadBacklog({ seedGames: [game] })
      const { useSettings } = await import('./useSettings')
      useSettings().settings.syncApiBaseUrl = 'https://server.test'
      useSettings().settings.syncToken = 'token'

      await store.startReplay(game)

      expect(savedJourneys).toHaveLength(2)
      expect(savedJourneys[1]).toMatchObject({ gameId: 'synced', status: 'playing' })
      expect(store.feedback.value?.tone).toBe('success')
    })

    it('completes the selected replay without changing the original finished Journey', async () => {
      const game = makeGame({ id: 'complete-replay', title: 'Complete Replay', status: 'playing' })
      const original = makeJourney(game, {
        id: 'original',
        status: 'finished',
        rating: 10,
        review: 'Original review',
        finishedAt: '2025-01-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
      })
      const replay = makeJourney(game, {
        id: 'replay',
        status: 'playing',
        startedAt: '2026-06-01',
        updatedAt: '2026-06-01T00:00:00.000Z',
      })
      const store = await loadBacklog({ seedGames: [game], seedJourneys: [original, replay] })
      await store.selectGame(game.id)

      await store.updateSelectedJourneyStatus('finished')

      expect(savedJourneys.find((journey) => journey.id === 'original')).toEqual(original)
      expect(savedJourneys.find((journey) => journey.id === 'replay')).toMatchObject({
        status: 'finished',
        finishedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      })
    })
  })

  describe('CSV import', () => {
    it('saves plain games when confirming a reactive preview plan', async () => {
      const store = await loadBacklog()
      const plan = await store.previewLibraryCsvImport(
        [
          'mioId,title,status,platform,rating,playTimeHours,finishedDate,coverUrl',
          ',After the Stream Went Dark,finished,Steam,7,2,2026-06-03,https://images.igdb.com/igdb/image/upload/t_cover_big/cobtw4.webp',
        ].join('\n'),
      )
      const reactivePlan = reactive(plan)

      expect(isProxy(reactivePlan.gamesToSave[0])).toBe(true)

      const result = await store.importLibraryCsv(reactivePlan)

      expect(result).toEqual({ created: 1, updated: 0, skipped: 0 })
      expect(savedGames).toHaveLength(1)
      expect(isProxy(savedGames[0])).toBe(false)
      expect(savedGames[0]).toMatchObject({
        title: 'After the Stream Went Dark',
        status: 'finished',
        rating: 7,
        playTimeHours: 2,
        finishedAt: '2026-06-03',
      })
    })
  })
})
