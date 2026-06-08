import type { GameDisplayStatus, Journey } from '../types'

const ACTIVE_STATUSES = new Set<Journey['status']>(['playing', 'ongoing'])
const TERMINAL_STATUSES = new Set<Journey['status']>(['finished', 'abandoned'])

export function getCurrentJourney(journeys: Journey[]): Journey | null {
  const visibleJourneys = journeys.filter((journey) => journey.deletedAt === null)

  return newestJourney(visibleJourneys.filter((journey) => ACTIVE_STATUSES.has(journey.status)))
    ?? newestJourney(visibleJourneys.filter((journey) => journey.status === 'paused'))
    ?? newestJourney(visibleJourneys.filter((journey) => journey.status === 'backlog'))
    ?? newestJourney(visibleJourneys.filter((journey) => TERMINAL_STATUSES.has(journey.status)))
}

export function getGameDisplayStatus(journeys: Journey[]): GameDisplayStatus | null {
  const currentJourney = getCurrentJourney(journeys)

  if (!currentJourney) {
    return null
  }

  const hasFinishedJourney = journeys.some(
    (journey) => journey.deletedAt === null && journey.status === 'finished',
  )

  return hasFinishedJourney && ACTIVE_STATUSES.has(currentJourney.status)
    ? 'replaying'
    : currentJourney.status
}

export function hasActiveJourney(journeys: Journey[]) {
  return journeys.some(
    (journey) => journey.deletedAt === null && ACTIVE_STATUSES.has(journey.status),
  )
}

function newestJourney(journeys: Journey[]) {
  return journeys.reduce<Journey | null>((newest, journey) => {
    if (!newest) {
      return journey
    }

    return journey.updatedAt > newest.updatedAt ? journey : newest
  }, null)
}
