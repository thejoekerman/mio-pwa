import 'vuetify/styles'
import { createVuetify } from 'vuetify/framework'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

export const vuetify = createVuetify({
  defaults: {
    global: {
      density: 'comfortable',
    },
    VBtn: {
      rounded: 'lg',
    },
    VCard: {
      rounded: 'lg',
    },
    VTextField: {
      color: 'primary',
      variant: 'outlined',
    },
    VSelect: {
      color: 'primary',
      variant: 'outlined',
    },
    VTextarea: {
      color: 'primary',
      variant: 'outlined',
    },
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'journal',
    themes: {
      journal: {
        dark: true,
        colors: {
          background: '#09111f',
          surface: '#0f1e34',
          primary: '#ecbd6a',
          secondary: '#5379c1',
          success: '#66d6aa',
          warning: '#f2cb83',
          error: '#ff8d8d',
          info: '#9eadc9',
          'on-background': '#edf2ff',
          'on-surface': '#edf2ff',
          'on-primary': '#09111f',
          'on-secondary': '#edf2ff',
          'on-success': '#09111f',
          'on-warning': '#09111f',
          'on-error': '#09111f',
          'on-info': '#09111f',
        },
      },
      mio: {
        dark: true,
        colors: {
          background: '#170520',
          surface: '#2b0e3d',
          primary: '#9f49ff',
          secondary: '#c784ff',
          success: '#80dfc0',
          warning: '#d7b0ff',
          error: '#ff9db5',
          info: '#d7c2ed',
          'on-background': '#fff6fb',
          'on-surface': '#fff6fb',
          'on-primary': '#fff6fb',
          'on-secondary': '#170520',
          'on-success': '#170520',
          'on-warning': '#170520',
          'on-error': '#170520',
          'on-info': '#170520',
        },
      },
    },
  },
})
