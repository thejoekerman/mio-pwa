import {
  tagsFromGenreLabel,
  wikidataEntityIdsFromClaims,
  wikidataEntityLabelMap,
  wikidataReleaseYearFromClaims,
} from './wikidataUtils'

export interface WikidataGameSuggestion {
  id: string
  title: string
  description: string
  developer: string | null
  releaseYear: number | null
}

export interface WikidataGameMetadata {
  tags: string[]
  developer: string | null
  publisher: string | null
  releaseYear: number | null
}

const EMPTY_METADATA: WikidataGameMetadata = {
  tags: [],
  developer: null,
  publisher: null,
  releaseYear: null,
}

export async function searchWikidataGames(
  title: string,
  signal?: AbortSignal,
): Promise<WikidataGameSuggestion[]> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    format: 'json',
    language: 'en',
    uselang: 'en',
    origin: '*',
    limit: '8',
    search: title,
  })
  const response = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error('Wikidata search failed.')
  }

  const payload = await response.json() as { search?: unknown[] }
  const suggestions = Array.isArray(payload.search)
    ? payload.search.flatMap(wikidataSuggestionFromEntity).slice(0, 4)
    : []

  return enrichWikidataSuggestions(suggestions, signal)
}

export async function getWikidataGameMetadata(itemId: string): Promise<WikidataGameMetadata> {
  try {
    const claimsParams = new URLSearchParams({
      action: 'wbgetclaims',
      format: 'json',
      origin: '*',
      entity: itemId,
    })
    const claimsResponse = await fetch(`https://www.wikidata.org/w/api.php?${claimsParams.toString()}`)

    if (!claimsResponse.ok) {
      return { ...EMPTY_METADATA }
    }

    const claimsData = await claimsResponse.json()
    const genreIds = wikidataEntityIdsFromClaims(claimsData, 'P136').slice(0, 6)
    const developerIds = wikidataEntityIdsFromClaims(claimsData, 'P178').slice(0, 1)
    const publisherIds = wikidataEntityIdsFromClaims(claimsData, 'P123').slice(0, 1)
    const releaseYear = wikidataReleaseYearFromClaims(claimsData)
    const entityIds = [...genreIds, ...developerIds, ...publisherIds]

    if (entityIds.length === 0) {
      return { ...EMPTY_METADATA, releaseYear }
    }

    const labelParams = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      languages: 'en',
      languagefallback: '1',
      origin: '*',
      props: 'labels',
      ids: entityIds.join('|'),
    })
    const labelResponse = await fetch(`https://www.wikidata.org/w/api.php?${labelParams.toString()}`)

    if (!labelResponse.ok) {
      return { ...EMPTY_METADATA, releaseYear }
    }

    const labelMap = wikidataEntityLabelMap(await labelResponse.json())
    const tags = [
      ...new Set(
        genreIds
          .map((id) => labelMap[id])
          .filter((label): label is string => Boolean(label))
          .flatMap(tagsFromGenreLabel),
      ),
    ].slice(0, 3)

    return {
      tags,
      developer: developerIds.length > 0 ? (labelMap[developerIds[0]] ?? null) : null,
      publisher: publisherIds.length > 0 ? (labelMap[publisherIds[0]] ?? null) : null,
      releaseYear,
    }
  } catch {
    return { ...EMPTY_METADATA }
  }
}

function wikidataSuggestionFromEntity(entity: unknown): WikidataGameSuggestion[] {
  if (!entity || typeof entity !== 'object') {
    return []
  }

  const record = entity as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : ''
  const title = typeof record.label === 'string' ? record.label : ''
  const description = typeof record.description === 'string' ? record.description : ''

  if (!id || !title || !isLikelyVideoGameDescription(description)) {
    return []
  }

  return [{ id, title, description, developer: null, releaseYear: null }]
}

function isLikelyVideoGameDescription(description: string) {
  return (
    /video game|computer game/i.test(description) &&
    !/soundtrack|podcast|film|theme/i.test(description)
  )
}

async function enrichWikidataSuggestions(
  suggestions: WikidataGameSuggestion[],
  signal?: AbortSignal,
) {
  if (suggestions.length === 0) {
    return suggestions
  }

  try {
    const claimsParams = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      origin: '*',
      props: 'claims',
      ids: suggestions.map(({ id }) => id).join('|'),
    })
    const claimsResponse = await fetch(`https://www.wikidata.org/w/api.php?${claimsParams.toString()}`, {
      signal,
    })

    if (!claimsResponse.ok) {
      return suggestions
    }

    const claimsPayload = await claimsResponse.json() as { entities?: Record<string, unknown> }
    const detailsById = new Map(
      suggestions.map(({ id }) => {
        const entity = claimsPayload.entities?.[id]
        const claims = entity && typeof entity === 'object' && 'claims' in entity
          ? { claims: (entity as { claims: unknown }).claims }
          : null

        return [id, {
          developerId: wikidataEntityIdsFromClaims(claims, 'P178')[0] ?? null,
          releaseYear: wikidataReleaseYearFromClaims(claims),
        }] as const
      }),
    )
    const developerIds = [
      ...new Set(
        [...detailsById.values()]
          .map(({ developerId }) => developerId)
          .filter((id): id is string => id !== null),
      ),
    ]
    let developerLabels: Record<string, string> = {}

    if (developerIds.length > 0) {
      const labelParams = new URLSearchParams({
        action: 'wbgetentities',
        format: 'json',
        languages: 'en',
        languagefallback: '1',
        origin: '*',
        props: 'labels',
        ids: developerIds.join('|'),
      })
      const labelResponse = await fetch(`https://www.wikidata.org/w/api.php?${labelParams.toString()}`, {
        signal,
      })

      if (labelResponse.ok) {
        developerLabels = wikidataEntityLabelMap(await labelResponse.json())
      }
    }

    return suggestions.map((suggestion) => {
      const details = detailsById.get(suggestion.id)

      return {
        ...suggestion,
        developer: details?.developerId ? (developerLabels[details.developerId] ?? null) : null,
        releaseYear: details?.releaseYear ?? null,
      }
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return suggestions
  }
}
