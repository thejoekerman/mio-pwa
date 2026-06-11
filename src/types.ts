export const GAME_STATUSES = [
  'backlog',
  'playing',
  'ongoing',
  'finished',
  'paused',
  'abandoned',
] as const

export type GameStatus = (typeof GAME_STATUSES)[number]
export type GameDisplayStatus = GameStatus | 'replaying'
export type LibraryStatusFilter = 'all' | GameDisplayStatus

export const APP_LANGUAGES = ['en', 'de', 'ja'] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]

export const APP_THEMES = ['journal', 'mio', 'polar', 'preemNeon'] as const

export type AppTheme = (typeof APP_THEMES)[number]

export const LIBRARY_VIEW_MODES = ['list', 'shelf'] as const

export type LibraryViewMode = (typeof LIBRARY_VIEW_MODES)[number]

export const GAME_OWNERSHIP_TYPES = ['digital', 'physical', 'both'] as const

export type GameOwnershipType = (typeof GAME_OWNERSHIP_TYPES)[number]

export const GAME_OWNERSHIP_FILTERS = ['all', 'digital', 'physical'] as const

export type GameOwnershipFilter = (typeof GAME_OWNERSHIP_FILTERS)[number]

export const GAME_SORT_OPTIONS = [
  'created-desc',
  'created-asc',
  'title-asc',
  'developer-asc',
  'publisher-asc',
  'rating-desc',
  'rating-asc',
] as const

export type GameSortOption = (typeof GAME_SORT_OPTIONS)[number]

export const GAME_PRIORITIES = ['high-interest', 'low-pressure', 'save-for-later'] as const

export type GamePriority = (typeof GAME_PRIORITIES)[number]

export const PLATFORM_OPTIONS = [
  'PS5',
  'PS4',
  'Switch',
  'Switch 2',
  'Xbox Series X|S',
  'Steam',
  'GOG',
  'PC',
] as const

export const SUGGESTED_TAGS = [
  'RPG',
  'JRPG',
  'Action',
  'Adventure',
  'Horror',
  'Soulslike',
  'Cozy',
  'Narrative',
  'Strategy',
  'Tactical',
  'Roguelike',
  'Metroidvania',
  'Puzzle',
  'Simulation',
  'Fighting',
  'Platformer',
  'Shooter',
  'Racing',
  'Sports',
  'Visual Novel',
  'Stealth',
  'Co-op',
  'Indie',
] as const

// Transitional 3.0 persistence contracts. The existing `Game` and `LogEntry`
// interfaces remain the 2.x UI projection until each feature consumes Game +
// Journey directly.
export type MetadataProvider = 'wikidata' | 'wikipedia' | 'howlongtobeat'

export interface ExternalReference {
  provider: MetadataProvider
  externalId: string
  url: string | null
}

export interface PlaytimeEstimates {
  mainStoryHours: number | null
  mainExtrasHours: number | null
  completionistHours: number | null
  source: 'howlongtobeat'
  refreshedAt: string
}

export interface GameArtwork {
  url: string
  source: {
    provider: MetadataProvider | 'manual'
    pageUrl: string | null
  }
}

export interface CanonicalGame {
  id: string
  title: string
  releaseYear: number | null
  developers: string[]
  publishers: string[]
  genres: string[]
  themes: string[]
  gameModes: string[]
  tags: string[]
  cover: GameArtwork | null
  externalReferences: ExternalReference[]
  playtimeEstimates: PlaytimeEstimates | null
  metadataReviewedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Journey {
  id: string
  gameId: string
  status: GameStatus
  platform: string
  ownershipType: GameOwnershipType | null
  priority: GamePriority | null
  rating: number | null
  review: string
  playTimeHours: number | null
  startedAt: string | null
  finishedAt: string | null
  pausedAt: string | null
  nudgeAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface JourneyLogEntry {
  id: string
  journeyId: string
  content: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Game {
  id: string
  title: string
  status: GameStatus
  rating: number | null
  playTimeHours: number | null
  review: string
  platform: string
  ownershipType: GameOwnershipType | null
  tags: string[]
  genres?: string[]
  themes?: string[]
  gameModes?: string[]
  externalReferences?: ExternalReference[]
  metadataReviewedAt?: string | null
  coverSource?: GameArtwork['source'] | null
  igdbId: number | null
  igdbUrl?: string | null
  igdbTtbHastilySeconds?: number | null
  igdbTtbNormallySeconds?: number | null
  igdbTtbCompletelySeconds?: number | null
  igdbTtbCount?: number | null
  igdbTtbUpdatedAt?: string | null
  igdbDevelopers?: string[] | null
  igdbPublishers?: string[] | null
  igdbThemes?: string[] | null
  igdbGameModes?: string[] | null
  releaseYear?: number | null
  priority?: GamePriority | null
  developer?: string | null
  publisher?: string | null
  finishedAt: string | null
  pausedAt: string | null
  nudgeAt: string | null
  createdAt: string
  coverUrl?: string | null
  updatedAt: string
  deletedAt: string | null
}

export interface LogEntry {
  id: string
  gameId: string
  content: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface EarnedTrophy {
  id: string
  trophyId: string
  earnedAt: string
  gameId: string | null
  context: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type TrophyUnlockSource = 'startup' | 'user-action' | 'import' | 'sync'

export interface BackupData {
  version: number
  exportedAt: string
  games: CanonicalGame[]
  journeys: Journey[]
  logs: JourneyLogEntry[]
  earnedTrophies?: EarnedTrophy[]
}

export interface SyncSnapshot {
  games: Game[]
  logs: LogEntry[]
  earnedTrophies: EarnedTrophy[]
}

export interface SyncUser {
  id: number
  email: string | null
  displayName: string | null
}

export interface SyncCapabilities {
  reviewDraft: boolean
  igdbMetadata?: boolean
}

export interface SyncConnectionResponse {
  version?: number
  user: SyncUser
  capabilities: SyncCapabilities
}

export interface SyncResponse extends SyncSnapshot {
  syncedAt: string
}

export interface ReviewDraftResponse {
  gameId: string
  draft: string
}

export type BackupImportMode = 'merge' | 'replace'

export type FeedbackTone = 'success' | 'error' | 'info'

export interface FeedbackState {
  id: number
  message: string
  tone: FeedbackTone
}

export interface LibraryCsvImportResult {
  created: number
  updated: number
  skipped: number
}

export interface GameFormState {
  id: string | null
  title: string
  status: GameStatus
  rating: string
  playTimeHours: string
  platform: string
  ownershipType: '' | GameOwnershipType
  tags: string
  igdbId: string
  wikidataId: string
  wikipediaTitle: string
  coverSourceUrl: string
  coverSourcePageUrl: string
  releaseYear: string
  priority: '' | GamePriority
  developer: string
  publisher: string
  coverUrl: string
  review: string
  finishedAt: string
  pausedAt: string
  nudgeAt: string
}
