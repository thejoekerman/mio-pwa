import { computed, reactive, ref, toRaw, watch } from 'vue'
import {
  createBackupData,
  createSyncSnapshot,
  deleteGame,
  ensureDemoData,
  getAllEarnedTrophies,
  getAllGames,
  getAllLogs,
  getLogsForGame,
  importBackupData,
  replaceWithSyncSnapshot,
  resetDemoData,
  saveEarnedTrophies,
  saveGame,
  saveLogEntry,
} from '../lib/backlogDb'
import {
  requestPlayNextRecommendation,
  requestReviewDraft,
  syncWithBackend,
  testSyncConnection as requestSyncConnection,
} from '../lib/syncApi'
import { translate, getStatusLabel } from '../i18n'
import { useSettings } from './useSettings'
import { isDemoMode } from '../lib/appMode'
import { createTrophyViews, evaluateTrophies } from '../lib/trophies'
import type {
  BackupData,
  BackupImportMode,
  EarnedTrophy,
  FeedbackState,
  Game,
  GameFormState,
  GameOwnershipFilter,
  GameSortOption,
  GameStatus,
  LogEntry,
  PlayNextRecommendationResponse,
  TrophyUnlockSource,
} from '../types'

function createBacklogStore() {
  const {
    settings,
    setAiPlayNextAvailable,
    setAiReviewDraftAvailable,
    setBackupReminderDismissedAt,
    setLastBackupExportedAt,
    setLastSyncError,
    setLastSyncedAt,
  } = useSettings()
  const ACTIVE_HOME_STATUSES: GameStatus[] = ['playing', 'ongoing']
  const games = ref<Game[]>([])
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
  const playNextRecommendations = ref<PlayNextRecommendationResponse[]>([])
  const isGeneratingPlayNextRecommendation = ref(false)
  const isBrowserOnline = ref(getBrowserOnline())
  const didInitialize = ref(false)
  const isInitializing = ref(false)
  const autoSyncStarted = ref(false)
  const capabilityRefreshStarted = ref(false)
  let feedbackId = 0
  let localChangeRevision = 0
  let autoSyncTimer: number | null = null

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
    coverUrl: '',
    review: '',
    finishedAt: '',
    pausedAt: '',
    nudgeAt: '',
  })

  const selectedGame = computed(
    () => games.value.find((game) => game.id === selectedGameId.value) ?? null,
  )
  const canUseReviewDraft = computed(() =>
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
  const backlogCandidates = computed(() =>
    games.value.filter((game) => game.deletedAt === null && game.status === 'backlog'),
  )
  const canUsePlayNextRecommendation = computed(() =>
    Boolean(
      settings.aiPlayNextAvailable &&
      !isDemoMode &&
      settings.syncApiBaseUrl.trim() &&
      settings.syncToken.trim() &&
      backlogCandidates.value.length > 0 &&
      isBrowserOnline.value,
    ),
  )
  const isSyncConfigured = computed(() =>
    Boolean(settings.syncApiBaseUrl.trim() && settings.syncToken.trim()),
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
        game.tags.some((tag) => tag.toLowerCase().includes(query))

      return matchesStatus && matchesOwnership && matchesFinishedYear && matchesQuery
    })

    return [...matchingGames].sort((left, right) => {
      switch (sortOption.value) {
        case 'title-asc':
          return left.title.localeCompare(right.title)
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

  function getBrowserOnline() {
    return typeof navigator === 'undefined' ? true : navigator.onLine
  }

  function updateBrowserOnline() {
    isBrowserOnline.value = getBrowserOnline()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', updateBrowserOnline)
    window.addEventListener('offline', updateBrowserOnline)
    window.addEventListener('focus', updateBrowserOnline)
    document.addEventListener('visibilitychange', updateBrowserOnline)
  }

  function getTodayDate() {
    return new Date().toISOString().slice(0, 10)
  }

  function addDaysDate(days: number) {
    const date = new Date()

    date.setDate(date.getDate() + days)

    return date.toISOString().slice(0, 10)
  }

  function isAtLeastDaysOld(value: string | null, days: number) {
    if (!value) {
      return true
    }

    const timestamp = new Date(value).getTime()

    if (!Number.isFinite(timestamp)) {
      return true
    }

    return Date.now() - timestamp >= days * 24 * 60 * 60 * 1000
  }

  function getNextUpdatedAt(previousUpdatedAt?: string | null) {
    const now = Date.now()
    const previous = previousUpdatedAt ? new Date(previousUpdatedAt).getTime() : Number.NaN

    if (Number.isFinite(previous) && now <= previous) {
      return new Date(previous + 1000).toISOString()
    }

    return new Date(now).toISOString()
  }

  function markLocalChange() {
    localChangeRevision += 1
  }

  function parseTags(value: string) {
    const uniqueTags = new Map<string, string>()

    value
      .split(',')
      .map((tag) => tag.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .forEach((tag) => {
        const normalized = tag.toLowerCase()

        if (!uniqueTags.has(normalized)) {
          uniqueTags.set(normalized, tag)
        }
      })

    return [...uniqueTags.values()]
  }

  function ensureSyncConfig() {
    if (!settings.syncApiBaseUrl.trim()) {
      throw new Error(translate(settings.language, 'feedback.syncUrlMissing'))
    }

    if (!settings.syncToken.trim()) {
      throw new Error(translate(settings.language, 'feedback.syncTokenMissing'))
    }
  }

  function canAttemptSync() {
    return (
      !isDemoMode &&
      settings.syncApiBaseUrl.trim().length > 0 &&
      settings.syncToken.trim().length > 0 &&
      (typeof navigator === 'undefined' || navigator.onLine)
    )
  }

  function getSyncErrorMessage(
    error: unknown,
    fallbackKey:
      | 'feedback.syncConnectionFailed'
      | 'feedback.syncFailed'
      | 'feedback.reviewDraftFailed'
      | 'feedback.playNextFailed',
  ) {
    if (error instanceof TypeError) {
      return translate(settings.language, fallbackKey)
    }

    if (error instanceof Error) {
      return error.message
    }

    return translate(settings.language, fallbackKey)
  }

  function scheduleAutoSync(delay = 1400) {
    if (!settings.autoSyncEnabled || !canAttemptSync() || typeof window === 'undefined') {
      return
    }

    if (autoSyncTimer !== null) {
      window.clearTimeout(autoSyncTimer)
    }

    autoSyncTimer = window.setTimeout(() => {
      autoSyncTimer = null

      if (!settings.autoSyncEnabled || !canAttemptSync() || isSyncing.value) {
        return
      }

      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    }, delay)
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
    const [allGames, storedLogs, storedTrophies] = await Promise.all([
      getAllGames(),
      getAllLogs(),
      getAllEarnedTrophies(),
    ])

    games.value = allGames
    allLogs.value = storedLogs
    earnedTrophies.value = storedTrophies
    totalPlayLogCount.value = storedLogs.length

    if (
      playNextRecommendations.value.length > 0 &&
      playNextRecommendations.value.some(
        (recommendation) => !games.value.some((game) => game.id === recommendation.gameId && game.status === 'backlog'),
      )
    ) {
      playNextRecommendations.value = []
    }

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

  async function unlockEarnedTrophies(source: TrophyUnlockSource) {
    const newlyEarned = evaluateTrophies(games.value, allLogs.value, earnedTrophies.value)

    if (newlyEarned.length === 0) {
      return []
    }

    await saveEarnedTrophies(newlyEarned)
    earnedTrophies.value = [...earnedTrophies.value, ...newlyEarned]
    trophyUnlockQueue.value = [...trophyUnlockQueue.value, ...newlyEarned]
    latestTrophyUnlockSource.value = source
    markLocalChange()
    scheduleAutoSync()

    return newlyEarned
  }

  function dismissTrophyUnlocks() {
    trophyUnlockQueue.value = []
    latestTrophyUnlockSource.value = null
  }

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
      const manualCoverUrl = gameForm.coverUrl.trim()
      const isSyncConfigured = settings.syncApiBaseUrl.trim() !== '' && settings.syncToken.trim() !== ''
      const shouldPreserveIgdbMetadata = isSyncConfigured && existingPlain?.igdbId === normalizedIgdbId

      if (canRateCurrentStatus.value && normalizedRating !== null) {
        gameForm.rating = String(normalizedRating)
      }

      if (normalizedPlayTime !== null) {
        gameForm.playTimeHours = String(normalizedPlayTime)
      }

      if (normalizedIgdbId !== null) {
        gameForm.igdbId = String(normalizedIgdbId)
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
        igdbId: isSyncConfigured ? normalizedIgdbId : null,
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
        coverUrl: isSyncConfigured
          ? shouldPreserveIgdbMetadata
            ? existingPlain?.coverUrl ?? null
            : null
          : manualCoverUrl || null,
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
      await loadGames()
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
    await loadGames()
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
    await saveGame({
      ...currentGamePlain,
      updatedAt: now,
    })
    markLocalChange()

    logDraft.value = ''
    await loadGames()
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
    await saveGame({
      ...currentGamePlain,
      updatedAt: now,
    })
    markLocalChange()

    await loadGames()
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
      await loadGames()
      await selectGame(updatedGame.id)
      await unlockEarnedTrophies('user-action')

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
      await loadGames()
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

  async function exportBackup() {
    const payload = await createBackupData()

    setLastBackupExportedAt(payload.exportedAt)
    setBackupReminderDismissedAt(null)

    return payload
  }

  function dismissBackupReminder() {
    setBackupReminderDismissedAt(new Date().toISOString())
  }

  async function importBackup(payload: BackupData, mode: BackupImportMode) {
    const result = await importBackupData(payload, mode)

    await ensureLoaded(true)
    await unlockEarnedTrophies('import')

    if (selectedGameId.value) {
      await loadLogs(selectedGameId.value)
    }

    setFeedback(
      translate(
        settings.language,
        mode === 'replace' ? 'feedback.backupRestored' : 'feedback.backupMerged',
        {
          games: result.games,
          logs: result.logs,
        },
      ),
    )

    return result
  }

  async function performSync(options?: { silentSuccess?: boolean }) {
    await ensureLoaded()
    const syncStartedAtRevision = localChangeRevision
    const snapshot = await createSyncSnapshot()
    const response = await syncWithBackend(
      settings.syncApiBaseUrl,
      settings.syncToken,
      snapshot,
    )

    if (syncStartedAtRevision !== localChangeRevision) {
      if (!options?.silentSuccess) {
        setFeedback(translate(settings.language, 'feedback.syncSkippedLocalChanges'), 'info')
      }

      return response
    }

    await replaceWithSyncSnapshot({
      games: response.games,
      logs: response.logs,
      earnedTrophies: response.earnedTrophies ?? snapshot.earnedTrophies,
    })
    await ensureLoaded(true)

    if (selectedGameId.value) {
      await loadLogs(selectedGameId.value)
    }

    await unlockEarnedTrophies('sync')

    if (gameForm.id) {
      const refreshedGame = games.value.find((game) => game.id === gameForm.id)

      if (refreshedGame) {
        editGame(refreshedGame)
      } else {
        resetForm()
      }
    }

    setLastSyncedAt(response.syncedAt)
    setLastSyncError(null)

    if (!options?.silentSuccess) {
      setFeedback(
        translate(settings.language, 'feedback.syncCompleted', {
          games: response.games.filter((game) => game.deletedAt === null).length,
          logs: response.logs.filter((logEntry) => logEntry.deletedAt === null).length,
        }),
      )
    }

    return response
  }

  function startAutoSync() {
    if (autoSyncStarted.value || typeof window === 'undefined') {
      return
    }

    autoSyncStarted.value = true

    window.addEventListener('focus', () => {
      if (!settings.autoSyncEnabled || !canAttemptSync() || isSyncing.value) {
        return
      }

      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    })

    window.addEventListener('online', () => {
      if (!settings.autoSyncEnabled || !canAttemptSync() || isSyncing.value) {
        return
      }

      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    })

    if (settings.autoSyncEnabled && canAttemptSync()) {
      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    }
  }

  async function testSyncConnection() {
    isTestingSyncConnection.value = true

    try {
      ensureSyncConfig()
      const response = await requestSyncConnection(
        settings.syncApiBaseUrl,
        settings.syncToken,
      )

      setFeedback(
        translate(settings.language, 'feedback.syncConnectionOk', {
          name: response.user.displayName || response.user.email || `#${response.user.id}`,
        }),
      )
      setAiReviewDraftAvailable(response.capabilities.reviewDraft)
      setAiPlayNextAvailable(response.capabilities.playNext)
      setLastSyncError(null)

      return response
    } catch (error) {
      const message = getSyncErrorMessage(error, 'feedback.syncConnectionFailed')

      setLastSyncError(message)
      setFeedback(message, 'error')
      throw new Error(message)
    } finally {
      isTestingSyncConnection.value = false
    }
  }

  async function refreshSyncCapabilities() {
    if (capabilityRefreshStarted.value || !canAttemptSync()) {
      return
    }

    capabilityRefreshStarted.value = true

    try {
      const response = await requestSyncConnection(
        settings.syncApiBaseUrl,
        settings.syncToken,
      )

      setAiReviewDraftAvailable(response.capabilities.reviewDraft)
      setAiPlayNextAvailable(response.capabilities.playNext)
    } catch {
      // Keep the latest known capability state when the startup refresh fails.
    }
  }

  async function syncNow(options?: {
    source?: 'manual' | 'auto'
    silentSuccess?: boolean
    errorFeedback?: boolean
  }) {
    isSyncing.value = true

    try {
      ensureSyncConfig()
      const response = await performSync({
        silentSuccess: options?.silentSuccess,
      })

      if (options?.source !== 'auto') {
        try {
          const connection = await requestSyncConnection(
            settings.syncApiBaseUrl,
            settings.syncToken,
          )
          setAiReviewDraftAvailable(connection.capabilities.reviewDraft)
          setAiPlayNextAvailable(connection.capabilities.playNext)
        } catch {
          // Keep the latest known capability state when the refresh call fails.
        }
      }

      return response
    } catch (error) {
      const message = getSyncErrorMessage(error, 'feedback.syncFailed')

      setLastSyncError(message)

      if (options?.errorFeedback !== false) {
        setFeedback(message, 'error')
      }

      throw new Error(message)
    } finally {
      isSyncing.value = false
    }
  }

  async function generateReviewDraft() {
    const currentGame = selectedGame.value

    if (!currentGame) {
      return
    }

    ensureSyncConfig()
    isDraftingReview.value = true

    try {
      const response = await requestReviewDraft(
        settings.syncApiBaseUrl,
        settings.syncToken,
        currentGame.id,
        settings.language,
      )

      reviewDraftPreview.value = response.draft.trim()

      return response
    } catch (error) {
      const message = getSyncErrorMessage(error, 'feedback.reviewDraftFailed')
      setFeedback(message, 'error')
      throw new Error(message)
    } finally {
      isDraftingReview.value = false
    }
  }

  async function generatePlayNextRecommendation() {
    ensureSyncConfig()
    isGeneratingPlayNextRecommendation.value = true

    try {
      const response = await requestPlayNextRecommendation(
        settings.syncApiBaseUrl,
        settings.syncToken,
        settings.language,
      )

      playNextRecommendations.value = response.recommendations.map((recommendation) => ({
        slot: recommendation.slot,
        gameId: recommendation.gameId,
        title: recommendation.title.trim(),
        reason: recommendation.reason.trim(),
      }))

      return response
    } catch (error) {
      const message = getSyncErrorMessage(error, 'feedback.playNextFailed')
      setFeedback(message, 'error')
      throw new Error(message)
    } finally {
      isGeneratingPlayNextRecommendation.value = false
    }
  }

  async function applyReviewDraft() {
    const currentGame = selectedGame.value
    const draft = reviewDraftPreview.value.trim()

    if (!currentGame || !draft) {
      return
    }

    const currentGamePlain = toPlainGame(currentGame)
    const updatedGame: Game = {
      ...currentGamePlain,
      review: draft,
      updatedAt: getNextUpdatedAt(currentGamePlain.updatedAt),
    }

    await saveGame(updatedGame)
    markLocalChange()
    reviewDraftPreview.value = ''
    await loadGames()
    await selectGame(updatedGame.id)

    if (gameForm.id === updatedGame.id) {
      editGame(updatedGame)
    }

    setFeedback(translate(settings.language, 'feedback.reviewDraftApplied'))
    scheduleAutoSync()
  }

  function discardReviewDraft() {
    reviewDraftPreview.value = ''
  }

  async function resetDemoLibrary() {
    if (!isDemoMode) {
      return
    }

    await resetDemoData()
    markLocalChange()
    selectedGameId.value = null
    logDraft.value = ''
    reviewDraftPreview.value = ''
    playNextRecommendations.value = []
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
    canUsePlayNextRecommendation,
    canUseReviewDraft,
    currentFocus,
    discardReviewDraft,
    clearFeedback,
    dismissTrophyUnlocks,
    dismissBackupReminder,
    duePausedGames,
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
    generatePlayNextRecommendation,
    generateReviewDraft,
    games,
    isGeneratingPlayNextRecommendation,
    isDraftingReview,
    isLoading,
    isSaving,
    importBackup,
    isSyncConfigured,
    isSyncing,
    isTestingSyncConnection,
    logDraft,
    logs,
    ownershipFilter,
    playNextRecommendations,
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
    selectedGameId,
    setFeedback,
    sortOption,
    startAutoSync,
    startCreatingGame,
    startEditingGame,
    stats,
    statusFilter,
    shouldShowBackupReminder,
    syncNow,
    testSyncConnection,
    trophyUnlockQueue,
    latestTrophyUnlockSource,
    trophyViews,
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
