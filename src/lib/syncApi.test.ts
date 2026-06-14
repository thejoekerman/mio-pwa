import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestReviewDraft, syncWithBackend, testSyncConnection } from './syncApi'
import type { SyncSnapshot } from '../types'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptySnapshot(): SyncSnapshot {
  return { games: [], logs: [], earnedTrophies: [] }
}

describe('syncApi', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('config validation', () => {
    it('rejects an empty base URL before touching the network', async () => {
      await expect(testSyncConnection('   ', 'token')).rejects.toThrow(/url is missing/i)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects an empty token before touching the network', async () => {
      await expect(testSyncConnection('https://example.test', '   ')).rejects.toThrow(/token is missing/i)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('strips trailing slashes from the base URL', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: {}, capabilities: {} }))

      await testSyncConnection('https://example.test///', 'token')

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('https://example.test/api/me')
    })
  })

  describe('request shape', () => {
    it('sends the Bearer token on every authenticated request', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: {}, capabilities: {} }))

      await testSyncConnection('https://example.test', 'my-token')

      const [, init] = fetchMock.mock.calls[0]
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer my-token')
      expect(headers.Accept).toBe('application/json')
    })

    it('omits Content-Type on body-less GETs', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: {}, capabilities: {} }))

      await testSyncConnection('https://example.test', 'token')

      const [, init] = fetchMock.mock.calls[0]
      const headers = init?.headers as Record<string, string>
      expect(headers['Content-Type']).toBeUndefined()
    })

    it('sets Content-Type when sending a JSON body', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { games: [], logs: [], earnedTrophies: [], syncedAt: '2026-01-01T00:00:00Z' }),
      )

      await syncWithBackend('https://example.test', 'token', emptySnapshot())

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://example.test/api/sync')
      expect(init?.method).toBe('POST')
      const headers = init?.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
      expect(init?.body).toBe(JSON.stringify(emptySnapshot()))
    })

    it('url-encodes the gameId in the review-draft path', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { gameId: 'a/b c', draft: '' }))

      await requestReviewDraft('https://example.test', 'token', 'a/b c', 'en')

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://example.test/api/ai/review-draft/a%2Fb%20c')
      expect(init?.body).toBe(JSON.stringify({ language: 'en' }))
    })
  })

  describe('error handling', () => {
    it('surfaces the server `error` field on a non-2XX response', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Bad token.' }))

      await expect(testSyncConnection('https://example.test', 'token')).rejects.toThrow('Bad token.')
    })

    it('falls back to a generic message when the error body is not JSON', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('<html>500</html>', { status: 500, headers: { 'Content-Type': 'text/html' } }),
      )

      await expect(testSyncConnection('https://example.test', 'token')).rejects.toThrow(/status 500/)
    })

    it('falls back to a generic message when the JSON error body has no `error` field', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, { somethingElse: true }))

      await expect(testSyncConnection('https://example.test', 'token')).rejects.toThrow(/status 500/)
    })
  })

  describe('timeouts', () => {
    it('aborts requests that take too long', async () => {
      vi.useFakeTimers()

      fetchMock.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'))
            })
          }),
      )

      const pending = testSyncConnection('https://example.test', 'token')
      const expectation = expect(pending).rejects.toThrow(/abort/i)

      // The default timeout in performRequest is 18s; advance just past it.
      await vi.advanceTimersByTimeAsync(20_000)
      await expectation
    })

  })
})
