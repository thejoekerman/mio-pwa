export function wikidataEntityIdsFromClaims(payload: unknown, property: string) {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const claims = (payload as { claims?: Record<string, unknown[]> }).claims?.[property]

  if (!Array.isArray(claims)) {
    return []
  }

  return claims
    .map((claim) => {
      const value = (claim as {
        mainsnak?: { datavalue?: { value?: { id?: unknown } } }
      }).mainsnak?.datavalue?.value

      return typeof value?.id === 'string' ? value.id : ''
    })
    .filter(Boolean)
}

export function wikidataReleaseYearFromClaims(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const claims = (payload as { claims?: { P577?: unknown[] } }).claims?.P577

  if (!Array.isArray(claims) || claims.length === 0) {
    return null
  }

  const timeValue = (claims[0] as {
    mainsnak?: { datavalue?: { value?: { time?: unknown } } }
  }).mainsnak?.datavalue?.value?.time

  if (typeof timeValue !== 'string') {
    return null
  }

  // Wikidata time format: +YYYY-MM-DDT00:00:00Z
  const year = Number.parseInt(timeValue.slice(1, 5), 10)
  const nextYear = new Date().getFullYear() + 1

  return Number.isInteger(year) && year >= 1970 && year <= nextYear ? year : null
}

export function wikidataEntityLabelMap(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const entities = (payload as { entities?: Record<string, unknown> }).entities

  if (!entities) {
    return {}
  }

  const result: Record<string, string> = {}

  for (const [id, entity] of Object.entries(entities)) {
    const label = (entity as { labels?: { en?: { value?: unknown } } }).labels?.en?.value

    if (typeof label === 'string') {
      result[id] = label
    }
  }

  return result
}

export function tagsFromGenreLabel(label: string) {
  const normalizedLabel = label.toLowerCase()
  const tags: string[] = []

  if (normalizedLabel.includes('japanese role-playing')) {
    tags.push('JRPG')
  } else if (normalizedLabel.includes('role-playing')) {
    tags.push('RPG')
  }

  if (normalizedLabel.includes('survival horror') || normalizedLabel.includes('horror')) {
    tags.push('Horror')
  }

  if (normalizedLabel.includes('action')) {
    tags.push('Action')
  }

  if (normalizedLabel.includes('adventure')) {
    tags.push('Adventure')
  }

  if (normalizedLabel.includes('strategy')) {
    tags.push('Strategy')
  }

  if (normalizedLabel.includes('tactical') || normalizedLabel.includes('tactics')) {
    tags.push('Tactical')
  }

  if (normalizedLabel.includes('roguelike')) {
    tags.push('Roguelike')
  }

  if (normalizedLabel.includes('metroidvania')) {
    tags.push('Metroidvania')
  }

  if (normalizedLabel.includes('puzzle')) {
    tags.push('Puzzle')
  }

  if (normalizedLabel.includes('simulation') || normalizedLabel.includes('simulator')) {
    tags.push('Simulation')
  }

  if (normalizedLabel.includes('fighting')) {
    tags.push('Fighting')
  }

  if (normalizedLabel.includes('platform')) {
    tags.push('Platformer')
  }

  if (normalizedLabel.includes('shooter') || normalizedLabel.includes('shoot')) {
    tags.push('Shooter')
  }

  if (normalizedLabel.includes('racing')) {
    tags.push('Racing')
  }

  if (normalizedLabel.includes('sports')) {
    tags.push('Sports')
  }

  if (normalizedLabel.includes('visual novel')) {
    tags.push('Visual Novel')
  }

  if (normalizedLabel.includes('stealth')) {
    tags.push('Stealth')
  }

  if (normalizedLabel.includes('soulslike')) {
    tags.push('Soulslike')
  }

  if (normalizedLabel.includes('indie')) {
    tags.push('Indie')
  }

  return tags
}
