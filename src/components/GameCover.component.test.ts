import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { CoverShape } from '../types'

const state = vi.hoisted(() => ({ settings: {} as { coverShape: CoverShape } }))
vi.mock('../composables/useSettings', () => ({ useSettings: () => state }))

import GameCover from './GameCover.vue'

describe('GameCover shape changes', () => {
  beforeEach(() => {
    state.settings = reactive({ coverShape: 'portrait' })
  })

  it('adapts already-loaded artwork when the frame changes', async () => {
    const wrapper = mount(GameCover, { props: { title: 'Game', coverUrl: '/cover.jpg' } })
    const image = wrapper.get('img')
    Object.defineProperties(image.element, {
      naturalWidth: { value: 300 },
      naturalHeight: { value: 400 },
    })
    await image.trigger('load')
    expect(wrapper.classes()).not.toContain('game-cover--contained-source')

    state.settings.coverShape = 'square'
    await nextTick()
    expect(wrapper.classes()).toContain('game-cover--contained-source')
    expect(wrapper.attributes('style')).toContain('--cover-ratio: 1')
    expect(image.classes()).toContain('loaded')

    state.settings.coverShape = 'portrait'
    await nextTick()
    expect(wrapper.classes()).not.toContain('game-cover--contained-source')
    wrapper.unmount()
  })

  it('contains landscape artwork in either shape', async () => {
    const wrapper = mount(GameCover, { props: { title: 'Game', coverUrl: '/wide.jpg' } })
    const image = wrapper.get('img')
    Object.defineProperties(image.element, {
      naturalWidth: { value: 800 },
      naturalHeight: { value: 450 },
    })
    await image.trigger('load')
    expect(wrapper.classes()).toContain('game-cover--contained-source')
    state.settings.coverShape = 'square'
    await nextTick()
    expect(wrapper.classes()).toContain('game-cover--contained-source')
    wrapper.unmount()
  })
})
