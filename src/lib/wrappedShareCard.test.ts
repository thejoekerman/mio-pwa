import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateWrappedShareCard } from './wrappedShareCard'
import type { Game } from '../types'

const ctx = {
  addColorStop: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  createLinearGradient: vi.fn(),
  createRadialGradient: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  set fillStyle(_value: string | CanvasGradient) {},
  set font(_value: string) {},
  set globalAlpha(_value: number) {},
  set lineWidth(_value: number) {},
  set strokeStyle(_value: string) {},
  set textAlign(_value: CanvasTextAlign) {},
}

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game',
    title: 'Game',
    status: 'finished',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('wrappedShareCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()

    ctx.createLinearGradient.mockReturnValue({ addColorStop: ctx.addColorStop })
    ctx.createRadialGradient.mockReturnValue({ addColorStop: ctx.addColorStop })

    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => ({
        '--accent-strong': '#008fa3',
        '--bg-bottom': '#dff4ff',
        '--bg-top': '#f5fbff',
        '--line': 'rgba(0, 80, 120, 0.16)',
        '--muted': '#31536f',
        '--muted-soft': '#52718d',
        '--panel-accent-soft': 'rgba(0, 127, 149, 0.12)',
        '--panel-strong': '#ffffff',
        '--text': '#0b1f2e',
      }[name] ?? '').trim(),
    } as CSSStyleDeclaration)

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob(['png'], { type: 'image/png' }))
    })
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:image'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a themed card with covers and summary stats', async () => {
    const imageInstances: Array<{ onload: (() => void) | null; src: string; width: number; height: number }> = []
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 300
      height = 420
      private source = ''

      set src(value: string) {
        this.source = value
        this.onload?.()
      }

      get src() {
        return this.source
      }

      constructor() {
        imageInstances.push(this)
      }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['image']),
    })))

    const blob = await generateWrappedShareCard(
      [game({ coverUrl: 'https://example.test/cover.jpg' })],
      { year: '2026', count: 1, totalPlayHours: 42, avgRating: 8.5, topPlatform: 'Switch' },
    )

    expect(blob.type).toBe('image/png')
    expect(fetch).toHaveBeenCalledWith('https://example.test/cover.jpg')
    expect(ctx.drawImage).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalledWith('1 game finished', 540, expect.any(Number))
    expect(ctx.fillText).toHaveBeenCalledWith('~42h', expect.any(Number), expect.any(Number))
    expect(ctx.fillText).toHaveBeenCalledWith('8.5/10', expect.any(Number), expect.any(Number))
    expect(ctx.fillText).toHaveBeenCalledWith('Switch', expect.any(Number), expect.any(Number))
    expect(imageInstances.length).toBeGreaterThan(0)
  })

  it('falls back to cover placeholders and rejects when the canvas cannot export', async () => {
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        this.onerror?.()
      }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(null)
    })

    await expect(generateWrappedShareCard(
      [
        game({ id: 'one', coverUrl: 'https://example.test/missing.jpg' }),
        game({ id: 'two', coverUrl: null }),
      ],
      { year: '2026', count: 2, totalPlayHours: null, avgRating: null, topPlatform: null },
    )).rejects.toThrow('canvas.toBlob failed')

    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalledWith('2 games finished', 540, expect.any(Number))
  })
})
