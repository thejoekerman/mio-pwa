import { describe, it, expect } from 'vitest'
import { normalizeReleaseYear, getDisplayDeveloper, getDisplayPublisher } from './gameMetadata'
import type { Game } from '../types'

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'test-id',
    title: 'Test Game',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
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

describe('normalizeReleaseYear', () => {
  it('returns null for empty string', () => {
    expect(normalizeReleaseYear('')).toBeNull()
  })

  it('returns null for whitespace', () => {
    expect(normalizeReleaseYear('   ')).toBeNull()
  })

  it('parses a valid year', () => {
    expect(normalizeReleaseYear('2023')).toBe(2023)
  })

  it('returns null for year before 1970', () => {
    expect(normalizeReleaseYear('1969')).toBeNull()
  })

  it('returns null for a far future year', () => {
    expect(normalizeReleaseYear('2099')).toBeNull()
  })

  it('strips non-digits before parsing', () => {
    expect(normalizeReleaseYear('2023!')).toBe(2023)
  })

  it('returns null for non-numeric input', () => {
    expect(normalizeReleaseYear('abc')).toBeNull()
  })
})

describe('getDisplayDeveloper', () => {
  it('returns manual developer when set', () => {
    expect(getDisplayDeveloper(makeGame({ developer: 'Capcom' }))).toBe('Capcom')
  })

  it('returns empty string when no developer is set', () => {
    expect(getDisplayDeveloper(makeGame({ developer: null }))).toBe('')
  })
})

describe('getDisplayPublisher', () => {
  it('returns manual publisher when set', () => {
    expect(getDisplayPublisher(makeGame({ publisher: 'Capcom' }))).toBe('Capcom')
  })

  it('returns empty string when no publisher is set', () => {
    expect(getDisplayPublisher(makeGame({ publisher: null }))).toBe('')
  })
})
