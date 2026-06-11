import { describe, it, expect } from 'vitest'
import { evaluateTrophies as evaluateJourneyTrophies } from './trophies'
import type { Game, Journey, LogEntry, EarnedTrophy } from '../types'

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Test Game',
    status: 'playing',
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
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    gameId: 'game-1',
    content: 'Playing this game',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeJourney(game: Game, overrides: Partial<Journey> = {}): Journey {
  return {
    id: `${game.id}:journey`,
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

function evaluateTrophies(games: Game[], logs: LogEntry[], earnedTrophies: EarnedTrophy[]) {
  return evaluateJourneyTrophies(games, games.map((game) => makeJourney(game)), logs, earnedTrophies)
}

function makeEarned(trophyId: string): EarnedTrophy {
  return {
    id: `trophy-${trophyId}`,
    trophyId,
    earnedAt: '2024-01-01T00:00:00.000Z',
    gameId: null,
    context: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
  }
}

function earnedIds(trophies: EarnedTrophy[]) {
  return trophies.map((t) => t.trophyId)
}

describe('evaluateTrophies', () => {
  it('returns no trophies for empty library', () => {
    expect(evaluateTrophies([], [], [])).toHaveLength(0)
  })

  it('awards first-log on first play log', () => {
    const result = evaluateTrophies([makeGame()], [makeLog()], [])
    expect(earnedIds(result)).toContain('first-log')
  })

  it('does not re-award already earned trophies', () => {
    const result = evaluateTrophies([makeGame()], [makeLog()], [makeEarned('first-log')])
    expect(earnedIds(result)).not.toContain('first-log')
  })

  it('awards first-finish when a game is finished', () => {
    const game = makeGame({ status: 'finished', finishedAt: '2024-06-01' })
    const result = evaluateTrophies([game], [], [])
    expect(earnedIds(result)).toContain('first-finish')
  })

  it('does not award first-finish for non-finished games', () => {
    const result = evaluateTrophies([makeGame({ status: 'playing' })], [], [])
    expect(earnedIds(result)).not.toContain('first-finish')
  })

  it('awards dear-diary at 10 logs', () => {
    const logs = Array.from({ length: 10 }, (_, i) =>
      makeLog({ id: `log-${i}`, createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    )
    const result = evaluateTrophies([makeGame()], logs, [])
    expect(earnedIds(result)).toContain('dear-diary')
  })

  it('does not award dear-diary below 10 logs', () => {
    const logs = Array.from({ length: 9 }, (_, i) => makeLog({ id: `log-${i}` }))
    const result = evaluateTrophies([makeGame()], logs, [])
    expect(earnedIds(result)).not.toContain('dear-diary')
  })

  it('awards first-review when a game has a review', () => {
    const game = makeGame({ review: 'A masterpiece.' })
    const result = evaluateTrophies([game], [], [])
    expect(earnedIds(result)).toContain('first-review')
  })

  it('awards strong-feelings for a game rated 9 or above', () => {
    const game = makeGame({ rating: 9 })
    const result = evaluateTrophies([game], [], [])
    expect(earnedIds(result)).toContain('strong-feelings')
  })

  it('does not award strong-feelings for rating below 9', () => {
    const game = makeGame({ rating: 8 })
    const result = evaluateTrophies([game], [], [])
    expect(earnedIds(result)).not.toContain('strong-feelings')
  })

  it('awards shelf-curator at 25 games', () => {
    const games = Array.from({ length: 25 }, (_, i) => makeGame({ id: `game-${i}` }))
    const result = evaluateTrophies(games, [], [])
    expect(earnedIds(result)).toContain('shelf-curator')
  })

  it('ignores soft-deleted games for trophy evaluation', () => {
    const games = Array.from({ length: 25 }, (_, i) =>
      makeGame({ id: `game-${i}`, deletedAt: '2024-01-01T00:00:00.000Z' }),
    )
    const result = evaluateTrophies(games, [], [])
    expect(earnedIds(result)).not.toContain('shelf-curator')
  })

  it('ignores soft-deleted logs for trophy evaluation', () => {
    const log = makeLog({ deletedAt: '2024-01-01T00:00:00.000Z' })
    const result = evaluateTrophies([makeGame()], [log], [])
    expect(earnedIds(result)).not.toContain('first-log')
  })

  it('counts replay completions toward finish trophies', () => {
    const game = makeGame({ id: 'favorite' })
    const journeys = Array.from({ length: 10 }, (_, index) =>
      makeJourney(game, {
        id: `journey-${index}`,
        status: 'finished',
        finishedAt: `2024-01-${String(index + 1).padStart(2, '0')}`,
      }),
    )
    const result = evaluateJourneyTrophies([game], journeys, [], [])

    expect(earnedIds(result)).toContain('first-finish')
    expect(earnedIds(result)).toContain('credits-rolled')
  })

  it('counts Journey reviews and ratings while shelf trophies count unique Games', () => {
    const game = makeGame({ id: 'favorite' })
    const journeys = Array.from({ length: 3 }, (_, index) =>
      makeJourney(game, {
        id: `journey-${index}`,
        review: `Review ${index}`,
        rating: 10,
      }),
    )
    const result = evaluateJourneyTrophies([game], journeys, [], [])

    expect(earnedIds(result)).toContain('critic-notes')
    expect(earnedIds(result)).toContain('strong-feelings')
    expect(earnedIds(result)).not.toContain('shelf-curator')
  })
})
