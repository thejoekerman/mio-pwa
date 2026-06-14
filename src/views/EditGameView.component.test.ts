import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'
import EditGameView from './EditGameView.vue'
import type { Game, GameFormState } from '../types'

const routerReplace = vi.hoisted(() => vi.fn())
const addCurrentJourneyToGame = vi.hoisted(() => vi.fn().mockResolvedValue(true))
const saveCurrentGame = vi.hoisted(() => vi.fn())
const existingGame: Game = {
  id: 'existing-game',
  title: 'Existing Game',
  status: 'finished',
  rating: null,
  playTimeHours: null,
  review: '',
  platform: '',
  ownershipType: null,
  tags: [],
  externalReferences: [{
    provider: 'wikidata',
    externalId: 'Q123',
    url: 'https://www.wikidata.org/wiki/Q123',
  }],
  finishedAt: '2026-01-01',
  pausedAt: null,
  nudgeAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

const gameForm = reactive<GameFormState>({
  id: null,
  title: 'Provider Title',
  status: 'playing',
  rating: '',
  playTimeHours: '',
  platform: 'PC',
  ownershipType: '',
  tags: '',
  wikidataId: 'Q123',
  wikipediaTitle: '',
  coverSourceUrl: '',
  coverSourcePageUrl: '',
  metadataReviewed: false,
  releaseYear: '',
  priority: '',
  developer: '',
  publisher: '',
  coverUrl: '',
  review: '',
  finishedAt: '',
  pausedAt: '',
  nudgeAt: '',
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ replace: routerReplace }),
}))

vi.mock('../composables/useBacklog', () => ({
  useBacklog: () => ({
    addCurrentJourneyToGame,
    canRateCurrentStatus: ref(false),
    formatDate: vi.fn(),
    gameForm,
    games: ref([existingGame]),
    isSaving: ref(false),
    removeGame: vi.fn(),
    resetForm: vi.fn(),
    saveCurrentGame,
    startCreatingGame: vi.fn(),
    startEditingGame: vi.fn(),
  }),
}))

const GameFormPanelStub = defineComponent({
  name: 'GameFormPanel',
  emits: ['save'],
  setup(_, { emit }) {
    return () => h('button', { 'data-testid': 'save', onClick: () => emit('save') }, 'Save')
  },
})

const DialogStub = defineComponent({
  name: 'DialogStub',
  props: { modelValue: Boolean },
  setup(props, { slots }) {
    return () => props.modelValue ? h('div', { 'data-testid': 'dialog' }, slots.default?.()) : null
  },
})

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

describe('EditGameView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers to add a Journey when the selected Wikidata identity already exists', async () => {
    const wrapper = mount(EditGameView, {
      global: {
        stubs: {
          GameFormPanel: GameFormPanelStub,
          VBtn: ButtonStub,
          VCard: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
          VCardActions: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
          VCardText: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
          VCardTitle: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
          VDialog: DialogStub,
        },
      },
    })

    await wrapper.get('[data-testid="save"]').trigger('click')

    expect(wrapper.text()).toContain('Already in library')
    expect(saveCurrentGame).not.toHaveBeenCalled()

    await wrapper.findAll('button').find((button) => button.text() === 'Add journey')?.trigger('click')

    expect(addCurrentJourneyToGame).toHaveBeenCalledWith(existingGame)
    expect(routerReplace).toHaveBeenCalledWith({
      name: 'game',
      params: { gameId: 'existing-game' },
    })
  })
})
