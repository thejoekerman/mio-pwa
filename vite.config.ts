import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import packageJson from './package.json'

function demoHeadPlugin() {
  return {
    name: 'miolog-demo-head',
    transformIndexHtml(html: string) {
      if (process.env.VITE_APP_MODE !== 'demo') {
        return html
      }

      return html
        .replace(/\n\s*<link rel="manifest" href="\/manifest\.webmanifest" \/>/, '')
        .replace(/\n\s*<meta name="apple-mobile-web-app-capable" content="yes" \/>/, '')
        .replace(/\n\s*<meta name="apple-mobile-web-app-title" content="MioLog" \/>/, '')
        .replace(
          'content="MioLog is a local-first game backlog and play-log PWA for tracking what you play, pause, finish, and remember."',
          'content="Try MioLog with sample games, play logs, reviews, ratings, and statuses already filled in."',
        )
        .replace('content="MioLog"', 'content="MioLog Demo"')
        .replaceAll(
          'content="MioLog - Game backlog and play log"',
          'content="MioLog Demo - Sample game backlog and play log"',
        )
        .replace(
          'content="A local-first game journal for your backlog, reviews, play logs, and the small moments that make a playthrough yours."',
          'content="A seeded, interactive MioLog demo with sample games, reviews, play logs, and backlog statuses."',
        )
        .replaceAll('content="/social-preview.jpg"', 'content="/social-preview.svg"')
        .replaceAll(
          'content="MioLog source-available PWA preview with a neutral app mark"',
          'content="MioLog source-available PWA preview with sample backlog data"',
        )
        .replace(/<title>MioLog<\/title>/, '<title>MioLog Demo</title>')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_APP_TARGET === 'desktop' ? './' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [demoHeadPlugin(), vue(), vuetify({ autoImport: true })],
})
