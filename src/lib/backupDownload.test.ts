import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBackupPayload, downloadTextFile } from './backupDownload'
import type { BackupData } from '../types'

describe('backupDownload', () => {
  const createObjectURL = vi.fn(() => 'blob:miolog')
  const revokeObjectURL = vi.fn()
  const click = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
    document.body.innerHTML = ''
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    click.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads text content through a temporary object URL', () => {
    downloadTextFile('library.csv', 'title\nMio', 'text/csv;charset=utf-8')

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:miolog')
    expect(document.querySelector('a')).toBeNull()
  })

  it('names backup exports by their export date', () => {
    const payload = {
      exportedAt: '2026-06-16T12:00:00.000Z',
      schemaVersion: 3,
      games: [],
      logEntries: [],
      settings: {},
    } as unknown as BackupData

    const appendChild = vi.spyOn(document.body, 'appendChild')

    downloadBackupPayload(payload)

    const link = appendChild.mock.calls[0]?.[0] as HTMLAnchorElement
    expect(link.download).toBe('miolog-backup-2026-06-16.json')
  })
})
