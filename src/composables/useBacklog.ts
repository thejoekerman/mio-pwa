import { computed, reactive, ref, toRaw, watch } from 'vue'
import {
  deleteGame,
  ensureDemoData,
  getAllEarnedTrophies,
  getAllGames,
  getAllJourneys,
  getAllLogs,
  getLogsForGame,
  resetDemoData,
  saveGame,
  saveJourney,
  saveLogEntry,
} from '../lib/backlogDb'
import { translate, getStatusLabel } from '../i18n'
import { useSettings } from './useSettings'
import { createTrophyHandlers } from './trophies'
import { createBackupHandlers } from './backup'
import { createAiHandlers } from './aiFeatures'
import { createSyncHandlers } from './sync'
import { isDemoMode } from '../lib/appMode'
import { fireCompletionConfetti } from '../lib/confetti'
import { getDisplayDeveloper, getDisplayPublisher, normalizeReleaseYear } from '../lib/gameMetadata'
import { createTrophyViews } from '../lib/trophies'
import { addDaysDate, getTodayDate, isAtLeastDaysOld, getNextUpdatedAt } from '../lib/dateUtils'
import { isOnline } from '../lib/network'
import {
  createLibraryCsv,
  createLibraryCsvTemplate,
  parseLibraryCsvImport,
  type LibraryCsvImportPlan,
} from '../lib/libraryCsv'
import {
  detectWebGpuSupport,
  hasLocalReviewModelForLanguage,
  isWebGpuAvailable,
} from '../lib/localReviewModels'
import { dedupeTags } from '../lib/tags'
import { getGameDisplayStatus } from '../lib/gameJourneyState'
import type {
  EarnedTrophy,
  FeedbackState,
  Game,
  GameDisplayStatus,
  GameFormState,
  GameOwnershipFilter,
  GameSortOption,
  GameStatus,
  Journey,
  LibraryCsvImportResult,
  LogEntry,
  TrophyUnlockSource,
} from '../types'

function createBacklogStore() {
  const {
    settings,
    setAiReviewDraftAvailable,
    setBackupReminderDismissedAt,
    setIgdbMetadataAvailable,
    setLastBackupExportedAt,
    setLastSyncError,
    setLastSyncedAt,
  } = useSettings()
  const ACTIVE_HOME_STATUSES: GameStatus[] = ['playing', 'ongoing']
  const games = ref<Game[]>([])
  const journeys = ref<Journey[]>([])
  const selectedGameId = ref<string | null>(null)
  const logs = ref<LogEntry[]>([])
  const allLogs = ref<LogEntry[]>([])
  const earnedTrophies = ref<EarnedTrophy[]>([])
  const trophyUnlockQueue = ref<EarnedTrophy[]>([])
  const latestTrophyUnlockSource = ref<TrophyUnlockSource | null>(null)
  const totalPlayLogCount = ref(0)
  const statusFilter = ref<'all' | GameStatus>('backlog')
  const ownershipFilter = ref<GameOwnershipFilter>('all')
  const finishedYearFilter = ref<'all' | string>('all')
  const sortOption = ref<GameSortOption>('created-desc')
  const searchQuery = ref('')
  const isLoading = ref(true)
  const isSaving = ref(false)
  const isSyncing = ref(false)
  const isTestingSyncConnection = ref(false)
  const logDraft = ref('')
  const feedback = ref<FeedbackState | null>(null)
  const reviewDraftPreview = ref('')
  const isDraftingReview = ref(false)
  const localReviewProgress = ref('')
  // Seeded optimistically from the sync check, then refined by an adapter probe
  // so browsers that expose the API but can't run it (e.g. Firefox/macOS) flip off.
  const webGpuAvailable = ref(isWebGpuAvailable())
  void detectWebGpuSupport().then((supported) => {
    webGpuAvailable.value = supported
  })
  const isBrowserOnline = ref(isOnline())
  const didInitialize = ref(false)
  const isInitializing = ref(false)
  const autoSyncStarted = ref(false)
  const capabilityRefreshStarted = ref(false)
  let feedbackId = 0
  const localChangeRevision = ref(0)

  const gameForm = reactive<GameFormState>({
    id: null,
    title: '',
    status: 'backlog',
    rating: '',
    playTimeHours: '',
    platform: '',
    ownershipType: '',
    tags: '',
    igdbId: '',
    releaseYear: '',
    priority: '',
    developer: '',
    publisher: '',
    coverUrl: '',
    review: '',
    finishedAt: '',
    pausedAt: '',
    nudgeAt: '',
  })

  const selectedGame = computed(
    () => games.value.find((game) => game.id === selectedGameId.value) ?? null,
  )
  const displayStatusByGameId = computed(
    () => new Map(
      games.value.map((game) => [
        game.id,
        getGameDisplayStatus(journeys.value.filter((journey) => journey.gameId === game.id))
          ?? game.status,
      ]),
    ),
  )
  const selectedGameDisplayStatus = computed<GameDisplayStatus | null>(() =>
    selectedGame.value
      ? displayStatusByGameId.value.get(selectedGame.value.id) ?? selectedGame.value.status
      : null,
  )
  const hasMultipleJourneys = computed(() => {
    const journeyCountByGameId = new Map<string, number>()

    for (const journey of journeys.value) {
      if (journey.deletedAt === null) {
        journeyCountByGameId.set(journey.gameId, (journeyCountByGameId.get(journey.gameId) ?? 0) + 1)
      }
    }

    return [...journeyCountByGameId.values()].some((count) => count > 1)
  })
  const canUseServerReviewDraft = computed(() =>
    Boolean(
      selectedGame.value &&
      !isDemoMode &&
      settings.aiReviewDraftAvailable &&
      settings.syncApiBaseUrl.trim() &&
      settings.syncToken.trim() &&
      logs.value.length > 0 &&
      isBrowserOnline.value,
    ),
  )
  const canUseLocalReviewDraft = computed(() =>
    Boolean(
      selectedGame.value &&
      !isDemoMode &&
      settings.aiLocalReviewDraftEnabled &&
      webGpuAvailable.value &&
      hasLocalReviewModelForLanguage(settings.language) &&
      logs.value.length > 0,
    ),
  )
  const canUseReviewDraft = computed(
    () => canUseServerReviewDraft.value || canUseLocalReviewDraft.value,
  )
  const isSyncConfigured = computed(() =>
    Boolean(settings.syncApiBaseUrl.trim() && settings.syncToken.trim()),
  )
  const canStartReplay = computed(() =>
    Boolean(selectedGame.value?.status === 'finished' && !isSyncConfigured.value),
  )

  const filteredGames = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()

    const matchingGames = games.value.filter((game) => {
      const matchesStatus =
        statusFilter.value === 'all' || game.status === statusFilter.value
      const matchesOwnership =
        ownershipFilter.value === 'all' ||
        game.ownershipType === ownershipFilter.value ||
        game.ownershipType === 'both'
      const matchesFinishedYear =
        finishedYearFilter.value === 'all'
          ? true
          : game.status === 'finished' &&
            typeof game.finishedAt === 'string' &&
            game.finishedAt.startsWith(finishedYearFilter.value)
      const matchesQuery =
        query.length === 0 ||
        game.title.toLowerCase().includes(query) ||
        game.platform.toLowerCase().includes(query) ||
        String(game.releaseYear ?? '').includes(query) ||
        (game.priority?.replace(/-/g, ' ').toLowerCase().includes(query) ?? false) ||
        getDisplayDeveloper(game).toLowerCase().includes(query) ||
        getDisplayPublisher(game).toLowerCase().includes(query) ||
        game.tags.some((tag) => tag.toLowerCase().includes(query))

      return matchesStatus && matchesOwnership && matchesFinishedYear && matchesQuery
    })

    return [...matchingGames].sort((left, right) => {
      switch (sortOption.value) {
        case 'title-asc':
          return left.title.localeCompare(right.title)
        case 'developer-asc':
          return compareMetadata(getDisplayDeveloper(left), getDisplayDeveloper(right), left, right)
        case 'publisher-asc':
          return compareMetadata(getDisplayPublisher(left), getDisplayPublisher(right), left, right)
        case 'created-desc':
          if (statusFilter.value === 'finished') {
            return compareFinishedAt(right, left)
          }

          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        case 'created-asc':
          if (statusFilter.value === 'finished') {
            return compareFinishedAt(left, right)
          }

          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        case 'rating-desc':
          return (right.rating ?? -1) - (left.rating ?? -1) || left.title.localeCompare(right.title)
        case 'rating-asc':
          return (left.rating ?? 11) - (right.rating ?? 11) || left.title.localeCompare(right.title)
        default:
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      }
    })
  })

  function compareFinishedAt(left: Game, right: Game) {
    const leftTime = left.finishedAt ? new Date(left.finishedAt).getTime() : 0
    const rightTime = right.finishedAt ? new Date(right.finishedAt).getTime() : 0

    return leftTime - rightTime || left.title.localeCompare(right.title)
  }

  function compareMetadata(leftValue: string, rightValue: string, left: Game, right: Game) {
    if (leftValue && rightValue) {
      return leftValue.localeCompare(rightValue) || left.title.localeCompare(right.title)
    }

    if (leftValue) {
      return -1
    }

    if (rightValue) {
      return 1
    }

    return left.title.localeCompare(right.title)
  }

  const stats = computed(() => {
    const total = games.value.length
    const playing = games.value.filter((game) => game.status === 'playing').length
    const ongoing = games.value.filter((game) => game.status === 'ongoing').length
    const finished = games.value.filter((game) => game.status === 'finished').length
    const playLogs = totalPlayLogCount.value
    const backlog = games.value.filter((game) => game.status === 'backlog').length

    return { total, playing, ongoing, finished, playLogs, backlog }
  })

  const currentFocus = computed(
    () =>
      games.value.find((game) => ACTIVE_HOME_STATUSES.includes(game.status)) ??
      null,
  )

  const recentLogs = computed(() => logs.value.slice(0, 5))
  const trophyViews = computed(() => createTrophyViews(earnedTrophies.value))
  const earnedTrophyViews = computed(() =>
    trophyViews.value
      .filter((trophy) => trophy.earned)
      .sort((left, right) => (right.earnedAt ?? '').localeCompare(left.earnedAt ?? '')),
  )

  const duePausedGames = computed(() => {
    const today = getTodayDate()

    return games.value
      .filter(
        (game) =>
          game.status === 'paused' &&
          game.deletedAt === null &&
          game.nudgeAt !== null &&
          game.nudgeAt <= today,
      )
      .sort((left, right) => {
        const nudgeCompare = (left.nudgeAt ?? '').localeCompare(right.nudgeAt ?? '')

        return nudgeCompare || left.title.localeCompare(right.title)
      })
  })

  const shouldShowBackupReminder = computed(() => {
    if (
      isDemoMode ||
      isSyncConfigured.value ||
      !settings.backupReminderEnabled ||
      games.value.length === 0
    ) {
      return false
    }

    return (
      isAtLeastDaysOld(settings.lastBackupExportedAt, 30) &&
      isAtLeastDaysOld(settings.backupReminderDismissedAt, 7)
    )
  })

  const finishedYearOptions = computed(() =>
    [...new Set(
      games.value
        .map((game) => (typeof game.finishedAt === 'string' ? game.finishedAt.slice(0, 4) : ''))
        .filter(Boolean),
    )].sort((left, right) => right.localeCompare(left)),
  )

  const canRateCurrentStatus = computed(
    () => gameForm.status === 'finished' || gameForm.status === 'abandoned',
  )

  function setFeedback(message: string, tone: FeedbackState['tone'] = 'success') {
    feedback.value = {
      id: ++feedbackId,
      message,
      tone,
    }
  }

  function clearFeedback() {
    feedback.value = null
  }

  function createId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function updateBrowserOnline() {
    isBrowserOnline.value = isOnline()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', updateBrowserOnline)
    window.addEventListener('offline', updateBrowserOnline)
    window.addEventListener('focus', updateBrowserOnline)
    document.addEventListener('visibilitychange', updateBrowserOnline)
  }

  function markLocalChange() {
    localChangeRevision.value += 1
  }

  function parseTags(value: string) {
    return dedupeTags(value.split(','))
  }

  /**
   * Optimization: Update a game in-place instead of reloading the entire table.
   * Used after saveGame to avoid O(n) full reload + O(n×trophies) re-evaluation.
   */
  function updateGameInPlace(updatedGame: Game) {
    const index = games.value.findIndex((game) => game.id === updatedGame.id)
    if (index !== -1) {
      games.value[index] = updatedGame
    }
  }

  /**
   * Optimization: Remove a game in-place instead of reloading the entire table.
   * Used after deleteGame to avoid O(n) full reload.
   */
  function removeGameInPlace(gameId: string) {
    const index = games.value.findIndex((game) => game.id === gameId)
    if (index !== -1) {
      games.value.splice(index, 1)
    }
  }

  function toPlainGame(game: Game): Game {
    const source = toRaw(game)

    return {
      ...source,
      tags: [...source.tags],
      igdbDevelopers: cloneStringList(source.igdbDevelopers),
      igdbPublishers: cloneStringList(source.igdbPublishers),
      igdbThemes: cloneStringList(source.igdbThemes),
      igdbGameModes: cloneStringList(source.igdbGameModes),
    }
  }

  function cloneStringList(value: string[] | null | undefined) {
    return Array.isArray(value) ? [...toRaw(value)] : null
  }

  function resetForm() {
    gameForm.id = null
    gameForm.title = ''
    gameForm.status = 'backlog'
    gameForm.rating = ''
    gameForm.playTimeHours = ''
    gameForm.platform = ''
    gameForm.ownershipType = ''
    gameForm.tags = ''
    gameForm.igdbId = ''
    gameForm.releaseYear = ''
    gameForm.priority = ''
    gameForm.developer = ''
    gameForm.publisher = ''
    gameForm.coverUrl = ''
    gameForm.review = ''
    gameForm.finishedAt = ''
    gameForm.pausedAt = ''
    gameForm.nudgeAt = ''
  }

  function resetLibraryFilters() {
    searchQuery.value = ''
    statusFilter.value = 'backlog'
    ownershipFilter.value = 'all'
    finishedYearFilter.value = 'all'
    sortOption.value = 'created-desc'
  }

  function editGame(game: Game) {
    gameForm.id = game.id
    gameForm.title = game.title
    gameForm.status = game.status
    gameForm.rating = game.rating === null ? '' : String(game.rating)
    gameForm.playTimeHours = game.playTimeHours === null ? '' : String(game.playTimeHours)
    gameForm.platform = game.platform
    gameForm.ownershipType = game.ownershipType ?? ''
    gameForm.tags = game.tags.join(', ')
    gameForm.igdbId = game.igdbId === null ? '' : String(game.igdbId)
    gameForm.releaseYear = game.releaseYear ? String(game.releaseYear) : ''
    gameForm.priority = game.priority ?? ''
    gameForm.developer = game.developer ?? ''
    gameForm.publisher = game.publisher ?? ''
    gameForm.coverUrl = game.coverUrl ?? ''
    gameForm.review = game.review
    gameForm.finishedAt = game.finishedAt ?? ''
    gameForm.pausedAt = game.pausedAt ?? ''
    gameForm.nudgeAt = game.nudgeAt ?? ''
  }

  function startEditingGame(game: Game) {
    selectedGameId.value = game.id
    editGame(game)
  }

  function startCreatingGame() {
    resetForm()
  }

  async function loadGames() {
    const [allGames, storedJourneys, storedLogs, storedTrophies] = await Promise.all([
      getAllGames(),
      getAllJourneys(),
      getAllLogs(),
      getAllEarnedTrophies(),
    ])

    games.value = allGames
    journeys.value = storedJourneys
    allLogs.value = storedLogs
    earnedTrophies.value = storedTrophies
    totalPlayLogCount.value = storedLogs.length

    if (!selectedGameId.value && games.value.length > 0) {
      selectedGameId.value = games.value[0].id
    }

    if (
      selectedGameId.value &&
      !games.value.some((game) => game.id === selectedGameId.value)
    ) {
      selectedGameId.value = games.value[0]?.id ?? null
    }
  }

  async function loadLogs(gameId: string | null) {
    if (!gameId) {
      logs.value = []
      return
    }

    logs.value = await getLogsForGame(gameId)
  }

  async function ensureLoaded(force = false) {
    if ((didInitialize.value && !force) || isInitializing.value) {
      return
    }

    isInitializing.value = true
    isLoading.value = true

    try {
      await ensureDemoData()
      await loadGames()
      await loadLogs(selectedGameId.value)
      if (!didInitialize.value) {
        await unlockEarnedTrophies('startup')
        void navigator.storage?.persist()
      }
      didInitialize.value = true
    } finally {
      isInitializing.value = false
      isLoading.value = false
    }
  }

  async function selectGame(gameId: string | null) {
    selectedGameId.value = gameId
    reviewDraftPreview.value = ''
    await loadLogs(gameId)
  }

  // Forward declaration, assigned once below to break a circular dependency with the
  // trophy handlers. Must stay `let`: a definite-assignment assertion (`!`) is only
  // valid on `let`/`var`, so prefer-const's suggestion would not compile.
  // eslint-disable-next-line prefer-const
  let unlockEarnedTrophies!: (source: TrophyUnlockSource) => Promise<EarnedTrophy[]>

  const { ensureSyncConfig, scheduleAutoSync, startAutoSync, testSyncConnection, refreshSyncCapabilities, syncNow } =
    createSyncHandlers({
      games,
      hasMultipleJourneys,
      selectedGameId,
      gameForm,
      isSyncing,
      isTestingSyncConnection,
      autoSyncStarted,
      capabilityRefreshStarted,
      localChangeRevision,
      settings,
      ensureLoaded,
      loadLogs,
      unlockEarnedTrophies: (source) => unlockEarnedTrophies(source),
      editGame,
      resetForm,
      setFeedback,
      setAiReviewDraftAvailable,
      setIgdbMetadataAvailable,
      setLastSyncedAt,
      setLastSyncError,
    })

  const trophyHandlers = createTrophyHandlers({
    games,
    allLogs,
    earnedTrophies,
    trophyUnlockQueue,
    latestTrophyUnlockSource,
    markLocalChange,
    scheduleAutoSync,
  })
  unlockEarnedTrophies = trophyHandlers.unlockEarnedTrophies
  const { dismissTrophyUnlocks } = trophyHandlers

  async function saveCurrentGame() {
    const title = gameForm.title.trim()

    if (!title) {
      setFeedback(translate(settings.language, 'feedback.giveTitleFirst'), 'error')
      return
    }

    isSaving.value = true

    try {
      const existing = games.value.find((game) => game.id === gameForm.id)
      const existingPlain = existing ? toPlainGame(existing) : null
      const now = getNextUpdatedAt(existingPlain?.updatedAt)
      const ratingInput = gameForm.rating.trim()
      const parsedRating =
        ratingInput === '' ? null : Number.parseInt(ratingInput.replace(/[^\d]/g, ''), 10)
      const normalizedRating =
        parsedRating === null || Number.isNaN(parsedRating)
          ? null
          : Math.min(Math.max(parsedRating, 1), 10)
      const playTimeInput = gameForm.playTimeHours.trim()
      const parsedPlayTime =
        playTimeInput === '' ? null : Number.parseFloat(playTimeInput.replace(',', '.'))
      const normalizedPlayTime =
        parsedPlayTime === null || Number.isNaN(parsedPlayTime) || parsedPlayTime < 0
          ? null
          : Math.round(parsedPlayTime * 10) / 10

      if (canRateCurrentStatus.value && ratingInput !== '' && normalizedRating === null) {
        setFeedback(translate(settings.language, 'feedback.ratingInvalid'), 'error')
        return
      }

      if (playTimeInput !== '' && normalizedPlayTime === null) {
        setFeedback(translate(settings.language, 'feedback.playTimeInvalid'), 'error')
        return
      }

      const igdbIdInput = gameForm.igdbId.trim()
      const parsedIgdbId =
        igdbIdInput === '' ? null : Number.parseInt(igdbIdInput.replace(/[^\d]/g, ''), 10)
      const normalizedIgdbId =
        parsedIgdbId === null || Number.isNaN(parsedIgdbId) || parsedIgdbId <= 0
          ? null
          : parsedIgdbId
      const manualDeveloper = gameForm.developer.trim()
      const manualPublisher = gameForm.publisher.trim()
      const manualCoverUrl = gameForm.coverUrl.trim()
      const canEditIgdbMetadata = isSyncConfigured.value && settings.igdbMetadataAvailable
      const nextIgdbId = canEditIgdbMetadata ? normalizedIgdbId : existingPlain?.igdbId ?? null
      const shouldPreserveIgdbMetadata = isSyncConfigured.value && existingPlain?.igdbId === nextIgdbId
      const normalizedReleaseYear = normalizeReleaseYear(gameForm.releaseYear)

      if (canRateCurrentStatus.value && normalizedRating !== null) {
        gameForm.rating = String(normalizedRating)
      }

      if (normalizedPlayTime !== null) {
        gameForm.playTimeHours = String(normalizedPlayTime)
      }

      if (canEditIgdbMetadata && normalizedIgdbId !== null) {
        gameForm.igdbId = String(normalizedIgdbId)
      }

      if (normalizedReleaseYear !== null) {
        gameForm.releaseYear = String(normalizedReleaseYear)
      }

      const game: Game = {
        id: existingPlain?.id ?? createId(),
        title,
        status: gameForm.status,
        rating: canRateCurrentStatus.value ? normalizedRating : null,
        playTimeHours: normalizedPlayTime,
        platform: gameForm.platform.trim(),
        ownershipType: gameForm.ownershipType || null,
        tags: parseTags(gameForm.tags),
        igdbId: isSyncConfigured.value ? nextIgdbId : null,
        igdbUrl: shouldPreserveIgdbMetadata ? existingPlain?.igdbUrl ?? null : null,
        igdbTtbHastilySeconds: shouldPreserveIgdbMetadata ? existingPlain?.igdbTtbHastilySeconds ?? null : null,
        igdbTtbNormallySeconds: shouldPreserveIgdbMetadata ? existingPlain?.igdbTtbNormallySeconds ?? null : null,
        igdbTtbCompletelySeconds: shouldPreserveIgdbMetadata ? existingPlain?.igdbTtbCompletelySeconds ?? null : null,
        igdbTtbCount: shouldPreserveIgdbMetadata ? existingPlain?.igdbTtbCount ?? null : null,
        igdbTtbUpdatedAt: shouldPreserveIgdbMetadata ? existingPlain?.igdbTtbUpdatedAt ?? null : null,
        igdbDevelopers: shouldPreserveIgdbMetadata ? existingPlain?.igdbDevelopers ?? null : null,
        igdbPublishers: shouldPreserveIgdbMetadata ? existingPlain?.igdbPublishers ?? null : null,
        igdbThemes: shouldPreserveIgdbMetadata ? existingPlain?.igdbThemes ?? null : null,
        igdbGameModes: shouldPreserveIgdbMetadata ? existingPlain?.igdbGameModes ?? null : null,
        releaseYear: normalizedReleaseYear ?? (shouldPreserveIgdbMetadata ? existingPlain?.releaseYear ?? null : null),
        priority: gameForm.priority || null,
        developer: manualDeveloper || null,
        publisher: manualPublisher || null,
        coverUrl: manualCoverUrl || (shouldPreserveIgdbMetadata ? existingPlain?.coverUrl ?? null : null),
        review: gameForm.review.trim(),
        finishedAt:
          gameForm.status === 'finished'
            ? gameForm.finishedAt || existingPlain?.finishedAt || getTodayDate()
            : null,
        pausedAt:
          gameForm.status === 'paused'
            ? gameForm.pausedAt || existingPlain?.pausedAt || getTodayDate()
            : null,
        nudgeAt: gameForm.status === 'paused' ? gameForm.nudgeAt || null : null,
        createdAt: existingPlain?.createdAt ?? now,
        updatedAt: now,
        deletedAt: existingPlain?.deletedAt ?? null,
      }

      await saveGame(game)
      markLocalChange()
      if (existing) {
        updateGameInPlace(game)
      } else {
        games.value.push(game)
      }
      await selectGame(game.id)
      await unlockEarnedTrophies('user-action')
      editGame(game)
      setFeedback(
        translate(settings.language, existing ? 'feedback.gameUpdated' : 'feedback.gameAdded'),
      )
      scheduleAutoSync()

      return game
    } finally {
      isSaving.value = false
    }
  }

  async function removeGame(game: Game) {
    await deleteGame(game.id)
    markLocalChange()
    removeGameInPlace(game.id)
    allLogs.value = allLogs.value.filter((log) => log.gameId !== game.id)
    totalPlayLogCount.value = allLogs.value.length
    await loadLogs(selectedGameId.value)
    await unlockEarnedTrophies('user-action')

    if (gameForm.id === game.id) {
      resetForm()
    }

    setFeedback(translate(settings.language, 'feedback.gameDeleted'))
    scheduleAutoSync()
    return true
  }

  async function saveCurrentLog() {
    const currentGame = selectedGame.value
    const content = logDraft.value.trim()

    if (!currentGame || !content) {
      return
    }

    const currentGamePlain = toPlainGame(currentGame)
    const now = getNextUpdatedAt(currentGamePlain.updatedAt)
    const logEntry: LogEntry = {
      id: createId(),
      gameId: currentGame.id,
      content,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }

    await saveLogEntry(logEntry)
    const updatedGame = {
      ...currentGamePlain,
      updatedAt: now,
    }
    await saveGame(updatedGame)
    markLocalChange()

    logDraft.value = ''
    updateGameInPlace(updatedGame)
    allLogs.value = [...allLogs.value, logEntry]
    totalPlayLogCount.value = allLogs.value.length
    await loadLogs(currentGame.id)
    await unlockEarnedTrophies('user-action')
    setFeedback(translate(settings.language, 'feedback.logSaved'))
    scheduleAutoSync()
  }

  async function updateLogEntry(logId: string, content: string) {
    const currentGame = selectedGame.value
    const trimmedContent = content.trim()
    const existingLog = logs.value.find((logEntry) => logEntry.id === logId)

    if (!currentGame || !existingLog || existingLog.gameId !== currentGame.id || !trimmedContent) {
      return false
    }

    if (existingLog.content === trimmedContent) {
      return true
    }

    const currentGamePlain = toPlainGame(currentGame)
    const latestExistingUpdate = Math.max(
      new Date(currentGamePlain.updatedAt).getTime(),
      new Date(existingLog.updatedAt).getTime(),
    )
    const now = getNextUpdatedAt(
      Number.isFinite(latestExistingUpdate)
        ? new Date(latestExistingUpdate).toISOString()
        : currentGamePlain.updatedAt,
    )
    const updatedLogEntry: LogEntry = {
      ...toRaw(existingLog),
      content: trimmedContent,
      updatedAt: now,
      deletedAt: existingLog.deletedAt ?? null,
    }

    await saveLogEntry(updatedLogEntry)
    const updatedGame = {
      ...currentGamePlain,
      updatedAt: now,
    }
    await saveGame(updatedGame)
    markLocalChange()

    updateGameInPlace(updatedGame)
    await loadLogs(currentGame.id)
    await unlockEarnedTrophies('user-action')
    setFeedback(translate(settings.language, 'feedback.logUpdated'))
    scheduleAutoSync()

    return true
  }

  async function updateGameStatus(game: Game, status: GameStatus) {
    if (game.status === status) {
      setFeedback(
        translate(settings.language, 'feedback.alreadyStatus', {
          status: getStatusLabel(settings.language, status),
          title: game.title,
        }),
        'info',
      )
      return
    }

    try {
      const gamePlain = toPlainGame(game)
      const updatedGame: Game = {
        ...gamePlain,
        status,
        rating:
          status === 'finished' || status === 'abandoned' ? game.rating : null,
        playTimeHours: game.playTimeHours,
        finishedAt: status === 'finished' ? game.finishedAt ?? getTodayDate() : null,
        pausedAt: status === 'paused' ? (game.status === 'paused' ? game.pausedAt : null) ?? getTodayDate() : null,
        nudgeAt: status === 'paused' ? (game.status === 'paused' ? game.nudgeAt : null) ?? addDaysDate(14) : null,
        updatedAt: getNextUpdatedAt(gamePlain.updatedAt),
      }

      await saveGame(updatedGame)
      markLocalChange()
      updateGameInPlace(updatedGame)
      await selectGame(updatedGame.id)
      await unlockEarnedTrophies('user-action')

      if (status === 'finished' && game.status !== 'finished') {
        void fireCompletionConfetti()
      }

      if (gameForm.id === updatedGame.id) {
        editGame(updatedGame)
      }

      setFeedback(
        translate(settings.language, 'feedback.movedToStatus', {
          status: getStatusLabel(settings.language, status),
          title: updatedGame.title,
        }),
      )
      scheduleAutoSync()
    } catch {
      setFeedback(
        translate(settings.language, 'feedback.switchFailed', {
          status: getStatusLabel(settings.language, status),
          title: game.title,
        }),
        'error',
      )
    }
  }

  async function addPlayTime(game: Game, hoursToAdd: number) {
    try {
      const gamePlain = toPlainGame(game)
      const currentTotal = game.playTimeHours ?? 0
      const newTotal = Math.round((currentTotal + hoursToAdd) * 10) / 10
      const updatedGame: Game = {
        ...gamePlain,
        playTimeHours: newTotal,
        updatedAt: getNextUpdatedAt(gamePlain.updatedAt),
      }

      await saveGame(updatedGame)
      markLocalChange()
      updateGameInPlace(updatedGame)
      await selectGame(updatedGame.id)
      await unlockEarnedTrophies('user-action')

      if (gameForm.id === updatedGame.id) {
        gameForm.playTimeHours = String(newTotal)
      }

      setFeedback(
        translate(settings.language, 'feedback.timeAdded', {
          hours: hoursToAdd,
          title: updatedGame.title,
        }),
      )
      scheduleAutoSync()
    } catch {
      setFeedback(translate(settings.language, 'feedback.timeAddFailed'), 'error')
    }
  }

  async function startReplay(game: Game) {
    if (isSyncConfigured.value) {
      setFeedback(translate(settings.language, 'feedback.replaySyncBlocked'), 'error')
      return false
    }

    if (game.status !== 'finished') {
      return false
    }

    try {
      const now = getNextUpdatedAt(game.updatedAt)
      const journey: Journey = {
        id: createId(),
        gameId: game.id,
        status: 'playing',
        platform: game.platform,
        ownershipType: game.ownershipType,
        priority: null,
        rating: null,
        review: '',
        playTimeHours: null,
        startedAt: getTodayDate(),
        finishedAt: null,
        pausedAt: null,
        nudgeAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await saveJourney(journey)
      markLocalChange()
      await loadGames()
      await selectGame(game.id)
      await unlockEarnedTrophies('user-action')
      setFeedback(translate(settings.language, 'feedback.replayStarted', { title: game.title }))
      return true
    } catch {
      setFeedback(
        translate(settings.language, 'feedback.replayStartFailed', { title: game.title }),
        'error',
      )
      return false
    }
  }

  async function exportLibraryCsv() {
    await ensureLoaded()

    return {
      csv: createLibraryCsv(games.value.map(toPlainGame)),
      exportedAt: new Date().toISOString(),
    }
  }

  function exportLibraryCsvTemplate() {
    return createLibraryCsvTemplate()
  }

  async function previewLibraryCsvImport(rawCsv: string) {
    await ensureLoaded()

    return parseLibraryCsvImport(rawCsv, games.value.map(toPlainGame), {
      createId,
      now: new Date().toISOString(),
    })
  }

  async function importLibraryCsv(plan: LibraryCsvImportPlan): Promise<LibraryCsvImportResult> {
    if (plan.gamesToSave.length === 0) {
      return {
        created: 0,
        updated: 0,
        skipped: plan.skippedCount,
      }
    }

    for (const game of plan.gamesToSave) {
      await saveGame(toPlainGame(game))
    }

    markLocalChange()
    await ensureLoaded(true)
    await unlockEarnedTrophies('import')
    await loadLogs(selectedGameId.value)
    scheduleAutoSync()

    return {
      created: plan.createCount,
      updated: plan.updateCount,
      skipped: plan.skippedCount,
    }
  }

  async function snoozePausedGame(game: Game, days: number) {
    if (game.status !== 'paused') {
      return
    }

    try {
      const gamePlain = toPlainGame(game)
      const updatedGame: Game = {
        ...gamePlain,
        nudgeAt: addDaysDate(days),
        updatedAt: getNextUpdatedAt(gamePlain.updatedAt),
      }

      await saveGame(updatedGame)
      markLocalChange()
      updateGameInPlace(updatedGame)
      await selectGame(updatedGame.id)
      await unlockEarnedTrophies('user-action')

      if (gameForm.id === updatedGame.id) {
        editGame(updatedGame)
      }

      setFeedback(
        translate(settings.language, 'feedback.pausedNudgeSnoozed', {
          title: updatedGame.title,
        }),
      )
      scheduleAutoSync()
    } catch {
      setFeedback(translate(settings.language, 'feedback.pausedNudgeFailed'), 'error')
    }
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(settings.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  }

  const { exportBackup, dismissBackupReminder, importBackup } = createBackupHandlers({
    selectedGameId,
    settings,
    setFeedback,
    setLastBackupExportedAt,
    setBackupReminderDismissedAt,
    ensureLoaded,
    loadLogs,
    unlockEarnedTrophies,
  })

  const { generateReviewDraft, applyReviewDraft, discardReviewDraft } =
    createAiHandlers({
      selectedGame,
      gameForm,
      settings,
      serverReviewDraftReady: canUseServerReviewDraft,
      isDraftingReview,
      reviewDraftPreview,
      localReviewProgress,
      setFeedback,
      ensureSyncConfig,
      toPlainGame,
      updateGameInPlace,
      selectGame,
      editGame,
      markLocalChange,
      scheduleAutoSync,
    })

  async function resetDemoLibrary() {
    if (!isDemoMode) {
      return
    }

    await resetDemoData()
    markLocalChange()
    selectedGameId.value = null
    logDraft.value = ''
    reviewDraftPreview.value = ''
    await ensureLoaded(true)
    setFeedback(translate(settings.language, 'feedback.demoReset'), 'success')
  }

  watch(
    () => gameForm.status,
    (status) => {
      if (status !== 'finished' && status !== 'abandoned') {
        gameForm.rating = ''
      }

      if (status === 'finished' && !gameForm.finishedAt) {
        gameForm.finishedAt = getTodayDate()
      }

      if (status !== 'finished') {
        gameForm.finishedAt = ''
      }

      if (status === 'paused') {
        if (!gameForm.pausedAt) {
          gameForm.pausedAt = getTodayDate()
        }

        if (!gameForm.nudgeAt) {
          gameForm.nudgeAt = addDaysDate(14)
        }
      } else {
        gameForm.pausedAt = ''
        gameForm.nudgeAt = ''
      }
    },
  )

  return {
    canRateCurrentStatus,
    canStartReplay,
    canUseReviewDraft,
    canUseLocalReviewDraft,
    currentFocus,
    discardReviewDraft,
    clearFeedback,
    dismissTrophyUnlocks,
    dismissBackupReminder,
    duePausedGames,
    displayStatusByGameId,
    editGame,
    earnedTrophies,
    earnedTrophyViews,
    ensureLoaded,
    exportBackup,
    feedback,
    filteredGames,
    finishedYearFilter,
    finishedYearOptions,
    formatDate,
    gameForm,
    generateReviewDraft,
    games,
    exportLibraryCsv,
    exportLibraryCsvTemplate,
    isDraftingReview,
    isLoading,
    isSaving,
    importBackup,
    importLibraryCsv,
    isSyncConfigured,
    isSyncing,
    isTestingSyncConnection,
    journeys,
    localReviewProgress,
    logDraft,
    logs,
    ownershipFilter,
    recentLogs,
    reviewDraftPreview,
    removeGame,
    resetForm,
    resetDemoLibrary,
    resetLibraryFilters,
    refreshSyncCapabilities,
    saveCurrentGame,
    saveCurrentLog,
    updateLogEntry,
    searchQuery,
    selectGame,
    selectedGame,
    selectedGameDisplayStatus,
    selectedGameId,
    setFeedback,
    previewLibraryCsvImport,
    sortOption,
    startAutoSync,
    startCreatingGame,
    startEditingGame,
    startReplay,
    stats,
    statusFilter,
    shouldShowBackupReminder,
    syncNow,
    testSyncConnection,
    trophyUnlockQueue,
    latestTrophyUnlockSource,
    trophyViews,
    addPlayTime,
    updateGameStatus,
    snoozePausedGame,
    applyReviewDraft,
  }
}

const backlogStore = createBacklogStore()

export function useBacklog() {
  void backlogStore.ensureLoaded()
  backlogStore.startAutoSync()
  void backlogStore.refreshSyncCapabilities()
  return backlogStore
}
