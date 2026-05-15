import Dexie, { type EntityTable } from 'dexie'
import {
  GAME_OWNERSHIP_TYPES,
  GAME_STATUSES,
  type BackupData,
  type BackupImportMode,
  type EarnedTrophy,
  type Game,
  type LogEntry,
  type SyncSnapshot,
} from '../types'
import { isDemoMode } from './appMode'
import { demoGames, demoLogs } from './demoData'

type StoredGame = Omit<Game, 'ownershipType'> & {
  notes?: string
  ownershipType?: unknown
}

const BACKUP_VERSION = 8

class BacklogDatabase extends Dexie {
  games!: EntityTable<Game, 'id'>
  logs!: EntityTable<LogEntry, 'id'>
  earnedTrophies!: EntityTable<EarnedTrophy, 'id'>

  constructor() {
    super(isDemoMode ? 'miolog-demo-backlog' : 'miolog-backlog')

    // Keep schema explicit so future migrations stay easy to reason about.
    this.version(1).stores({
      games: 'id, updatedAt, status, title',
      logs: 'id, gameId, createdAt',
    })

    this.version(2)
      .stores({
        games: 'id, updatedAt, status, title',
        logs: 'id, gameId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredGame, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.review !== 'string') {
              game.review = game.notes ?? ''
            }

            delete game.notes
          })
      })

    this.version(3)
      .stores({
        games: 'id, updatedAt, status, title, finishedAt',
        logs: 'id, gameId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredGame, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.finishedAt !== 'string') {
              game.finishedAt = null
            }
          })
      })

    this.version(4)
      .stores({
        games: 'id, updatedAt, status, title, finishedAt',
        logs: 'id, gameId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredGame, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.playTimeHours !== 'number' || !Number.isFinite(game.playTimeHours)) {
              game.playTimeHours = null
            }
          })
      })

    this.version(5)
      .stores({
        games: 'id, updatedAt, status, title, finishedAt, deletedAt',
        logs: 'id, gameId, createdAt, updatedAt, deletedAt',
        earnedTrophies: 'id, trophyId, earnedAt, updatedAt, deletedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Game, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.deletedAt !== 'string') {
              game.deletedAt = null
            }
          })

        await transaction
          .table<LogEntry, 'id'>('logs')
          .toCollection()
          .modify((logEntry) => {
            if (typeof logEntry.updatedAt !== 'string') {
              logEntry.updatedAt = logEntry.createdAt
            }

            if (typeof logEntry.deletedAt !== 'string') {
              logEntry.deletedAt = null
            }
          })
      })

    this.version(6).stores({
      games: 'id, updatedAt, status, title, finishedAt, deletedAt',
      logs: 'id, gameId, createdAt, updatedAt, deletedAt',
      earnedTrophies: 'id, trophyId, earnedAt, updatedAt, deletedAt',
    })
  }
}

const db = new BacklogDatabase()

function normalizeStoredGame(game: StoredGame): Game {
  return {
    ...game,
    playTimeHours:
      typeof game.playTimeHours === 'number' && Number.isFinite(game.playTimeHours)
        ? game.playTimeHours
        : null,
    review: game.review ?? game.notes ?? '',
    ownershipType: asNullableOwnershipType(game.ownershipType),
    igdbId:
      typeof game.igdbId === 'number' && Number.isInteger(game.igdbId) && game.igdbId > 0
        ? game.igdbId
        : null,
    igdbUrl: typeof game.igdbUrl === 'string' ? game.igdbUrl : null,
    igdbTtbHastilySeconds: asNullablePositiveInteger(game.igdbTtbHastilySeconds),
    igdbTtbNormallySeconds: asNullablePositiveInteger(game.igdbTtbNormallySeconds),
    igdbTtbCompletelySeconds: asNullablePositiveInteger(game.igdbTtbCompletelySeconds),
    igdbTtbCount: asNullableNonNegativeInteger(game.igdbTtbCount),
    igdbTtbUpdatedAt: typeof game.igdbTtbUpdatedAt === 'string' ? game.igdbTtbUpdatedAt : null,
    igdbDevelopers: asNullableStringList(game.igdbDevelopers),
    igdbPublishers: asNullableStringList(game.igdbPublishers),
    igdbThemes: asNullableStringList(game.igdbThemes),
    igdbGameModes: asNullableStringList(game.igdbGameModes),
    coverUrl: typeof game.coverUrl === 'string' ? game.coverUrl : null,
    finishedAt: typeof game.finishedAt === 'string' ? game.finishedAt : null,
    pausedAt: typeof game.pausedAt === 'string' ? game.pausedAt : null,
    nudgeAt: typeof game.nudgeAt === 'string' ? game.nudgeAt : null,
    deletedAt: typeof game.deletedAt === 'string' ? game.deletedAt : null,
  }
}

function normalizeStoredLogEntry(logEntry: LogEntry): LogEntry {
  return {
    ...logEntry,
    updatedAt: typeof logEntry.updatedAt === 'string' ? logEntry.updatedAt : logEntry.createdAt,
    deletedAt: typeof logEntry.deletedAt === 'string' ? logEntry.deletedAt : null,
  }
}

export async function getAllGames(includeDeleted = false) {
  const games = (await db.games.orderBy('updatedAt').reverse().toArray()) as StoredGame[]
  const normalizedGames = games.map(normalizeStoredGame)

  return includeDeleted
    ? normalizedGames
    : normalizedGames.filter((game) => game.deletedAt === null)
}

export async function getAllLogs(includeDeleted = false) {
  const logs = await db.logs.toArray()
  const normalizedLogs = logs.map(normalizeStoredLogEntry)

  return includeDeleted
    ? normalizedLogs
    : normalizedLogs.filter((logEntry) => logEntry.deletedAt === null)
}

export async function getAllEarnedTrophies(includeDeleted = false) {
  const trophies = await db.earnedTrophies.orderBy('updatedAt').reverse().toArray()
  const normalizedTrophies = trophies.map(normalizeEarnedTrophy)

  return includeDeleted
    ? normalizedTrophies
    : normalizedTrophies.filter((trophy) => trophy.deletedAt === null)
}

export async function saveGame(game: Game) {
  await db.games.put(game)
}

export async function deleteGame(gameId: string) {
  await db.transaction('rw', db.games, db.logs, async () => {
    const now = new Date().toISOString()
    const game = await db.games.get(gameId)

    if (!game) {
      return
    }

    await db.games.put({
      ...normalizeStoredGame(game as StoredGame),
      updatedAt: now,
      deletedAt: now,
    })

    const logs = await db.logs.where('gameId').equals(gameId).toArray()

    if (logs.length > 0) {
      await db.logs.bulkPut(
        logs.map((logEntry) => ({
          ...normalizeStoredLogEntry(logEntry),
          updatedAt: now,
          deletedAt: now,
        })),
      )
    }
  })
}

export async function getLogsForGame(gameId: string) {
  const logs = await db.logs.where('gameId').equals(gameId).sortBy('createdAt')

  return logs
    .map(normalizeStoredLogEntry)
    .filter((logEntry) => logEntry.deletedAt === null)
    .reverse()
}

export async function saveLogEntry(logEntry: LogEntry) {
  await db.logs.put(logEntry)
}

export async function saveEarnedTrophies(earnedTrophies: EarnedTrophy[]) {
  if (earnedTrophies.length === 0) {
    return
  }

  await db.earnedTrophies.bulkPut(earnedTrophies)
}

export async function ensureDemoData() {
  if (!isDemoMode) {
    return
  }

  const gameCount = await db.games.count()

  if (gameCount > 0) {
    return
  }

  await resetDemoData()
}

export async function resetDemoData() {
  if (!isDemoMode) {
    return
  }

  await db.transaction('rw', db.games, db.logs, db.earnedTrophies, async () => {
    await db.games.clear()
    await db.logs.clear()
    await db.earnedTrophies.clear()
    await db.games.bulkPut(demoGames)
    await db.logs.bulkPut(demoLogs)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNullableRating(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNullablePositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function asNullableNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function asNullableOwnershipType(value: unknown): Game['ownershipType'] {
  return GAME_OWNERSHIP_TYPES.includes(value as (typeof GAME_OWNERSHIP_TYPES)[number])
    ? value as Game['ownershipType']
    : null
}

function asNullableStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    ),
  ]
}

function normalizeGame(value: unknown): Game {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid game entry.')
  }

  const status = asString(value.status, 'backlog')

  if (!GAME_STATUSES.includes(status as (typeof GAME_STATUSES)[number])) {
    throw new Error(`Backup contains an invalid game status: ${status}`)
  }

  return {
    id: asString(value.id),
    title: asString(value.title),
    status: status as Game['status'],
    rating: asNullableRating(value.rating),
    playTimeHours:
      typeof value.playTimeHours === 'number' && Number.isFinite(value.playTimeHours)
        ? value.playTimeHours
        : null,
    review: asString(value.review, asString(value.notes)),
    platform: asString(value.platform),
    ownershipType: asNullableOwnershipType(value.ownershipType),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    igdbId:
      typeof value.igdbId === 'number' && Number.isInteger(value.igdbId) && value.igdbId > 0
        ? value.igdbId
        : null,
    igdbUrl: typeof value.igdbUrl === 'string' ? value.igdbUrl : null,
    igdbTtbHastilySeconds: asNullablePositiveInteger(value.igdbTtbHastilySeconds),
    igdbTtbNormallySeconds: asNullablePositiveInteger(value.igdbTtbNormallySeconds),
    igdbTtbCompletelySeconds: asNullablePositiveInteger(value.igdbTtbCompletelySeconds),
    igdbTtbCount: asNullableNonNegativeInteger(value.igdbTtbCount),
    igdbTtbUpdatedAt: typeof value.igdbTtbUpdatedAt === 'string' ? value.igdbTtbUpdatedAt : null,
    igdbDevelopers: asNullableStringList(value.igdbDevelopers),
    igdbPublishers: asNullableStringList(value.igdbPublishers),
    igdbThemes: asNullableStringList(value.igdbThemes),
    igdbGameModes: asNullableStringList(value.igdbGameModes),
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
    pausedAt: typeof value.pausedAt === 'string' ? value.pausedAt : null,
    nudgeAt: typeof value.nudgeAt === 'string' ? value.nudgeAt : null,
    createdAt: asString(value.createdAt),
    coverUrl: typeof value.coverUrl === 'string' ? value.coverUrl : null,
    updatedAt: asString(value.updatedAt),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function normalizeLogEntry(value: unknown): LogEntry {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid log entry.')
  }

  return {
    id: asString(value.id),
    gameId: asString(value.gameId),
    content: asString(value.content),
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt, asString(value.createdAt)),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function normalizeEarnedTrophy(value: unknown): EarnedTrophy {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid trophy entry.')
  }

  const trophyId = asString(value.trophyId)
  const createdAt = asString(value.createdAt, asString(value.earnedAt))

  return {
    id: asString(value.id, trophyId ? `trophy-${trophyId}` : ''),
    trophyId,
    earnedAt: asString(value.earnedAt, createdAt),
    gameId: typeof value.gameId === 'string' ? value.gameId : null,
    context: isRecord(value.context) ? value.context : null,
    createdAt,
    updatedAt: asString(value.updatedAt, createdAt),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

export async function createBackupData(): Promise<BackupData> {
  const games = await getAllGames()
  const logs = await getAllLogs()
  const earnedTrophies = await getAllEarnedTrophies()

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    games,
    logs,
    earnedTrophies,
  }
}

export async function importBackupData(
  payload: unknown,
  mode: BackupImportMode,
) {
  if (!isRecord(payload)) {
    throw new Error('Backup file is not a valid object.')
  }

  const games = Array.isArray(payload.games) ? payload.games.map(normalizeGame) : null
  const logs = Array.isArray(payload.logs) ? payload.logs.map(normalizeLogEntry) : null
  const earnedTrophies = Array.isArray(payload.earnedTrophies)
    ? payload.earnedTrophies.map(normalizeEarnedTrophy)
    : []

  if (!games || !logs) {
    throw new Error('Backup file is missing games or logs.')
  }

  const normalizedGames = dedupeById(games)
  const normalizedLogs = dedupeById(logs)
  const normalizedEarnedTrophies = dedupeById(earnedTrophies)

  await db.transaction('rw', db.games, db.logs, db.earnedTrophies, async () => {
    if (mode === 'replace') {
      await db.games.clear()
      await db.logs.clear()
      await db.earnedTrophies.clear()
    }

    if (normalizedGames.length > 0) {
      await db.games.bulkPut(normalizedGames)
    }

    if (normalizedLogs.length > 0) {
      await db.logs.bulkPut(normalizedLogs)
    }

    if (normalizedEarnedTrophies.length > 0) {
      await db.earnedTrophies.bulkPut(normalizedEarnedTrophies)
    }
  })

  return {
    games: normalizedGames.length,
    logs: normalizedLogs.length,
    earnedTrophies: normalizedEarnedTrophies.length,
  }
}

export async function createSyncSnapshot(): Promise<SyncSnapshot> {
  return {
    games: await getAllGames(true),
    logs: await getAllLogs(true),
    earnedTrophies: await getAllEarnedTrophies(true),
  }
}

export async function replaceWithSyncSnapshot(snapshot: SyncSnapshot) {
  await db.transaction('rw', db.games, db.logs, db.earnedTrophies, async () => {
    await db.games.clear()
    await db.logs.clear()
    await db.earnedTrophies.clear()

    if (snapshot.games.length > 0) {
      await db.games.bulkPut(snapshot.games.map(normalizeGame))
    }

    if (snapshot.logs.length > 0) {
      await db.logs.bulkPut(snapshot.logs.map(normalizeLogEntry))
    }

    if (snapshot.earnedTrophies.length > 0) {
      await db.earnedTrophies.bulkPut(snapshot.earnedTrophies.map(normalizeEarnedTrophy))
    }
  })
}
