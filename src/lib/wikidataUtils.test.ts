import { describe, it, expect } from 'vitest'
import {
  wikidataEntityIdsFromClaims,
  wikidataReleaseYearFromClaims,
  wikidataEntityLabelMap,
  tagsFromGenreLabel,
} from './wikidataUtils'

function makeClaims(property: string, ids: string[]) {
  return {
    claims: {
      [property]: ids.map((id) => ({
        mainsnak: { datavalue: { value: { id } } },
      })),
    },
  }
}

describe('wikidataEntityIdsFromClaims', () => {
  it('extracts entity IDs for a given property', () => {
    const payload = makeClaims('P136', ['Q1', 'Q2'])
    expect(wikidataEntityIdsFromClaims(payload, 'P136')).toEqual(['Q1', 'Q2'])
  })

  it('returns empty array for missing property', () => {
    expect(wikidataEntityIdsFromClaims(makeClaims('P136', ['Q1']), 'P178')).toEqual([])
  })

  it('returns empty array for null/invalid input', () => {
    expect(wikidataEntityIdsFromClaims(null, 'P136')).toEqual([])
    expect(wikidataEntityIdsFromClaims('string', 'P136')).toEqual([])
  })
})

describe('wikidataReleaseYearFromClaims', () => {
  function makeTimeClaim(time: string) {
    return { claims: { P577: [{ mainsnak: { datavalue: { value: { time } } } }] } }
  }

  it('extracts year from a valid Wikidata time string', () => {
    expect(wikidataReleaseYearFromClaims(makeTimeClaim('+2005-10-25T00:00:00Z'))).toBe(2005)
  })

  it('returns null when P577 is missing', () => {
    expect(wikidataReleaseYearFromClaims({ claims: {} })).toBeNull()
  })

  it('returns null for year before 1970', () => {
    expect(wikidataReleaseYearFromClaims(makeTimeClaim('+1960-01-01T00:00:00Z'))).toBeNull()
  })

  it('returns null for invalid input', () => {
    expect(wikidataReleaseYearFromClaims(null)).toBeNull()
  })
})

describe('wikidataEntityLabelMap', () => {
  it('builds an id→label map', () => {
    const payload = {
      entities: {
        Q1: { labels: { en: { value: 'Action game' } } },
        Q2: { labels: { en: { value: 'Role-playing game' } } },
      },
    }
    const map = wikidataEntityLabelMap(payload)
    expect(map['Q1']).toBe('Action game')
    expect(map['Q2']).toBe('Role-playing game')
  })

  it('skips entities with no English label', () => {
    const payload = { entities: { Q1: { labels: {} } } }
    expect(wikidataEntityLabelMap(payload)['Q1']).toBeUndefined()
  })

  it('returns empty object for invalid input', () => {
    expect(wikidataEntityLabelMap(null)).toEqual({})
  })
})

describe('tagsFromGenreLabel', () => {
  it('maps role-playing to RPG', () => {
    expect(tagsFromGenreLabel('role-playing video game')).toContain('RPG')
  })

  it('maps japanese role-playing to JRPG not RPG', () => {
    const tags = tagsFromGenreLabel('Japanese role-playing game')
    expect(tags).toContain('JRPG')
    expect(tags).not.toContain('RPG')
  })

  it('maps horror to Horror', () => {
    expect(tagsFromGenreLabel('survival horror')).toContain('Horror')
  })

  it('returns multiple tags for a compound genre', () => {
    const tags = tagsFromGenreLabel('action-adventure game')
    expect(tags).toContain('Action')
    expect(tags).toContain('Adventure')
  })

  it('maps simulator to Simulation', () => {
    expect(tagsFromGenreLabel('walking simulator')).toContain('Simulation')
  })

  it('returns empty array for unrecognised label', () => {
    expect(tagsFromGenreLabel('party game')).toEqual([])
  })
})
