import type { Game, LogEntry } from '../types'

const createdBase = '2026-05-01T10:00:00.000Z'

function game(
  id: string,
  title: string,
  status: Game['status'],
  overrides: Partial<Game> = {},
): Game {
  return {
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
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: createdBase,
    coverUrl: null,
    updatedAt: createdBase,
    deletedAt: null,
    ...overrides,
  }
}

function log(id: string, gameId: string, content: string, createdAt: string): LogEntry {
  return {
    id,
    gameId,
    content,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }
}

export const demoGames: Game[] = [
  game('demo-game-va-11-hall-a', 'VA-11 HALL-A: Cyberpunk Bartender Action', 'playing', {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2z8k.webp',
    platform: 'Steam',
    tags: ['Narrative', 'Indie', 'Cozy'],
    playTimeHours: null,
    review: '',
    createdAt: '2026-04-29T19:30:00.000Z',
    updatedAt: '2026-05-08T20:20:00.000Z',
  }),
  game('demo-game-tekken-8', 'Tekken 8', 'playing', {
    coverUrl: null,
    platform: 'PS5',
    tags: ['Action'],
    playTimeHours: null,
    review: '',
    createdAt: '2026-04-26T15:10:00.000Z',
    updatedAt: '2026-05-07T21:10:00.000Z',
  }),
    game('demo-game-after-the-stream-went-dark', 'After the Stream Went Dark', 'backlog', {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cobtw4.webp',
    platform: 'Steam',
    tags: ['VN', 'Adventure'],
    playTimeHours: null,
    review: '',
    createdAt: '2026-04-26T15:10:00.000Z',
    updatedAt: '2026-05-07T21:10:00.000Z',
  }),
  game('demo-game-rune-factory-azuma', 'Rune Factory: Guardians of Azuma', 'backlog', {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co99yd.webp',
    platform: 'Switch',
    tags: ['JRPG', 'Cozy', 'Adventure'],
    review: '',
    createdAt: '2026-05-06T10:40:00.000Z',
    updatedAt: '2026-05-06T10:40:00.000Z',
  }),
  game('demo-game-arcadia-fallen', 'Arcadia Fallen', 'backlog', {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co8fus.webp',
    platform: 'Steam',
    tags: ['Narrative', 'Indie', 'Cozy'],
    review: '',
    createdAt: '2026-05-04T17:00:00.000Z',
    updatedAt: '2026-05-04T17:00:00.000Z',
  }),
  game('demo-game-atelier-ryza', 'Atelier Ryza: Ever Darkness & the Secret Hideout', 'finished', {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co20uc.webp',
    platform: 'Switch',
    tags: ['RPG', 'Cozy', 'Adventure'],
    rating: 9,
    playTimeHours: 42,
    finishedAt: '2026-04-21',
    review: 'Probably the coziest RPG I have played. Awesome characters, an entertaining story, great mechanics, and battles that stayed fun.',
    createdAt: '2026-04-18T17:30:00.000Z',
    updatedAt: '2026-04-21T22:30:00.000Z',
  }),
  game('demo-game-cyberpunk-2077', 'Cyberpunk 2077', 'finished', {
    coverUrl: null,
    platform: 'PC',
    tags: ['RPG', 'Action', 'Narrative'],
    rating: 9,
    playTimeHours: 78,
    finishedAt: '2026-03-28',
    review: 'A fantastic role-playing experience. Night City is easy to get lost in, and the atmosphere is awesome and breathtaking.',
    createdAt: '2026-02-12T12:20:00.000Z',
    updatedAt: '2026-03-28T23:15:00.000Z',
  }),
  game('demo-game-darksiders-iii', 'Darksiders III', 'finished', {
    coverUrl: null,
    platform: 'PS5',
    tags: ['Action', 'Adventure'],
    rating: 9,
    playTimeHours: 19,
    finishedAt: '2026-02-18',
    review: 'Fury is an interesting protagonist: strong and stoic, but also well-written and nuanced. Combat is fun, and the story kept me invested.',
    createdAt: '2026-01-22T18:30:00.000Z',
    updatedAt: '2026-02-18T21:45:00.000Z',
  }),
]

export const demoLogs: LogEntry[] = [
  log(
    'demo-log-va11halla-1',
    'demo-game-va-11-hall-a',
    'That music is out of this world. I need that soundtrack!',
    '2026-05-08T20:20:00.000Z',
  ),
  log(
    'demo-log-va11halla-2',
    'demo-game-va-11-hall-a',
    'The sprite work is so good. Such cool character designs!',
    '2026-05-06T21:05:00.000Z',
  ),
  log(
    'demo-log-tekken-1',
    'demo-game-tekken-8',
    'That arcade story mode is such a good introduction for new players!',
    '2026-05-07T21:10:00.000Z',
  ),
  log(
    'demo-log-atelier-1',
    'demo-game-atelier-ryza',
    'It is so cozy. I absolutely love the island.',
    '2026-04-21T22:30:00.000Z',
  ),
  log(
    'demo-log-cyberpunk-1',
    'demo-game-cyberpunk-2077',
    'This city feels so alive! And the role playing is so strong.',
    '2026-03-28T23:15:00.000Z',
  ),
  log(
    'demo-log-darksiders-1',
    'demo-game-darksiders-iii',
    'Fury is such a cool character. So well-written, and she evolves!',
    '2026-02-18T21:45:00.000Z',
  ),
]
