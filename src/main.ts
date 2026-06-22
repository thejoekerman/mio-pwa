import { createApp } from 'vue'
import '@khmyznikov/pwa-install'
import './style.css'
import App from './App.vue'
import { vuetify } from './plugins/vuetify'
import { router } from './router'
import { registerServiceWorkerUpdates } from './composables/usePwaUpdate'
import { appDisplayName, isDemoMode, isDesktopMode } from './lib/appMode'
import { ensureLocaleLoaded } from './i18n'
import { useSettings } from './composables/useSettings'

document.title = appDisplayName

const app = createApp(App).use(vuetify).use(router)
// Wait for the active locale chunk before the first paint so non-English users
// don't see a flash of the English fallback strings.
const { settings } = useSettings()
Promise.all([router.isReady(), ensureLocaleLoaded(settings.language)]).then(() =>
  app.mount('#app'),
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD && !isDemoMode && !isDesktopMode) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        registerServiceWorkerUpdates(registration)
      } catch (error) {
        console.error('[games-backlog] service-worker:register-error', error)
      }
    })
  } else {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch((error) => {
        console.error('[games-backlog] service-worker:unregister-error', error)
      })
  }
}
