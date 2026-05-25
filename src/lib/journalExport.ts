import type { Game, LogEntry } from '../types'

interface GameJournalMarkdownOptions {
  formatDate: (value: string) => string
  game: Game
  labels: {
    finished: string
    format: string
    noLogs: string
    overview: string
    platform: string
    playLogs: string
    playTime: string
    rating: string
    status: string
    tags: string
  }
  logs: LogEntry[]
  ownershipLabel: string | null
  statusLabel: string
}

function slugifyFilePart(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'game'
}

function cleanInline(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function listItem(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  return `- ${label}: ${value}`
}

export function createGameJournalFileName(game: Game, exportedAt = new Date()) {
  return `miolog-${slugifyFilePart(game.title)}-journal-${exportedAt.toISOString().slice(0, 10)}.md`
}

export function createGameJournalMarkdown({
  formatDate,
  game,
  labels,
  logs,
  ownershipLabel,
  statusLabel,
}: GameJournalMarkdownOptions) {
  const metadata = [
    listItem(labels.status, statusLabel),
    listItem(labels.platform, cleanInline(game.platform)),
    listItem(labels.format, ownershipLabel),
    listItem(labels.rating, game.rating === null ? null : `${game.rating}/10`),
    listItem(labels.playTime, game.playTimeHours === null ? null : `${game.playTimeHours} h`),
    listItem(labels.tags, game.tags.length > 0 ? game.tags.join(', ') : null),
    listItem(labels.finished, game.finishedAt),
  ].filter((entry): entry is string => Boolean(entry))

  const sections = [`# ${cleanInline(game.title)}`]

  if (metadata.length > 0) {
    sections.push([`## ${labels.overview}`, ...metadata].join('\n'))
  }

  // The review is intentionally excluded — the journal copy/export is for play
  // logs; the review has its own dedicated copy button.
  sections.push(
    [
      `## ${labels.playLogs}`,
      logs.length > 0
        ? logs
            .map((log) => [`### ${formatDate(log.createdAt)}`, log.content.trim()].join('\n\n'))
            .join('\n\n')
        : `_${labels.noLogs}_`,
    ].join('\n\n'),
  )

  return `${sections.join('\n\n')}\n`
}

export function downloadMarkdownFile(fileName: string, content: string) {
  const blob = new Blob([content], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
