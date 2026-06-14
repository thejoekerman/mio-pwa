import type { Game, LogEntry } from '../types'

export const DEFAULT_PLAY_LOG_SHARE_TEMPLATE = `{title}

{log}

{hashtags}`

export const DEFAULT_PLAY_LOG_SHARE_HASHTAGS = '#games'

export interface PlayLogShareValues {
  title: string
  log: string
  platform: string
  status: string
  hashtags: string
}

export function renderPlayLogShareText(template: string, values: PlayLogShareValues) {
  return template
    .replace(/\{(title|log|platform|status|hashtags)\}/g, (_match, key: keyof PlayLogShareValues) =>
      values[key],
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function createPlayLogShareText({
  game,
  hashtags,
  log,
  status,
  template,
}: {
  game: Game
  hashtags: string
  log: Pick<LogEntry, 'content'>
  status: string
  template: string
}) {
  return renderPlayLogShareText(template, {
    title: game.title,
    log: log.content.trim(),
    platform: game.platform.trim(),
    status,
    hashtags: hashtags.trim(),
  })
}
