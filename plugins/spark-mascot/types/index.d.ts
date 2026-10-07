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

declare module 'claude-code' {
  interface PluginState {
    'spark-mascot': { current: MascotState; isHidden: boolean }
  }
}
