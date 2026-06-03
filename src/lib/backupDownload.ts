import type { BackupData } from '../types'

export function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadBackupPayload(payload: BackupData) {
  const dateLabel = payload.exportedAt.slice(0, 10)

  downloadTextFile(
    `miolog-backup-${dateLabel}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  )
}
