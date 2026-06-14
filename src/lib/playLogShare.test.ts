import { describe, expect, it } from 'vitest'
import {
  createPlayLogShareText,
  DEFAULT_PLAY_LOG_SHARE_TEMPLATE,
  renderPlayLogShareText,
} from './playLogShare'

describe('playLogShare', () => {
  it('renders the default template', () => {
    expect(renderPlayLogShareText(DEFAULT_PLAY_LOG_SHARE_TEMPLATE, {
      title: 'Citizen Sleeper',
      log: 'That ending landed.',
      platform: 'Switch',
      status: 'Finished',
      hashtags: '#games #miolog',
    })).toBe('Citizen Sleeper\n\nThat ending landed.\n\n#games #miolog')
  })

  it('keeps unknown placeholders as user-authored text and removes excess blank lines', () => {
    expect(renderPlayLogShareText('{title}\n\n{platform}\n\n{unknown}\n\n{hashtags}', {
      title: 'Tunic',
      log: '',
      platform: '',
      status: 'Playing',
      hashtags: '',
    })).toBe('Tunic\n\n{unknown}')
  })

  it('creates share text from a game and log', () => {
    expect(createPlayLogShareText({
      game: {
        id: 'g1',
        title: 'Pentiment',
        status: 'playing',
        rating: null,
        playTimeHours: null,
        review: '',
        platform: 'PC',
        ownershipType: null,
        tags: [],
        finishedAt: null,
        pausedAt: null,
        nudgeAt: null,
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
      hashtags: '#games',
      log: { content: '  Margarete knows everything.  ' },
      status: 'Playing',
      template: '{title} · {platform} · {status}\n\n{log}\n\n{hashtags}',
    })).toBe('Pentiment · PC · Playing\n\nMargarete knows everything.\n\n#games')
  })
})
