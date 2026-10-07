import type { MascotMood, MascotState } from '../types'

export type TurnEnd = 'answer' | 'aborted' | 'refusal' | 'error'

// Words that mean something went wrong, and words that mean it went well.
// Counted across the whole reply; whichever side has more wins.
const BAD =
  /\b(sorry|unfortunately|failed|failing|fails|couldn'?t|could not|can'?t|cannot|unable to|broken|doesn'?t work|didn'?t work|not working|errored|crash(ed|es)?|denied|blocked)\b/g
const GOOD =
  /\b(done|works|worked|working now|passed|passes|passing|succeeded|successfully|fixed|installed|ready|all set|good news|completed?|shipped|deployed|published)\b/g
// A clear win gets the bigger celebration.
const GREAT =
  /(🎉|\ball (\d+ )?tests? pass|\btests? (all )?pass(ed)?\b|\bit works\b|\bworks now\b|\bnailed\b)/

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length

/** Picks the face for a finished reply. */
export function moodForAnswer(answer: string, reason: TurnEnd): MascotMood {
  if (reason === 'aborted') return 'surprised'
  if (reason === 'error' || reason === 'refusal') return 'sad'

  const text = answer.toLowerCase().trim()
  if (text === '') return 'happy'

  const bad = count(text, BAD)
  const good = count(text, GOOD)
  if (bad > good) return bad >= 3 ? 'sad' : 'worried'

  // A reply whose last paragraph asks something is waiting on the person.
  const ending = text.split(/\n\s*\n/).pop() ?? ''
  if (ending.includes('?')) return 'curious'

  if (GREAT.test(text)) return 'excited'
  return 'happy'
}

const LINES: Record<MascotMood, readonly string[]> = {
  idle: [''],
  sleepy: [''],
  thinking: ['Thinking', 'Hmm, let me see', 'Mulling it over'],
  typing: ['Working on it'],
  happy: ['Done!', 'All set!', 'Here you go!'],
  excited: ['It works!', 'Nailed it!', 'Woohoo!'],
  curious: ['Your call?', 'Over to you!', 'What do you think?'],
  worried: ['Hit a snag…', 'Hmm, not quite', 'A bit stuck…'],
  sad: ['Sorry about that', "That didn't work"],
  surprised: ['Oh! Stopped.', 'Whoa, paused!'],
}

/** One of the bubble lines for a mood; `pick` in [0, 1) chooses which. */
export function lineFor(mood: MascotMood, pick = Math.random()): string {
  const list = LINES[mood]
  return list[Math.floor(pick * list.length)] ?? list[0] ?? ''
}

const TOOL_LINES: Record<string, string> = {
  Bash: 'Running a command',
  PowerShell: 'Running a command',
  Read: 'Reading files',
  Grep: 'Searching the code',
  Glob: 'Looking for files',
  Edit: 'Writing code',
  Write: 'Writing a file',
  NotebookEdit: 'Editing a notebook',
  WebFetch: 'Reading a web page',
  WebSearch: 'Searching the web',
  Agent: 'Asking a helper',
  Skill: 'Loading a skill',
  ToolSearch: 'Finding tools',
  TodoWrite: 'Making a to-do list',
}

/** What the mascot does while a tool runs. */
export function stateForTool(tool: string): MascotState {
  if (tool === 'AskUserQuestion') return { mood: 'curious', line: 'Got a question!' }
  const line = TOOL_LINES[tool] ?? (tool.startsWith('mcp__') ? 'Using a connector' : 'Working on it')
  return { mood: 'typing', line }
}
