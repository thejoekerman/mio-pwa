import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

// Flat config (ESLint 10). Kept intentionally lean: error-prevention rules only
// (`flat/essential` + Vue-TS `recommended`) rather than the noisier style rule sets,
// so the gate is high-signal. Ratchet up to `flat/recommended` later if desired.
export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

)
