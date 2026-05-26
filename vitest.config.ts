import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'pwa-install' } } }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
})
