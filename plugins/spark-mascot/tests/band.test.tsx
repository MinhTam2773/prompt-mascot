import { expect, test } from 'claude-code/testing'

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

test('keeps what another mod draws in the band, on both surfaces', async ($, on) => {
  // Stands in for next-steps, drawing its suggestions beneath the mascot.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>next: run the tests</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'spark-mascot', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /run the tests/ })).toBeDefined()
    await ui.unmount()
  }
})
