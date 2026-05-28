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
      // tests" drop does. Per-directory globs let us hold src/lib + src/composables
      // (where business logic lives) to a higher bar than views/components.
      // Ratchet these up deliberately when you do a dedicated test-improvement
      // pass — there's no automatic update.
      thresholds: {
        lines: 50,
        functions: 70,
        branches: 75,
        'src/lib/**/*.ts': {
          lines: 60,
          functions: 85,
          branches: 78,
        },
        'src/composables/**/*.ts': {
          lines: 65,
          functions: 60,
          branches: 73,
        },
      },
    },
  },
})
