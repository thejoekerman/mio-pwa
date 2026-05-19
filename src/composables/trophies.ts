import type { Ref } from 'vue'
import { saveEarnedTrophies } from '../lib/backlogDb'
import { evaluateTrophies } from '../lib/trophies'
import type { EarnedTrophy, Game, LogEntry, TrophyUnlockSource } from '../types'

interface TrophyDeps {
  games: Ref<Game[]>
  allLogs: Ref<LogEntry[]>
  earnedTrophies: Ref<EarnedTrophy[]>
  trophyUnlockQueue: Ref<EarnedTrophy[]>
  latestTrophyUnlockSource: Ref<TrophyUnlockSource | null>
  markLocalChange: () => void
  scheduleAutoSync: () => void
}

export function createTrophyHandlers(deps: TrophyDeps) {
  const {
    games,
    allLogs,
    earnedTrophies,
    trophyUnlockQueue,
    latestTrophyUnlockSource,
    markLocalChange,
    scheduleAutoSync,
  } = deps

  async function unlockEarnedTrophies(source: TrophyUnlockSource) {
    const newlyEarned = evaluateTrophies(games.value, allLogs.value, earnedTrophies.value)

    if (newlyEarned.length === 0) {
      return []
    }

    await saveEarnedTrophies(newlyEarned)
    earnedTrophies.value = [...earnedTrophies.value, ...newlyEarned]
    trophyUnlockQueue.value = [...trophyUnlockQueue.value, ...newlyEarned]
    latestTrophyUnlockSource.value = source
    markLocalChange()
    scheduleAutoSync()

    return newlyEarned
  }

  function dismissTrophyUnlocks() {
    trophyUnlockQueue.value = []
    latestTrophyUnlockSource.value = null
  }

  return { unlockEarnedTrophies, dismissTrophyUnlocks }
}
