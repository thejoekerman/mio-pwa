import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import GameFormPanel from './GameFormPanel.vue'
import type { GameFormState } from '../types'

function createForm(overrides: Partial<GameFormState> = {}): GameFormState {
  return {
    id: 'game-1',
    title: 'Chrono Trigger',
    status: 'backlog',
    rating: '',
    playTimeHours: '',
    platform: '',
    ownershipType: '',
    tags: '',
    igdbId: '',
    wikidataId: '',
    wikipediaTitle: '',
    coverSourceUrl: '',
    coverSourcePageUrl: '',
    releaseYear: '',
    priority: '',
    developer: '',
    publisher: '',
    coverUrl: '',
    review: '',
    finishedAt: '',
    pausedAt: '',
    nudgeAt: '',
    ...overrides,
  }
}

const FormControlStub = defineComponent({
  name: 'FormControlStub',
  props: {
    label: {
      type: String,
      default: '',
    },
    modelValue: {
      type: [String, Number, Array],
      default: '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        h('span', props.label),
        h('input', {
          'data-field': props.label,
          value: Array.isArray(props.modelValue)
            ? props.modelValue.join(', ')
            : String(props.modelValue ?? ''),
          onInput: (event: Event) => {
            emit('update:modelValue', (event.target as HTMLInputElement).value)
          },
        }),
      ])
  },
})

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  emits: ['click'],
  setup(_, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          type: attrs.type ?? 'button',
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      )
  },
})

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

function mountForm(form = reactive(createForm())) {
  return mount(GameFormPanel, {
    props: {
      canRateCurrentStatus: true,
      form,
      isSaving: false,
    },
    global: {
      stubs: {
        VBtn: ButtonStub,
        VCombobox: FormControlStub,
        VExpansionPanel: PassthroughStub,
        VExpansionPanels: PassthroughStub,
        VExpansionPanelText: PassthroughStub,
        VExpansionPanelTitle: PassthroughStub,
        VSelect: FormControlStub,
        VTextarea: FormControlStub,
        VTextField: FormControlStub,
      },
    },
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('GameFormPanel', () => {
  it('keeps text field edits connected to the shared form model', async () => {
    const form = reactive(createForm())
    const wrapper = mountForm(form)

    await wrapper.get('[data-field="Title"]').setValue('Final Fantasy IX')
    await wrapper.get('[data-field="Rating"]').setValue('9')
    await wrapper.get('[data-field="Play time"]').setValue('42.5')

    expect(form.title).toBe('Final Fantasy IX')
    expect(form.rating).toBe('9')
    expect(form.playTimeHours).toBe('42.5')
  })

  it('updates platform and tags through the combobox update path', async () => {
    const form = reactive(createForm())
    const wrapper = mountForm(form)
    const comboboxes = wrapper.findAllComponents(FormControlStub)

    await comboboxes.find((control) => control.props('label') === 'Platform')?.vm.$emit(
      'update:modelValue',
      'Steam Deck',
    )
    await comboboxes.find((control) => control.props('label') === 'Tags')?.vm.$emit(
      'update:modelValue',
      ['jrpg', 'cozy', 'jrpg'],
    )

    expect(form.platform).toBe('Steam Deck')
    expect(form.tags).toBe('jrpg, cozy')
  })

  it('emits save, cancel, and delete events for the parent view', async () => {
    const wrapper = mountForm()

    await wrapper.get('form').trigger('submit')
    await wrapper.get('.form-back-button').trigger('click')
    await wrapper.get('.form-danger-zone button').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

  it('shows status-specific fields from the current form state', () => {
    expect(mountForm(reactive(createForm({ status: 'finished' }))).find('[data-field="Finished on"]').exists()).toBe(true)
    expect(mountForm(reactive(createForm({ status: 'paused' }))).find('[data-field="Nudge me"]').exists()).toBe(true)
    expect(mountForm(reactive(createForm({ id: null }))).find('[data-field="Review"]').exists()).toBe(false)
  })

  it('offers local metadata lookup while editing without exposing the legacy IGDB field', () => {
    const wrapper = mountForm()

    expect(wrapper.text()).toContain('Find metadata')
    expect(wrapper.find('[data-field="IGDB ID"]').exists()).toBe(false)
  })

  it('links an explicitly selected Wikidata identity without renaming an existing Game', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          search: [{ id: 'Q123', label: 'Provider title', description: 'video game' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ entities: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ claims: {} }),
      }))
    const form = reactive(createForm({ title: 'My preferred title' }))
    const wrapper = mountForm(form)

    await wrapper.get('.metadata-assistant-action').trigger('click')
    await vi.runAllTimersAsync()
    await wrapper.get('.wikidata-suggestion').trigger('click')

    expect(form.title).toBe('My preferred title')
    expect(form.wikidataId).toBe('Q123')
  })

  it('shows a distinct empty result after a successful metadata search', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ search: [] }),
    }))
    const wrapper = mountForm()

    await wrapper.get('.metadata-assistant-action').trigger('click')
    await vi.runAllTimersAsync()

    expect(wrapper.text()).toContain('No likely game matches found')
    expect(wrapper.text()).not.toContain('Could not load title suggestions')
  })

  it('shows candidate disambiguation without repeating the release year', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          search: [{ id: 'Q123', label: 'Provider title', description: '1997 video game' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          entities: {
            Q123: {
              claims: {
                P178: [{ mainsnak: { datavalue: { value: { id: 'Q-developer' } } } }],
                P577: [{ mainsnak: { datavalue: { value: { time: '+1997-01-01T00:00:00Z' } } } }],
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          entities: {
            'Q-developer': { labels: { en: { value: 'Mio Studio' } } },
          },
        }),
      }))
    const wrapper = mountForm()

    await wrapper.get('.metadata-assistant-action').trigger('click')
    await vi.runAllTimersAsync()

    expect(wrapper.get('.wikidata-suggestion small').text()).toBe('1997 · Mio Studio · video game')
  })

  it('previews a Wikipedia cover and applies it only after explicit confirmation', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          search: [{ id: 'Q123', label: 'Provider title', description: 'video game' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ entities: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ claims: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          entities: {
            Q123: {
              sitelinks: {
                enwiki: {
                  title: 'Provider title',
                  url: 'https://en.wikipedia.org/wiki/Provider_title',
                },
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          originalimage: { source: 'https://upload.wikimedia.org/provider-title.png' },
        }),
      }))
    const form = reactive(createForm({ coverUrl: 'https://example.test/current.png' }))
    const wrapper = mountForm(form)

    await wrapper.get('.metadata-assistant-action').trigger('click')
    await vi.runAllTimersAsync()
    await wrapper.get('.wikidata-suggestion').trigger('click')
    await vi.runAllTimersAsync()

    expect(form.coverUrl).toBe('https://example.test/current.png')
    expect(wrapper.find('.metadata-cover-suggestion').exists()).toBe(true)

    await wrapper.get('.metadata-cover-suggestion button').trigger('click')

    expect(form.coverUrl).toBe('https://upload.wikimedia.org/provider-title.png')
    expect(form.coverSourcePageUrl).toBe('https://en.wikipedia.org/wiki/Provider_title')
    expect(form.wikipediaTitle).toBe('Provider title')
  })

  it('updates status through the select model path and reacts to conditional fields', async () => {
    const form = reactive(createForm({ status: 'backlog' }))
    const wrapper = mountForm(form)
    const statusControl = wrapper.findAllComponents(FormControlStub).find((control) =>
      control.props('label') === 'Status'
    )

    await statusControl?.vm.$emit('update:modelValue', 'finished')

    expect(form.status).toBe('finished')
    expect(wrapper.find('[data-field="Finished on"]').exists()).toBe(true)
    expect(wrapper.find('[data-field="Nudge me"]').exists()).toBe(false)

    await statusControl?.vm.$emit('update:modelValue', 'paused')

    expect(form.status).toBe('paused')
    expect(wrapper.find('[data-field="Finished on"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="Nudge me"]').exists()).toBe(true)
  })
})
