import { describe, it, expect } from 'vitest'
import { normalizeGame } from './backlogDb'

function validGame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'abc123',
    title: 'Resident Evil 4',
    status: 'playing',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: 'PS5',
    ownershipType: null,
    tags: [],
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('normalizeGame', () => {
  it('passes through a valid game unchanged', () => {
    const game = normalizeGame(validGame())
    expect(game.title).toBe('Resident Evil 4')
    expect(game.status).toBe('playing')
  })

  it('throws when input is not a record', () => {
    expect(() => normalizeGame(null)).toThrow()
    expect(() => normalizeGame('string')).toThrow()
    expect(() => normalizeGame(42)).toThrow()
  })

  it('throws on invalid status', () => {
    expect(() => normalizeGame(validGame({ status: 'unknown' }))).toThrow()
  })

  it('defaults status to backlog when missing', () => {
    const game = normalizeGame(validGame({ status: undefined }))
    expect(game.status).toBe('backlog')
  })

  it('accepts valid ratings 1-10', () => {
    expect(normalizeGame(validGame({ rating: 1 })).rating).toBe(1)
    expect(normalizeGame(validGame({ rating: 10 })).rating).toBe(10)
  })

  it('drops rating 0 to null', () => {
    expect(normalizeGame(validGame({ rating: 0 })).rating).toBeNull()
  })

  it('drops rating above 10 to null', () => {
    expect(normalizeGame(validGame({ rating: 11 })).rating).toBeNull()
    expect(normalizeGame(validGame({ rating: 999 })).rating).toBeNull()
  })

  it('drops negative rating to null', () => {
    expect(normalizeGame(validGame({ rating: -1 })).rating).toBeNull()
  })

  it('drops non-integer rating to null', () => {
    expect(normalizeGame(validGame({ rating: 7.5 })).rating).toBeNull()
  })

  it('drops invalid releaseYear to null', () => {
    expect(normalizeGame(validGame({ releaseYear: 1969 })).releaseYear).toBeNull()
    expect(normalizeGame(validGame({ releaseYear: 2099 })).releaseYear).toBeNull()
    expect(normalizeGame(validGame({ releaseYear: 'text' })).releaseYear).toBeNull()
  })

  it('accepts valid releaseYear', () => {
    expect(normalizeGame(validGame({ releaseYear: 2023 })).releaseYear).toBe(2023)
  })

  it('drops invalid priority to null', () => {
    expect(normalizeGame(validGame({ priority: 'urgent' })).priority).toBeNull()
  })

  it('accepts valid priority', () => {
    expect(normalizeGame(validGame({ priority: 'high-interest' })).priority).toBe('high-interest')
  })

  it('trims and deduplicates tags', () => {
    const game = normalizeGame(validGame({ tags: ['RPG', 'RPG', 'Action'] }))
    expect(game.tags).toContain('RPG')
    expect(game.tags).toContain('Action')
  })

  it('drops non-string tags', () => {
    const game = normalizeGame(validGame({ tags: ['RPG', 42, null] }))
    expect(game.tags).toEqual(['RPG'])
  })

  it('falls back to notes field for review when review is missing', () => {
    const game = normalizeGame(validGame({ review: undefined, notes: 'my notes' }))
    expect(game.review).toBe('my notes')
  })

  it('drops developer whitespace-only string to null', () => {
    expect(normalizeGame(validGame({ developer: '   ' })).developer).toBeNull()
  })
})
