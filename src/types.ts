export const GAME_STATUSES = [
  'backlog',
  'playing',
  'ongoing',
  'finished',
  'paused',
  'abandoned',
] as const

export type GameStatus = (typeof GAME_STATUSES)[number]

export const APP_LANGUAGES = ['en', 'de'] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]

export const APP_THEMES = ['journal', 'mio'] as const

export type AppTheme = (typeof APP_THEMES)[number]

export const LIBRARY_VIEW_MODES = ['list', 'shelf'] as const

export type LibraryViewMode = (typeof LIBRARY_VIEW_MODES)[number]

export const GAME_OWNERSHIP_TYPES = ['digital', 'physical', 'both'] as const

export type GameOwnershipType = (typeof GAME_OWNERSHIP_TYPES)[number]

export const GAME_OWNERSHIP_FILTERS = ['all', 'digital', 'physical'] as const

export type GameOwnershipFilter = (typeof GAME_OWNERSHIP_FILTERS)[number]

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  ongoing: 'Ongoing',
  finished: 'Finished',
  paused: 'Paused',
  abandoned: 'Abandoned',
}

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

export const GAME_SORT_LABELS: Record<GameSortOption, string> = {
  'created-desc': 'Added newest',
  'created-asc': 'Added oldest',
  'title-asc': 'Title A-Z',
  'developer-asc': 'Developer A-Z',
  'publisher-asc': 'Publisher A-Z',
  'rating-desc': 'Rating high-low',
  'rating-asc': 'Rating low-high',
}

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
  games: Game[]
  logs: LogEntry[]
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
  playNext: boolean
  igdbMetadata?: boolean
}

export interface SyncConnectionResponse {
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

export interface PlayNextRecommendationResponse {
  slot: 'continue' | 'alternate'
  gameId: string
  title: string
  reason: string
}

export interface PlayNextRecommendationsResponse {
  recommendations: PlayNextRecommendationResponse[]
}

export type BackupImportMode = 'merge' | 'replace'

export type FeedbackTone = 'success' | 'error' | 'info'

export interface FeedbackState {
  id: number
  message: string
  tone: FeedbackTone
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
