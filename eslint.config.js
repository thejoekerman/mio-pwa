import pluginVue from 'eslint-plugin-vue'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// Flat config (ESLint 10). Kept intentionally lean: error-prevention rules only
// (`flat/essential` + TypeScript `recommended`) rather than the noisier style rule sets,
// so the gate is high-signal. Ratchet up to `flat/recommended` later if desired.
export default defineConfig(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
    extends: [tseslint.configs.recommended],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },

  pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      'vue/block-lang': ['error', { script: { lang: ['ts'], allowNoLang: false } }],
    },
  },
)
