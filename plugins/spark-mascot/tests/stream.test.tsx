import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

// The picture's description names the mood and the bubble: "Claude mascot, typing: Writing a reply".
test('it thinks while the model thinks, and types once the reply text streams in', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  // A stand-in for the model: some thinking, then the reply's text.
  on('turn.step', async function* () {
    yield { kind: 'thinking', index: 0, text: 'Let me see.' }
    yield { kind: 'text', index: 1, text: 'Once upon a time' }
    yield { kind: 'text', index: 1, text: ' there was a critter.' }
    return { turnId: 't1', index: 0, answer: 'Once upon a time there was a critter.', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  const ui = await $.ui.mount({ plugin: 'spark-mascot', surface: 'desktop', ...BAND })
  const alt = async () => String((await ui.find({ type: 'Svg' }))?.props.alt ?? '')

  // A turn is running (isWorking) and nothing has streamed yet: thinking.
  await clock.settle()
  expect(await alt()).toMatch(/^Claude mascot, thinking/)

  const kinds: string[] = []
  for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'test', messageCount: 1 })) kinds.push(chunk.kind)
  await clock.settle()
  // Every piece still reaches the screen, in order.
  expect(kinds).toEqual(['thinking', 'text', 'text'])
  expect(await alt()).toBe('Claude mascot, typing: Writing a reply')
  await ui.unmount()
})
