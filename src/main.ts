import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { vuetify } from './plugins/vuetify'
import { router } from './router'
import { appDisplayName, isDemoMode, isDesktopMode } from './lib/appMode'

document.title = appDisplayName

createApp(App).use(vuetify).use(router).mount('#app')

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD && !isDemoMode && !isDesktopMode) {
    window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('/sw.js')
      } catch (error) {
        console.error('[miolog] service-worker:register-error', error)
      }
    })
  } else {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch((error) => {
        console.error('[miolog] service-worker:unregister-error', error)
      })
  }
}
