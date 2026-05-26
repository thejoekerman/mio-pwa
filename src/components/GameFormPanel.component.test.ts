import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
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
      canUseIgdbMetadata: true,
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
})
