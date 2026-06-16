import { GAME_STATUSES, type Game, type JourneyLogEntry } from '../types'

export interface ChartPoint {
  label: string
  value: number
}

export function getStatusDistribution(games: Game[]): ChartPoint[] {
  const visible = games.filter((game) => game.deletedAt === null)

  return GAME_STATUSES.map((status) => ({
    label: status,
    value: visible.filter((game) => game.status === status).length,
  })).filter((point) => point.value > 0)
}

export function getPlatformMix(games: Game[], limit = 5): ChartPoint[] {
  const counts = new Map<string, number>()

  for (const game of games) {
    const platform = game.deletedAt === null ? game.platform.trim() : ''
    if (platform) {
      counts.set(platform, (counts.get(platform) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit)
}

export function getBacklogPressure(games: Game[]): ChartPoint[] {
  const visible = games.filter((game) => game.deletedAt === null)
  const activeStatuses = new Set(['playing', 'ongoing'])

  return [
    { label: 'backlog', value: visible.filter((game) => game.status === 'backlog').length },
    { label: 'active', value: visible.filter((game) => activeStatuses.has(game.status)).length },
    { label: 'finished', value: visible.filter((game) => game.status === 'finished').length },
  ].filter((point) => point.value > 0)
}

export function getPlayLogsOverTime(logs: JourneyLogEntry[]): ChartPoint[] {
  const counts = new Map<string, number>()

  for (const log of logs) {
    if (log.deletedAt !== null) {
      continue
    }

    const month = log.createdAt.slice(0, 7)
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
