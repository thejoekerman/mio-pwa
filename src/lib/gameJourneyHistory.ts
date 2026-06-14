import type { Journey, JourneyLogEntry } from '../types'

export function getLifetimePlayTime(journeys: Journey[]) {
  const hours = journeys.reduce((total, journey) => total + (journey.playTimeHours ?? 0), 0)

  return journeys.length > 1 && hours > 0 ? Math.round(hours * 10) / 10 : null
}

export function groupJourneyLogs(journeys: Journey[], logs: JourneyLogEntry[]) {
  return journeys
    .map((journey) => ({
      journey,
      logs: logs
        .filter((log) => log.journeyId === journey.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    }))
    .filter((group) => group.logs.length > 0)
}
