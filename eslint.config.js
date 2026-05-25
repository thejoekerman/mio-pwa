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

  {
    // GameFormPanel intentionally edits the shared reactive `form` prop in place; the
    // parent owns the object and persists on `emit('save')`. This breaks Vue's one-way
    // data flow, so it stays a visible warning here (not a silent disable) pending a
    // refactor to defineModel/emits. The rule remains an error everywhere else.
    // TODO(miolog): refactor GameFormPanel off prop mutation, then drop this override.
    name: 'app/gameformpanel-prop-mutation',
    files: ['src/components/GameFormPanel.vue'],
    rules: {
      'vue/no-mutating-props': 'warn',
    },
  },
)
