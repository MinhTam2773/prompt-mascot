export type MascotMood =
  | 'idle'
  | 'sleepy'
  | 'thinking'
  | 'typing'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'worried'
  | 'sad'
  | 'surprised'

/**
 * What the mascot is doing now, the words in its speech bubble ('' for none),
 * and the mood it came from, which picks the transition it plays first.
 */
export type MascotState = { mood: MascotMood; line: string; from?: MascotMood }

/** The context window's fill as the status line has it; null figures before the first reply. */
export type ContextReading = { window: number; tokens: number | null; percent: number | null }

/** What pressing the percent reveals: room left before compaction, and the biggest categories. */
export type ContextDetail = {
  leftBeforeCompact: number | null
  top: { name: string; tokens: number }[]
}

/** The repo's name and the branch checked out (shortened when long); branch null when it can't be read. */
export type RepoInfo = { name: string; branch: string | null }

declare module 'claude-code' {
  interface PluginState {
    'prompt-mascot': {
      current: MascotState
      isHidden: boolean
      context: ContextReading | null
      contextDetail: ContextDetail | null
      isContextOpen: boolean
      repo: RepoInfo | null
    }
  }
}
