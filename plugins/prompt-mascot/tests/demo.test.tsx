import { expect, mock, test } from 'claude-code/testing'

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

// The picture's description names the mood: "Claude mascot, happy: Happy".
test('/mascot demo plays every emotion in order, then rests', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'desktop', ...BAND })
  const mood = async () => String((await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Claude mascot'))?.props.alt ?? '').replace(/^Claude mascot, (\w+).*$/, '$1')

  await $.command.run({ command: 'mascot', args: 'demo' })
  await clock.settle()
  const seen = [await mood()]
  for (const ms of [4000, 5000, 4000, 3500, 4000, 4000, 4500, 4000, 5000]) {
    await clock.advance(ms)
    seen.push(await mood())
  }
  expect(seen).toEqual(['thinking', 'typing', 'happy', 'excited', 'curious', 'worried', 'sad', 'surprised', 'sleepy', 'idle'])

  // /mascot stop ends a demo early and goes back to resting.
  await $.command.run({ command: 'mascot', args: 'demo' })
  await clock.settle()
  await $.command.run({ command: 'mascot', args: 'stop' })
  await clock.advance(10_000)
  expect(await mood()).toBe('idle')
  await ui.unmount()
})
