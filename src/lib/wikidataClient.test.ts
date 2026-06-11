import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWikidataGameMetadata, searchWikidataGames } from './wikidataClient'

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchWikidataGames', () => {
  it('returns only likely video games and limits the visible candidates', async () => {
    const search = [
      { id: 'Q1', label: 'Game One', description: '2020 video game' },
      { id: 'Q2', label: 'Game Two', description: 'computer game' },
      { id: 'Q3', label: 'Game Three', description: 'video game' },
      { id: 'Q4', label: 'Game Four', description: 'video game' },
      { id: 'Q5', label: 'Game Five', description: 'video game' },
      { id: 'Q6', label: 'Game soundtrack', description: 'video game soundtrack' },
      { id: 'Q7', label: 'Unrelated', description: 'novel' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ search })))

    const suggestions = await searchWikidataGames('Game')

    expect(suggestions.map(({ id }) => id)).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('search=Game'), {
      signal: undefined,
    })
  })

  it('throws when Wikidata search fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)))

    await expect(searchWikidataGames('Game')).rejects.toThrow('Wikidata search failed.')
  })
})

describe('getWikidataGameMetadata', () => {
  it('resolves canonical metadata from claims and entity labels', async () => {
    const claims = {
      claims: {
        P136: [
          { mainsnak: { datavalue: { value: { id: 'Q-action' } } } },
          { mainsnak: { datavalue: { value: { id: 'Q-rpg' } } } },
        ],
        P178: [{ mainsnak: { datavalue: { value: { id: 'Q-developer' } } } }],
        P123: [{ mainsnak: { datavalue: { value: { id: 'Q-publisher' } } } }],
        P577: [{ mainsnak: { datavalue: { value: { time: '+2005-10-25T00:00:00Z' } } } }],
      },
    }
    const entities = {
      entities: {
        'Q-action': { labels: { en: { value: 'action-adventure game' } } },
        'Q-rpg': { labels: { en: { value: 'role-playing video game' } } },
        'Q-developer': { labels: { en: { value: 'Mio Studio' } } },
        'Q-publisher': { labels: { en: { value: 'Mayu Publishing' } } },
      },
    }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(claims))
      .mockResolvedValueOnce(jsonResponse(entities)))

    await expect(getWikidataGameMetadata('Q-game')).resolves.toEqual({
      tags: ['Action', 'Adventure', 'RPG'],
      developer: 'Mio Studio',
      publisher: 'Mayu Publishing',
      releaseYear: 2005,
    })
  })

  it('returns empty metadata when Wikidata is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(getWikidataGameMetadata('Q-game')).resolves.toEqual({
      tags: [],
      developer: null,
      publisher: null,
      releaseYear: null,
    })
  })
})
