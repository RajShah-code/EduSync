const SESSION_KEY = 'edusync_active_session'

export const sessionStore = {
  startSession: (sessionInfo) => {
    const data = {
      ...sessionInfo,
      startedAt: new Date().toISOString(),
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  },

  endSession: () => {
    localStorage.removeItem(SESSION_KEY)
  },

  getSession: () => {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.startedAt) {
        parsed.startedAt = new Date(parsed.startedAt)
      }
      return parsed
    } catch {
      return null
    }
  },

  isActive: () => {
    return localStorage.getItem(SESSION_KEY) !== null
  },
}
