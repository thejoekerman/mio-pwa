import { ref } from 'vue'

/**
 * Service-worker update lifecycle using the "waiting worker" pattern. The SW no
 * longer calls skipWaiting() on install, so a new version sits in `waiting`
 * instead of barging in and tearing assets out from under the running page
 * (which caused the black-screen-on-update). Instead we surface a banner; only
 * when the user taps Reload do we tell the worker to take over, then reload once
 * it controls the page — so the new shell + chunks load atomically.
 */

const updateAvailable = ref(false)
let waitingWorker: ServiceWorker | null = null
let userInitiatedReload = false
let reloading = false

function trackInstalling(worker: ServiceWorker | null) {
  if (!worker) {
    return
  }

  worker.addEventListener('statechange', () => {
    // "installed" + an existing controller means this is an update sitting in
    // waiting (first installs have no controller and just activate).
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waitingWorker = worker
      updateAvailable.value = true
    }
  })
}

/** Wire update detection to a registration (called once, from main.ts, in prod). */
export function registerServiceWorkerUpdates(registration: ServiceWorkerRegistration) {
  // An update may already be waiting from a previous session.
  if (registration.waiting && navigator.serviceWorker.controller) {
    waitingWorker = registration.waiting
    updateAvailable.value = true
  }

  registration.addEventListener('updatefound', () => {
    trackInstalling(registration.installing)
  })

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload for an update the user opted into — not for the first SW
    // taking control on a fresh install.
    if (!userInitiatedReload || reloading) {
      return
    }

    reloading = true
    window.location.reload()
  })
}

/** User tapped Reload: ask the waiting worker to activate; reload on takeover. */
function applyUpdate() {
  if (!waitingWorker) {
    return
  }

  userInitiatedReload = true
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
}

export function usePwaUpdate() {
  return { updateAvailable, applyUpdate }
}
