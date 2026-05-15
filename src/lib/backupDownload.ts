import type { BackupData } from '../types'

export function downloadBackupPayload(payload: BackupData) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateLabel = payload.exportedAt.slice(0, 10)

  link.href = url
  link.download = `miolog-backup-${dateLabel}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
