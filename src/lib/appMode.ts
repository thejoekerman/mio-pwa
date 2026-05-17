export const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo'
export const isDesktopMode = import.meta.env.VITE_APP_TARGET === 'desktop'

export const appDisplayName = isDemoMode ? 'MioLog Demo' : 'MioLog'
