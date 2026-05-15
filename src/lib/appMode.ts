export const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo'

export const appDisplayName = isDemoMode ? 'MioLog Demo' : 'MioLog'
