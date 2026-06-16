import { beforeEach, describe, expect, it, vi } from 'vitest'

function setServiceWorker(controller: ServiceWorker | null = {} as ServiceWorker) {
  const listeners = new Map<string, EventListener>()
  const serviceWorker = {
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(event, listener)
    }),
    controller,
  }

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })

  return { listeners, serviceWorker }
}

function registrationWith(worker: ServiceWorker | null, waiting: ServiceWorker | null = null) {
  const listeners = new Map<string, EventListener>()

  return {
    installing: worker,
    waiting,
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(event, listener)
    }),
    listeners,
  } as unknown as ServiceWorkerRegistration & { listeners: Map<string, EventListener> }
}

function workerWithState(state: ServiceWorkerState = 'installing') {
  const listeners = new Map<string, EventListener>()

  return {
    state,
    postMessage: vi.fn(),
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(event, listener)
    }),
    listeners,
  } as unknown as ServiceWorker & { listeners: Map<string, EventListener>; state: ServiceWorkerState }
}

describe('usePwaUpdate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('surfaces an already waiting worker and applies the update', async () => {
    setServiceWorker({} as ServiceWorker)
    const waiting = workerWithState('installed')
    const registration = registrationWith(null, waiting)
    const { registerServiceWorkerUpdates, usePwaUpdate } = await import('./usePwaUpdate')

    registerServiceWorkerUpdates(registration)
    const { updateAvailable, applyUpdate } = usePwaUpdate()

    expect(updateAvailable.value).toBe(true)

    applyUpdate()

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('tracks an installing worker and reloads only after the user opts in', async () => {
    const { listeners } = setServiceWorker({} as ServiceWorker)
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
    const installing = workerWithState('installing')
    const registration = registrationWith(installing)
    const { registerServiceWorkerUpdates, usePwaUpdate } = await import('./usePwaUpdate')

    registerServiceWorkerUpdates(registration)
    registration.listeners.get('updatefound')?.(new Event('updatefound'))
    installing.state = 'installed'
    installing.listeners.get('statechange')?.(new Event('statechange'))

    const { updateAvailable, applyUpdate } = usePwaUpdate()
    expect(updateAvailable.value).toBe(true)

    listeners.get('controllerchange')?.(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()

    applyUpdate()
    listeners.get('controllerchange')?.(new Event('controllerchange'))
    listeners.get('controllerchange')?.(new Event('controllerchange'))

    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no waiting worker to apply', async () => {
    setServiceWorker(null)
    const { usePwaUpdate } = await import('./usePwaUpdate')

    expect(() => usePwaUpdate().applyUpdate()).not.toThrow()
  })
})
