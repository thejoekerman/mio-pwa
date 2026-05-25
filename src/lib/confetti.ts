export async function fireCompletionConfetti() {
  const { default: confetti } = await import('canvas-confetti')
  const colors = ['#ecbd6a', '#ffffff', '#f4d79a', '#ffda97', '#c1842f']
  const shared = { particleCount: 80, spread: 55, colors }

  void confetti({ ...shared, angle: 55, origin: { x: 0, y: 0.85 } })
  void confetti({ ...shared, angle: 125, origin: { x: 1, y: 0.85 } })
}
