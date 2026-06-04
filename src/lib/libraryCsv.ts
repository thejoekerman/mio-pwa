import Papa from 'papaparse'
import { GAME_STATUSES, type Game, type GameStatus } from '../types'

export const LIBRARY_CSV_COLUMNS = [
  'title',
  'status',
  'platform',
  'rating',
  'playTimeHours',
  'finishedDate',
  'coverUrl',
  'mioId',
] as const

export interface LibraryCsvImportRow {
  line: number
  title: string
  action: 'create' | 'update'
  status: GameStatus
  errors: string[]
  warnings: string[]
}

export interface LibraryCsvImportPlan {
  rows: LibraryCsvImportRow[]
  gamesToSave: Game[]
  createCount: number
  updateCount: number
  skippedCount: number
  errors: string[]
  warnings: string[]
}

interface ParseOptions {
  createId: () => string
  now: string
}

const CSV_TEMPLATE_ROW = {
  mioId: '',
  title: 'After the Stream Went Dark',
  status: 'finished',
  platform: 'Steam',
  rating: '7',
  playTimeHours: '2',
  finishedDate: '2026-06-03',
  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cobtw4.webp',
}

export function createLibraryCsvTemplate() {
  return toCsv([LIBRARY_CSV_COLUMNS, rowFromRecord(CSV_TEMPLATE_ROW)])
}

export function createLibraryCsv(games: Game[]) {
  const rows = games.map((game) => [
    game.title,
    game.status,
    game.platform,
    game.rating === null ? '' : String(game.rating),
    game.playTimeHours === null ? '' : String(game.playTimeHours),
    game.status === 'finished' && game.finishedAt ? game.finishedAt.slice(0, 10) : '',
    game.coverUrl ?? '',
    game.id,
  ])

  return toCsv([LIBRARY_CSV_COLUMNS, ...rows])
}

export function parseLibraryCsvImport(
  rawCsv: string,
  existingGames: Game[],
  options: ParseOptions,
): LibraryCsvImportPlan {
  const parsedRows = parseCsvRows(rawCsv)
  const plan: LibraryCsvImportPlan = {
    rows: [],
    gamesToSave: [],
    createCount: 0,
    updateCount: 0,
    skippedCount: 0,
    errors: [],
    warnings: [],
  }

  if (parsedRows.length === 0) {
    plan.errors.push('CSV file is empty.')
    return plan
  }

  const header = parsedRows[0].map((column) => column.trim())
  const headerIndexes = new Map(header.map((column, index) => [column, index]))
  const missingColumns = LIBRARY_CSV_COLUMNS.filter((column) => !headerIndexes.has(column))

  if (missingColumns.length > 0) {
    plan.errors.push(`Missing required columns: ${missingColumns.join(', ')}.`)
    return plan
  }

  const unknownColumns = header.filter(
    (column) => column !== '' && !LIBRARY_CSV_COLUMNS.includes(column as (typeof LIBRARY_CSV_COLUMNS)[number]),
  )
  if (unknownColumns.length > 0) {
    plan.warnings.push(`Unknown columns will be ignored: ${unknownColumns.join(', ')}.`)
  }

  const existingById = new Map(existingGames.map((game) => [game.id, game]))
  const existingCreateKeys = new Set(existingGames.map((game) => duplicateKey(game.title, game.platform)))
  let latestUpdatedAt = options.now

  parsedRows.slice(1).forEach((csvRow, index) => {
    if (csvRow.every((cell) => cell.trim() === '')) {
      return
    }

    const line = index + 2
    const rowErrors: string[] = []
    const rowWarnings: string[] = []
    const value = (column: (typeof LIBRARY_CSV_COLUMNS)[number]) =>
      csvRow[headerIndexes.get(column) ?? -1]?.trim() ?? ''

    const mioId = value('mioId')
    const title = value('title')
    const platform = value('platform')
    const existingGame = mioId ? existingById.get(mioId) ?? null : null
    const action = existingGame ? 'update' : 'create'

    if (mioId && !existingGame) {
      rowErrors.push(
        `Line ${line}: mioId "${mioId}" does not match this library. Use JSON backup to migrate MioLog data, or clear mioId to import this row as a new game.`,
      )
    }

    if (!title) {
      rowErrors.push(`Line ${line}: title is required.`)
    }

    if (!mioId && title && existingCreateKeys.has(duplicateKey(title, platform))) {
      rowErrors.push(
        `Line ${line}: "${title}" already exists with this platform. Export CSV to bulk-edit existing games, or change the platform/title to import a separate game.`,
      )
    }

    const statusResult = parseStatus(value('status'), line, rowErrors)
    const status = statusResult.status
    const rating = parseRating(value('rating'), line, rowErrors)
    const playTimeHours = parsePlayTime(value('playTimeHours'), line, rowErrors)
    const finishedDate = statusResult.valid
      ? parseFinishedDate(value('finishedDate'), status, line, rowErrors, rowWarnings)
      : null
    const coverUrl = parseCoverUrl(value('coverUrl'), line, rowErrors)
    const normalizedRating = canRateStatus(status) ? rating : null

    if (statusResult.valid && !canRateStatus(status) && rating !== null) {
      rowWarnings.push(`Line ${line}: rating is only imported for finished or abandoned games.`)
    }

    if (rowErrors.length > 0) {
      plan.skippedCount += 1
      plan.errors.push(...rowErrors)
      plan.warnings.push(...rowWarnings)
      plan.rows.push({
        line,
        title,
        action,
        status,
        errors: rowErrors,
        warnings: rowWarnings,
      })
      return
    }

    latestUpdatedAt = nextIsoTimestamp(latestUpdatedAt)
    const game = buildImportedGame({
      existingGame,
      id: mioId || options.createId(),
      title,
      status,
      platform,
      rating: normalizedRating,
      playTimeHours,
      finishedDate,
      coverUrl,
      now: latestUpdatedAt,
    })

    plan.gamesToSave.push(game)
    plan.createCount += action === 'create' ? 1 : 0
    plan.updateCount += action === 'update' ? 1 : 0
    if (action === 'create') {
      existingCreateKeys.add(duplicateKey(title, platform))
    }
    plan.warnings.push(...rowWarnings)
    plan.rows.push({
      line,
      title,
      action,
      status,
      errors: [],
      warnings: rowWarnings,
    })
  })

  return plan
}

function rowFromRecord(record: Record<(typeof LIBRARY_CSV_COLUMNS)[number], string>) {
  return LIBRARY_CSV_COLUMNS.map((column) => record[column])
}

function duplicateKey(title: string, platform: string) {
  return `${normalizeDuplicatePart(title)}\u0000${normalizeDuplicatePart(platform)}`
}

function normalizeDuplicatePart(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function canRateStatus(status: GameStatus) {
  return status === 'finished' || status === 'abandoned'
}

function parseStatus(
  value: string,
  line: number,
  errors: string[],
): { status: GameStatus; valid: boolean } {
  if (!value) {
    return { status: 'backlog', valid: true }
  }

  const normalizedValue = value.toLowerCase()
  if (GAME_STATUSES.includes(normalizedValue as GameStatus)) {
    return { status: normalizedValue as GameStatus, valid: true }
  }

  errors.push(`Line ${line}: status must be one of ${GAME_STATUSES.join(', ')}.`)
  return { status: 'backlog', valid: false }
}

function parseRating(value: string, line: number, errors: string[]) {
  if (!value) {
    return null
  }

  if (!/^(?:[1-9]|10)$/.test(value)) {
    errors.push(`Line ${line}: rating must be a whole number from 1 to 10.`)
    return null
  }

  return Number.parseInt(value, 10)
}

function parsePlayTime(value: string, line: number, errors: string[]) {
  if (!value) {
    return null
  }

  const normalizedValue = value.replace(',', '.')

  if (!/^\d+(?:\.\d+)?$/.test(normalizedValue)) {
    errors.push(`Line ${line}: playTimeHours must be a non-negative number using "." or "," for decimals.`)
    return null
  }

  return Math.round(Number.parseFloat(normalizedValue) * 10) / 10
}

function parseFinishedDate(
  value: string,
  status: GameStatus,
  line: number,
  errors: string[],
  warnings: string[],
) {
  if (!value) {
    return null
  }

  if (status !== 'finished') {
    warnings.push(`Line ${line}: finishedDate is only imported for finished games.`)
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`Line ${line}: finishedDate must use YYYY-MM-DD format.`)
    return null
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value) {
    errors.push(`Line ${line}: finishedDate must be a real calendar date.`)
    return null
  }

  return value
}

function parseCoverUrl(value: string, line: number, errors: string[]) {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return value
    }
  } catch {
    // Fall through to the shared error.
  }

  errors.push(`Line ${line}: coverUrl must be a valid http(s) URL.`)
  return null
}

function buildImportedGame({
  existingGame,
  id,
  title,
  status,
  platform,
  rating,
  playTimeHours,
  finishedDate,
  coverUrl,
  now,
}: {
  existingGame: Game | null
  id: string
  title: string
  status: GameStatus
  platform: string
  rating: number | null
  playTimeHours: number | null
  finishedDate: string | null
  coverUrl: string | null
  now: string
}): Game {
  const base: Game = existingGame ?? {
    id,
    title,
    status,
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    igdbId: null,
    igdbUrl: null,
    igdbTtbHastilySeconds: null,
    igdbTtbNormallySeconds: null,
    igdbTtbCompletelySeconds: null,
    igdbTtbCount: null,
    igdbTtbUpdatedAt: null,
    igdbDevelopers: null,
    igdbPublishers: null,
    igdbThemes: null,
    igdbGameModes: null,
    releaseYear: null,
    priority: null,
    developer: null,
    publisher: null,
    coverUrl: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  return {
    ...base,
    id,
    title,
    status,
    rating,
    playTimeHours,
    platform,
    coverUrl,
    finishedAt: status === 'finished' ? finishedDate ?? base.finishedAt ?? now.slice(0, 10) : null,
    pausedAt: status === 'paused' ? base.pausedAt ?? now.slice(0, 10) : null,
    nudgeAt: status === 'paused' ? base.nudgeAt : null,
    updatedAt: now,
    deletedAt: null,
  }
}

function nextIsoTimestamp(previous: string) {
  const previousTime = new Date(previous).getTime()
  const nextTime = Number.isFinite(previousTime) ? previousTime + 1 : Date.now()

  return new Date(nextTime).toISOString()
}

function parseCsvRows(rawCsv: string) {
  const result = Papa.parse<string[]>(rawCsv, {
    skipEmptyLines: 'greedy',
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? 'CSV could not be parsed.')
  }

  return result.data
}

function toCsv(rows: readonly (readonly string[])[]) {
  return Papa.unparse(rows.map((row) => [...row]), {
    columns: [...LIBRARY_CSV_COLUMNS],
    newline: '\n',
  }) + '\n'
}
