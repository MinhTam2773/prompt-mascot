import type { SessionContextBreakdown } from 'claude-code'
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

const CONTEXT = { tokens: 110_000, window: 200_000, percent: 55 }

const BREAKDOWN: SessionContextBreakdown = {
  categories: [
    { name: 'System prompt', tokens: 3_100, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 14_800, color: 'inactive', isDeferred: false, kind: 'used' },
    { name: 'MCP tools', tokens: 22_400, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'Skills', tokens: 4_900, color: 'suggestion', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 61_300, color: 'claude', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 57_000, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 106_500,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'model-default',
  percentage: 53,
  gridRows: [],
  model: 'test',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  autoCompactThreshold: 167_000,
  isAutoCompactEnabled: true,
  apiUsage: null,
}

const isMascot = (alt: unknown) => String(alt).startsWith('Claude mascot')

test('the donut sits in the mascot row and shows numbers only after a press', async ($, on) => {
  // Stand-ins for the engine: the usage figures, the measurement, an empty band beneath.
  on('session.usage', async (_$, e) => ({
    value: { startedAt: 0, context: e.breakdown ? { ...CONTEXT, breakdown: BREAKDOWN } : CONTEXT, rateLimits: [] },
  }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.measure({ context: CONTEXT, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface, ...BAND })
    expect((await ui.find({ key: 'context-percent' }))?.props.label).toBe('55%')
    expect(await ui.find({ type: 'Text', text: /used/ })).toBeUndefined()

    await ui.press({ key: 'context-percent' })
    expect(await ui.find({ type: 'Text', text: '110k of 200k used · 57k left before compaction' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Messages 61k · MCP tools 22k · System tools 15k · Skills 5k' })).toBeDefined()

    await ui.press({ key: 'context-percent' })
    expect(await ui.find({ type: 'Text', text: /used/ })).toBeUndefined()
    await ui.unmount()
  }

  // On desktop the donut and the mascot are both pictures in the one keyed row.
  const desktop = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'desktop', ...BAND })
  const alts = (await desktop.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts.includes('Context window 55% full')).toBe(true)
  expect(alts.some(isMascot)).toBe(true)
  await desktop.unmount()

  // In the terminal the donut is a quarter circle.
  const terminal = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'terminal', ...BAND })
  expect(await terminal.find({ type: 'Text', text: '◑' })).toBeDefined()
  await terminal.unmount()
})

test('hiding the mascot keeps the donut', async ($, on) => {
  on('session.usage', async () => ({ value: { startedAt: 0, context: CONTEXT, rateLimits: [] } }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.measure({ context: CONTEXT, rateLimits: [], changed: ['context'] })
  await $.command.run({
    command: 'mascot',
    args: 'hide',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'desktop', ...BAND })
  expect((await ui.find({ key: 'context-percent' }))?.props.label).toBe('55%')
  expect((await ui.findAll({ type: 'Svg' })).some(s => isMascot(s.props.alt))).toBe(false)
  await ui.unmount()
})

test('before the first reply the donut shows a dash and says why on press', async ($, on) => {
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'terminal', ...BAND })
  expect((await ui.find({ key: 'context-percent' }))?.props.label).toBe('–')
  await ui.press({ key: 'context-percent' })
  expect(await ui.find({ type: 'Text', text: /No reading yet/ })).toBeDefined()
  await ui.unmount()
})
