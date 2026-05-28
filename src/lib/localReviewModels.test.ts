import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearLocalDraftPending,
  getDefaultModelForLanguage,
  getModelsForLanguage,
  hasLocalReviewModelForLanguage,
  hasPendingLocalDraft,
  isLocalReviewModelId,
  isStorageQuotaError,
  isWebGpuAvailable,
  isWebGpuError,
  LOCAL_REVIEW_MODELS,
  resolveLocalReviewModel,
  setLocalDraftPending,
} from './localReviewModels'

describe('localReviewModels', () => {
  describe('isLocalReviewModelId', () => {
    it('accepts every registered model id', () => {
      for (const model of LOCAL_REVIEW_MODELS) {
        expect(isLocalReviewModelId(model.id)).toBe(true)
      }
    })

    it('rejects unknown ids', () => {
      expect(isLocalReviewModelId('not-a-model')).toBe(false)
      expect(isLocalReviewModelId('')).toBe(false)
    })
  })

  describe('getModelsForLanguage / hasLocalReviewModelForLanguage', () => {
    it('returns only models that explicitly support the requested language', () => {
      const en = getModelsForLanguage('en')
      const de = getModelsForLanguage('de')

      expect(en.length).toBeGreaterThan(0)
      expect(en.every((m) => m.languages.includes('en'))).toBe(true)
      expect(de.every((m) => m.languages.includes('de'))).toBe(true)
    })

    it('hasLocalReviewModelForLanguage matches whether the filtered list is non-empty', () => {
      expect(hasLocalReviewModelForLanguage('en')).toBe(true)
      // German has at least one model (Gemma 2 2B); guarding against accidental removal.
      expect(hasLocalReviewModelForLanguage('de')).toBe(true)
    })
  })

  describe('getDefaultModelForLanguage', () => {
    it('returns a registered model id for every supported language', () => {
      const enDefault = getDefaultModelForLanguage('en')
      const deDefault = getDefaultModelForLanguage('de')
      expect(isLocalReviewModelId(enDefault)).toBe(true)
      expect(isLocalReviewModelId(deDefault)).toBe(true)
    })
  })

  describe('resolveLocalReviewModel', () => {
    it('keeps the stored choice when it supports the active language', () => {
      // Gemma 2 2B supports both EN and DE.
      const id = 'gemma-2-2b-it-q4f16_1-MLC'
      expect(resolveLocalReviewModel(id, 'de')).toBe(id)
      expect(resolveLocalReviewModel(id, 'en')).toBe(id)
    })

    it('falls back to the language default when the stored model cannot write that language', () => {
      // Qwen2.5 0.5B is English-only; in German we must swap to the language default.
      const englishOnly = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
      const fallback = resolveLocalReviewModel(englishOnly, 'de')
      expect(fallback).toBe(getDefaultModelForLanguage('de'))
    })

    it('falls back to the language default for an unknown stored id', () => {
      expect(resolveLocalReviewModel('not-a-model', 'en')).toBe(getDefaultModelForLanguage('en'))
    })
  })

  describe('isStorageQuotaError', () => {
    it('detects the standard QuotaExceededError name', () => {
      const err = new Error('Storage full')
      err.name = 'QuotaExceededError'
      expect(isStorageQuotaError(err)).toBe(true)
    })

    it('matches quota-style language in error messages', () => {
      expect(isStorageQuotaError(new Error('Quota exceeded for storage'))).toBe(true)
      expect(isStorageQuotaError(new Error('Out of space'))).toBe(true)
      expect(isStorageQuotaError(new Error('storage full'))).toBe(true)
    })

    it('returns false for unrelated errors', () => {
      expect(isStorageQuotaError(new Error('Network timeout'))).toBe(false)
      expect(isStorageQuotaError(null)).toBe(false)
      expect(isStorageQuotaError(undefined)).toBe(false)
    })
  })

  describe('isWebGpuError', () => {
    it('matches WebGPU-related failure modes', () => {
      expect(isWebGpuError(new Error('WebGPU not supported'))).toBe(true)
      expect(isWebGpuError(new Error('No available adapter found'))).toBe(true)
      expect(isWebGpuError(new Error('maxStorageBuffersPerShaderStage exceeds limit'))).toBe(true)
      expect(isWebGpuError(new Error('Cannot initialize runtime'))).toBe(true)
    })

    it('returns false for unrelated errors', () => {
      expect(isWebGpuError(new Error('Server returned 500'))).toBe(false)
      expect(isWebGpuError(null)).toBe(false)
    })
  })

  describe('isWebGpuAvailable', () => {
    afterEach(() => {
      // Remove any test-injected `gpu` property to avoid leaking into other tests.
      if ('gpu' in navigator) {
        Reflect.deleteProperty(navigator, 'gpu')
      }
    })

    it('returns true when navigator.gpu exists', () => {
      Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true })
      expect(isWebGpuAvailable()).toBe(true)
    })

    it('returns false when navigator.gpu is missing', () => {
      // happy-dom doesn't ship navigator.gpu, so this is the default.
      expect(isWebGpuAvailable()).toBe(false)
    })
  })

  describe('local-draft crash sentinel', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('records, reads, and clears a pending marker', () => {
      expect(hasPendingLocalDraft()).toBe(false)

      setLocalDraftPending('some-model-id')
      expect(hasPendingLocalDraft()).toBe(true)

      clearLocalDraftPending()
      expect(hasPendingLocalDraft()).toBe(false)
    })

    it('survives an unparseable localStorage value (best-effort)', () => {
      window.localStorage.setItem('miolog-local-draft-pending', '{not valid json')
      // It just checks "is the key present"; the value doesn't need to parse.
      expect(hasPendingLocalDraft()).toBe(true)
      clearLocalDraftPending()
      expect(hasPendingLocalDraft()).toBe(false)
    })
  })
})
