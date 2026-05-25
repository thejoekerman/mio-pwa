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
          primary: '#ff8fc7',
          secondary: '#ffc1dd',
          success: '#80dfc0',
          warning: '#ffc1dd',
          error: '#ff9db5',
          info: '#d7c2ed',
          'on-background': '#fff6fb',
          'on-surface': '#fff6fb',
          'on-primary': '#170520',
          'on-secondary': '#170520',
          'on-success': '#170520',
          'on-warning': '#170520',
          'on-error': '#170520',
          'on-info': '#170520',
        },
      },
      polar: {
        dark: false,
        colors: {
          background: '#eaf4fb',
          surface: '#ffffff',
          primary: '#00b4c8',
          secondary: '#4aa8be',
          success: '#0da070',
          warning: '#c47a00',
          error: '#d9405a',
          info: '#4a6280',
          'on-background': '#0b1f2e',
          'on-surface': '#0b1f2e',
          'on-primary': '#ffffff',
          'on-secondary': '#ffffff',
          'on-success': '#ffffff',
          'on-warning': '#ffffff',
          'on-error': '#ffffff',
          'on-info': '#ffffff',
        },
      },
      preemNeon: {
        dark: true,
        colors: {
          background: '#05080d',
          surface: '#0b1519',
          primary: '#f8ef3f',
          secondary: '#00e5ff',
          success: '#39f8ac',
          warning: '#f8ef3f',
          error: '#ff4f87',
          info: '#71f6ff',
          'on-background': '#f5fbff',
          'on-surface': '#f5fbff',
          'on-primary': '#05080d',
          'on-secondary': '#05080d',
          'on-success': '#05080d',
          'on-warning': '#05080d',
          'on-error': '#05080d',
          'on-info': '#05080d',
        },
      },
    },
  },
})
