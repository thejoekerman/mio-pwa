import type { Game } from '../types'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export interface WrappedCardStats {
  year: string
  count: number
  totalPlayHours: number | null
  avgRating: number | null
  topPlatform: string | null
}

// Fetch image via fetch() → objectURL so canvas never gets tainted,
// regardless of whether the image host sends CORS headers.
async function fetchImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img) }
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null) }
      img.src = objectUrl
    })
  } catch {
    return null
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawCoverContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) {
  const scale = Math.min(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

export async function generateWrappedShareCard(
  games: Game[],
  stats: WrappedCardStats,
): Promise<Blob> {
  const CARD_W = 1080
  const CARD_H = 1920
  const H_PAD = 52
  const GAP = 10
  const COVER_RADIUS = 14

  const covers = games
  const cols = covers.length === 1 ? 1
    : covers.length <= 4 ? 2
    : covers.length <= 12 ? 3
    : covers.length <= 20 ? 4
    : 5
  const covW = cols === 1
    ? 560
    : Math.floor((CARD_W - H_PAD * 2 - GAP * (cols - 1)) / cols)
  const rows = Math.ceil(covers.length / cols)

  const statItems = buildStatItems(stats)
  const hasStats = statItems.length > 0

  // Fixed layout heights
  const kickerH = 30
  const kickerGap = 8
  const yearH = 88
  const yearGap = 10
  const subtitleH = 44
  const subtitleGap = 44
  const gridGap = 44
  const statsH = hasStats ? 108 : 0
  const statsGap = hasStats ? 8 : 0
  const brandingH = 40
  const minPad = 52

  // Scale covers to fill the fixed height; cap at width-constrained aspect ratio
  const fixedOverhead = kickerH + kickerGap + yearH + yearGap + subtitleH + subtitleGap + gridGap + statsH + statsGap + brandingH + minPad * 2
  const covH_fromWidth = Math.round(covW * 1.36)
  const covH_fromHeight = Math.floor((CARD_H - fixedOverhead - GAP * (rows - 1)) / rows)
  const covH = Math.min(covH_fromWidth, covH_fromHeight)

  const gridH = rows * covH + (rows - 1) * GAP

  // Centre content vertically within the fixed canvas
  const contentH = kickerH + kickerGap + yearH + yearGap + subtitleH + subtitleGap + gridH + gridGap + statsH + statsGap + brandingH
  const topPad = Math.max(minPad, Math.floor((CARD_H - contentH) / 2))
  const bottomPad = CARD_H - contentH - topPad

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!

  // ── Background (reads live CSS vars — theme-aware) ───────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_H)
  bgGrad.addColorStop(0, cssVar('--bg-top'))
  bgGrad.addColorStop(1, cssVar('--bg-bottom'))
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Subtle accent wash top-left — uses the pre-mixed rgba var so canvas can consume it directly
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, CARD_W * 0.9)
  wash.addColorStop(0, cssVar('--panel-accent-soft'))
  wash.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // ── Header text ─────────────────────────────────────────────────────
  ctx.textAlign = 'center'

  // Kicker
  let y = topPad + kickerH
  ctx.font = `600 26px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = cssVar('--accent-strong')
  ctx.fillText('YEAR IN REVIEW', CARD_W / 2, y)

  // Year
  y += kickerGap + yearH
  ctx.font = `bold 80px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = cssVar('--text')
  ctx.fillText(stats.year, CARD_W / 2, y)

  // Subtitle
  y += yearGap + subtitleH
  ctx.font = `500 30px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = cssVar('--muted')
  ctx.fillText(
    stats.count === 1 ? '1 game finished' : `${stats.count} games finished`,
    CARD_W / 2,
    y,
  )

  // ── Cover grid ───────────────────────────────────────────────────────
  const gridTop = y + subtitleGap
  const gridLeft = cols === 1
    ? (CARD_W - covW) / 2
    : H_PAD

  const coverImages = await Promise.all(
    covers.map((g) => (g.coverUrl ? fetchImage(g.coverUrl) : Promise.resolve(null))),
  )

  for (let i = 0; i < covers.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = gridLeft + col * (covW + GAP)
    const cy = gridTop + row * (covH + GAP)

    const img = coverImages[i]
    if (img) {
      ctx.save()
      roundedRect(ctx, cx, cy, covW, covH, COVER_RADIUS)
      ctx.clip()
      drawCoverContain(ctx, img, cx, cy, covW, covH)
      ctx.restore()
    } else {
      roundedRect(ctx, cx, cy, covW, covH, COVER_RADIUS)
      ctx.fillStyle = cssVar('--panel-strong')
      ctx.fill()
    }
  }

  // ── Stats row ────────────────────────────────────────────────────────
  if (hasStats) {
    const statsTop = gridTop + gridH + gridGap

    // Divider
    ctx.strokeStyle = cssVar('--line')
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(H_PAD, statsTop)
    ctx.lineTo(CARD_W - H_PAD, statsTop)
    ctx.stroke()

    const statW = (CARD_W - H_PAD * 2) / statItems.length
    const valueY = statsTop + 56
    const labelY = statsTop + 86

    for (let i = 0; i < statItems.length; i++) {
      const sx = H_PAD + statW * i + statW / 2
      ctx.textAlign = 'center'

      ctx.font = `bold 36px system-ui, -apple-system, sans-serif`
      ctx.fillStyle = cssVar('--text')
      ctx.fillText(statItems[i].value, sx, valueY)

      ctx.font = `500 20px system-ui, -apple-system, sans-serif`
      ctx.fillStyle = cssVar('--muted-soft')
      ctx.fillText(statItems[i].label, sx, labelY)
    }
  }

  // ── Branding ─────────────────────────────────────────────────────────
  const brandingY = CARD_H - bottomPad + brandingH - 10

  // Try to load the logo mark
  const logo = await fetchImage('/miolog-head.svg')
  if (logo) {
    const logoSize = 24
    const logoX = CARD_W / 2 - logoSize / 2 - 52
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.drawImage(logo, logoX, brandingY - logoSize + 2, logoSize, logoSize)
    ctx.restore()
  }

  ctx.textAlign = 'center'
  ctx.font = `500 22px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = cssVar('--muted-soft')
  ctx.globalAlpha = 0.45
  ctx.fillText('MioLog', CARD_W / 2 + (logo ? 14 : 0), brandingY)
  ctx.globalAlpha = 1

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))),
      'image/png',
    )
  })
}

function buildStatItems(stats: WrappedCardStats) {
  const items: { value: string; label: string }[] = []
  if (stats.totalPlayHours !== null) {
    items.push({ value: `~${stats.totalPlayHours}h`, label: 'play time' })
  }
  if (stats.avgRating !== null) {
    items.push({ value: `${stats.avgRating}/10`, label: 'avg rating' })
  }
  if (stats.topPlatform) {
    items.push({ value: stats.topPlatform, label: 'top platform' })
  }
  return items
}
