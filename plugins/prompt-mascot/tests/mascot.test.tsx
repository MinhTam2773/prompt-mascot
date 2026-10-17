import { expect, test } from 'claude-code/testing'

import { drawMascot } from '../hooks/art'
import { lineFor, moodForAnswer, stateForTool } from '../hooks/mood'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

test('a reply picks the right face', async () => {
  expect(moodForAnswer('Both commands worked. The plugin is installed.', 'answer')).toBe('happy')
  expect(moodForAnswer('All 12 tests pass now 🎉', 'answer')).toBe('excited')
  expect(moodForAnswer('Here is the plan.\n\nShould I go ahead and run it?', 'answer')).toBe('curious')
  expect(moodForAnswer("Sorry, the build failed and I couldn't fix it.", 'answer')).toBe('sad')
  expect(moodForAnswer('The deploy failed on the last step.', 'answer')).toBe('worried')
  expect(moodForAnswer('anything', 'aborted')).toBe('surprised')
  expect(moodForAnswer('', 'error')).toBe('sad')
})

test('tools set what the bubble says', async () => {
  expect(stateForTool('Grep')).toEqual({ mood: 'typing', line: 'Searching the code' })
  expect(stateForTool('mcp__docs__read')).toEqual({ mood: 'typing', line: 'Using a connector' })
  expect(stateForTool('AskUserQuestion').mood).toBe('curious')
  expect(lineFor('happy', 0)).toBe('Done!')
})

test('every mood draws a complete SVG', async () => {
  const moods = ['idle', 'sleepy', 'thinking', 'typing', 'happy', 'excited', 'curious', 'worried', 'sad', 'surprised'] as const
  for (const mood of moods) {
    const svg = drawMascot({ mood, line: lineFor(mood, 0) })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trim().endsWith('</svg>')).toBe(true)
    expect(svg.length < 131072).toBe(true)
  }
  // Text in the bubble is escaped.
  expect(drawMascot({ mood: 'typing', line: '<b>&' }).includes('&lt;b&gt;&amp;')).toBe(true)
})

test('every move between moods plays a transition and stays under the size limit', async () => {
  const moods = ['idle', 'sleepy', 'thinking', 'typing', 'happy', 'excited', 'curious', 'worried', 'sad', 'surprised'] as const
  for (const from of moods) {
    for (const mood of moods) {
      expect(drawMascot({ mood, line: 'Working on it', from }).length < 131072).toBe(true)
    }
  }
  // A play-once animation is one without repeatCount; the loop starts after it.
  const playsOnce = (svg: string) => /<animate (?![^>]*repeatCount)[^>]*\/>/.test(svg)
  // Idle to typing: pulling out the laptop plays once, then the typing loop starts.
  expect(playsOnce(drawMascot({ mood: 'typing', line: '', from: 'idle' }))).toBe(true)
  // Staying in the same mood (a new bubble line) plays no transition.
  expect(playsOnce(drawMascot({ mood: 'typing', line: '', from: 'typing' }))).toBe(false)
})

test('draws a picture on desktop and a face on the terminal', async ($, on) => {
  // Nothing else draws in the band, as in a session with no other mods there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  const desktop = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'desktop', ...BAND })
  expect((await desktop.findAll({ type: 'Svg' })).some(s => String(s.props.alt).startsWith('Claude mascot'))).toBe(true)
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'terminal', ...BAND })
  expect(await terminal.find({ type: 'Text', text: /▐▛▘▝▜▌/ })).toBeDefined()
  await terminal.unmount()
})
