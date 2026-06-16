import { beforeEach, describe, expect, it, vi } from 'vitest'

const confetti = vi.hoisted(() => vi.fn())

vi.mock('canvas-confetti', () => ({
  default: confetti,
}))

describe('confetti', () => {
  beforeEach(() => {
    confetti.mockClear()
  })

  it('fires completion confetti from both bottom corners', async () => {
    const { fireCompletionConfetti } = await import('./confetti')

    await fireCompletionConfetti()

    expect(confetti).toHaveBeenCalledTimes(2)
    expect(confetti).toHaveBeenCalledWith(expect.objectContaining({
      angle: 55,
      origin: { x: 0, y: 0.85 },
      particleCount: 80,
      spread: 55,
    }))
    expect(confetti).toHaveBeenCalledWith(expect.objectContaining({
      angle: 125,
      origin: { x: 1, y: 0.85 },
      particleCount: 80,
      spread: 55,
    }))
  })
})
