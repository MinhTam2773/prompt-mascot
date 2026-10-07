import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { MascotMood, MascotState } from '../types'
import { drawMascot, FACES, HEIGHT, WIDTH } from './art'
import { lineFor, moodForAnswer, stateForTool } from './mood'

const current = atom({ plugin: 'spark-mascot', key: 'current' } as const, { mood: 'idle', line: '' })
const isHidden = atom({ plugin: 'spark-mascot', key: 'isHidden' } as const, false)

const IDLE: MascotState = { mood: 'idle', line: '' }
const SLEEPY: MascotState = { mood: 'sleepy', line: '' }
const WRITING: MascotState = { mood: 'typing', line: 'Writing a reply' }

// How long a reaction stays up before it settles back to resting,
// how long it rests before it falls asleep, and how often that is checked.
const REACTION_MS = 2 * 60_000

// The moods the small model chooses between when it reads a reply's tone,
// and how long to wait for it before falling back to counting words. Curious
// is not among them: it comes from a question mark in the reply's last
// paragraph, because the model also read a request ("tell me what you see")
// as curious.
const MOODS_TO_READ = ['happy', 'excited', 'worried', 'sad'] as const
const READ_TIMEOUT_MS = 6000
const SLEEP_MS = 10 * 60_000
const TICK_MS = 15_000

// Every write redraws the picture and restarts its animations,
// so a hook writes only when the mood or the bubble really changes.
const same = (a: MascotState, b: MascotState) => a.mood === b.mood && a.line === b.line

// The next state, remembering the mood it leaves so the picture can play
// the transition between the two.
const moveTo = (next: MascotState) => (now: MascotState): MascotState => ({ ...next, from: now.mood })

// `/mascot demo`: every emotion in turn, each held long enough for its
// transition and a little of its loop, the bubble naming it.
const DEMO: ReadonlyArray<{ state: MascotState; ms: number }> = [
  { state: { mood: 'thinking', line: 'Thinking' }, ms: 4000 },
  { state: { mood: 'typing', line: 'Typing' }, ms: 5000 },
  { state: { mood: 'happy', line: 'Happy' }, ms: 4000 },
  { state: { mood: 'excited', line: 'Excited' }, ms: 3500 },
  { state: { mood: 'curious', line: 'Curious' }, ms: 4000 },
  { state: { mood: 'worried', line: 'Worried' }, ms: 4000 },
  { state: { mood: 'sad', line: 'Sad' }, ms: 4500 },
  { state: { mood: 'surprised', line: 'Surprised' }, ms: 4000 },
  { state: { mood: 'sleepy', line: 'Sleepy' }, ms: 5000 },
  { state: { mood: 'idle', line: '' }, ms: 0 },
]

export const register: Register = on => {
  // When the current reaction settles to resting, and when resting turns to
  // sleep, in milliseconds since the epoch; null when nothing is pending.
  let settleAt: number | null = null
  let sleepAt: number | null = null
  let tick: Timer | undefined
  let demo: Timer | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mascot',
      description: 'Show or hide the Claude mascot (demo: play every emotion, stop: end the demo)',
    })

    const now = await $.clock.now()
    const state = await read($, current)
    if (state.mood === 'idle') sleepAt = now + SLEEP_MS
    else if (state.mood !== 'thinking' && state.mood !== 'typing') settleAt = now + REACTION_MS

    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => {
      void (async () => {
        const at = await $.clock.now()
        if (settleAt !== null && at >= settleAt) {
          settleAt = null
          sleepAt = at + SLEEP_MS
          await update($, current, moveTo(IDLE))
        } else if (sleepAt !== null && at >= sleepAt) {
          sleepAt = null
          await update($, current, moveTo(SLEEPY))
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'mascot' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'demo') {
      demo?.cancel()
      settleAt = null
      sleepAt = null
      await update($, isHidden, () => false)
      const play = (i: number) => {
        const step = DEMO[i]
        if (step === undefined) return
        void update($, current, moveTo(step.state))
        if (i + 1 < DEMO.length) demo = $.clock.after(step.ms, () => play(i + 1))
      }
      play(0)
      const seconds = Math.round(DEMO.reduce((sum, step) => sum + step.ms, 0) / 1000)
      return { text: `Playing every emotion in turn, about ${seconds} seconds. /mascot stop ends it early.` }
    }

    if (arg === 'stop') {
      demo?.cancel()
      await update($, current, moveTo(IDLE))
      return { text: 'Demo stopped.' }
    }

    const hide = arg === 'hide' ? true : arg === 'show' ? false : !(await read($, isHidden))
    await update($, isHidden, () => hide)

    return { text: hide ? 'Mascot hidden. Run /mascot to bring it back.' : 'Mascot is back.' }
  })

  // The turn now running: a mood read for an older turn arrives too late to show.
  let latestTurn = ''

  on('turn.start', async ($, e, next) => {
    latestTurn = e.turnId
    demo?.cancel() // real work wins over the demo
    settleAt = null
    sleepAt = null
    await update($, current, moveTo({ mood: 'thinking', line: lineFor('thinking') }))

    return next(e)
  })

  // While the reply's text streams in, it is writing: out comes the laptop.
  // Only the first visible piece of each model request switches it, and the
  // switch runs beside the stream so no piece of text waits on it. Thinking
  // pieces leave it thinking; a subagent's steps are not the reply.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    let writing = false
    for await (const chunk of next(e)) {
      if (!writing && chunk.kind === 'text' && chunk.text.trim() !== '') {
        writing = true
        void (async () => {
          if (same(await read($, current), WRITING)) return
          await update($, current, moveTo(WRITING))
        })()
      }
      yield chunk
    }
  })

  on('tool.call', async ($, e, next) => {
    const doing = stateForTool(String(e.tool))
    if (!same(await read($, current), doing)) await update($, current, moveTo(doing))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ending is not the reply the person reads.
    if (e.agentId !== undefined) return next(e)

    const result = await next(e)
    const turn = e.turnId
    const keywords = moodForAnswer(e.answer, e.reason)

    // Read the reply's tone with the small fast model, in the background so the
    // turn never waits on it. Counting words reads the topic instead: a cheerful
    // reply about a bug came out "sad". Interrupted and failed turns, and empty
    // replies, need no reading; a failed or slow reading falls back to the words.
    void (async () => {
      let mood: MascotMood = keywords
      if (e.reason === 'answer' && e.answer.trim() !== '' && keywords !== 'curious') {
        const text = e.answer.length > 1200 ? `${e.answer.slice(0, 600)}\n…\n${e.answer.slice(-600)}` : e.answer
        const reading = $.model
          .classify(
            `The mood this reply from Claude, an AI assistant, conveys by its tone, not by the topic it discusses.\n\n${text}`,
            MOODS_TO_READ,
          )
          .catch(() => undefined)
        const timeout = $.clock.sleep(READ_TIMEOUT_MS).then(() => undefined)
        const label = await Promise.race([reading, timeout])
        if (label !== undefined && (MOODS_TO_READ as readonly string[]).includes(label)) {
          mood = label as MascotMood
        }
      }
      if (latestTurn !== turn) return // a new turn started meanwhile
      await update($, current, moveTo({ mood, line: lineFor(mood) }))
      settleAt = (await $.clock.now()) + REACTION_MS
    })()

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Other mods share this band (next-steps puts its suggestions here), so
    // let them draw first and add the mascot on its own row after what they drew.
    // What they drew may be the engine's own node, which the engine refuses
    // under a Box with sizing props, so it goes into a plain column untouched.
    const below = await next(e)
    if (e.props.hasSurvey || (await read($, isHidden))) return below

    let state = await read($, current)
    // A turn is running but no turn.start reached us (say, right after a reload).
    if (e.props.isWorking && (state.mood === 'idle' || state.mood === 'sleepy')) {
      state = { mood: 'thinking', line: lineFor('thinking', 0) }
    }

    if (e.surface === 'desktop') {
      const { Box, Svg } = $.ui.resolve(e)
      const alt = `Claude mascot, ${state.mood}${state.line ? `: ${state.line}` : ''}`

      // Drawn as a plain image, not an interactive frame: a frame loads each new
      // picture into an empty document and shows nothing for a moment, while an
      // image keeps the old picture up until the new one is ready. SMIL still
      // plays in an image. The key keeps the row the same element when other
      // mods change what is drawn above it.
      return (
        <Box flexDirection="column">
          {below}
          <Box key="spark-mascot" flexDirection="row" justifyContent="flex-end" width="100%">
            <Svg source={drawMascot(state)} alt={alt} width={WIDTH} height={HEIGHT} />
          </Box>
        </Box>
      )
    }

    if (e.surface !== 'terminal') return below
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {below}
        <Box flexDirection="row" justifyContent="flex-end" width="100%">
          <Text color="#D97757" bold>
            {FACES[state.mood]}
          </Text>
          {state.line !== '' && <Text dimColor> {state.line}</Text>}
        </Box>
      </Box>
    )
  })
}
