import type {
  AppLanguage,
  PlayNextRecommendationsResponse,
  ReviewDraftResponse,
  SyncConnectionResponse,
  SyncResponse,
  SyncSnapshot,
} from '../types'

function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function requireSyncConfig(apiBaseUrl: string, syncToken: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  const normalizedSyncToken = syncToken.trim()

  if (!normalizedApiBaseUrl) {
    throw new Error('Sync backend URL is missing.')
  }

  if (!normalizedSyncToken) {
    throw new Error('Sync token is missing.')
  }

  return {
    apiBaseUrl: normalizedApiBaseUrl,
    syncToken: normalizedSyncToken,
  }
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Keep the fallback below when the response body is not JSON.
  }

  return `Request failed with status ${response.status}.`
}

async function performRequest<T>(
  path: string,
  apiBaseUrl: string,
  syncToken: string,
  init?: RequestInit,
) {
  const config = requireSyncConfig(apiBaseUrl, syncToken)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, 18000) // 18 seconds

  try {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.syncToken}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response))
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function testSyncConnection(
  apiBaseUrl: string,
  syncToken: string,
) {
  return performRequest<SyncConnectionResponse>('/api/me', apiBaseUrl, syncToken)
}

export async function syncWithBackend(
  apiBaseUrl: string,
  syncToken: string,
  snapshot: SyncSnapshot,
) {
  return performRequest<SyncResponse>('/api/sync', apiBaseUrl, syncToken, {
    method: 'POST',
    body: JSON.stringify(snapshot),
  })
}

export async function requestReviewDraft(
  apiBaseUrl: string,
  syncToken: string,
  gameId: string,
  language: AppLanguage,
) {
  return performRequest<ReviewDraftResponse>(`/api/ai/review-draft/${encodeURIComponent(gameId)}`, apiBaseUrl, syncToken, {
    method: 'POST',
    body: JSON.stringify({ language }),
  })
}

export async function requestPlayNextRecommendation(
  apiBaseUrl: string,
  syncToken: string,
  language: AppLanguage,
) {
  return performRequest<PlayNextRecommendationsResponse>('/api/ai/play-next', apiBaseUrl, syncToken, {
    method: 'POST',
    body: JSON.stringify({ language }),
  })
}
