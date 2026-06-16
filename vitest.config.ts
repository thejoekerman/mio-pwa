import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'pwa-install' } } }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.component.test.ts',
        'src/main.ts',
        'src/vite-env.d.ts',
        'src/plugins/**',
        'src/i18n.ts',
      ],
      // Modest absolute floors — set a few points below current coverage so that
      // a normal refactor doesn't fail CI, but a "shipped a feature without
      // tests" drop does. V8 coverage counts Vue route shells and many template
      // branches, so the global floor is deliberately lower than the business
      // logic floors below. Ratchet these up deliberately when you do a dedicated
      // test-improvement pass — there's no automatic update.
      thresholds: {
        lines: 58,
        functions: 50,
        branches: 50,
        'src/lib/**/*.ts': {
          lines: 84,
          functions: 88,
          branches: 74,
        },
        'src/composables/**/*.ts': {
          lines: 74,
          functions: 70,
          branches: 64,
        },
      },
    },
  },
})
