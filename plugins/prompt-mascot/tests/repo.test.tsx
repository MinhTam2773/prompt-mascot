import type { On, SessionRepo } from 'claude-code'
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

// Stand-ins for the engine: the usage figures, the repo, where the session
// works, and the files git keeps there.
function engine(on: On, repo: SessionRepo | null, cwd: string, files: Record<string, string>) {
  on('session.usage', async () => ({ value: { startedAt: 0, context: CONTEXT, rateLimits: [] } }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('session.repo', async () => ({ value: repo }))
  on('session.cwd', async () => ({ value: cwd }))
  // The engine resolves paths for the platform (C:\work\… on Windows), so match them loosely.
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:(?=\/)/, '').toLowerCase()
  const byPath = new Map(Object.entries(files).map(([p, text]) => [norm(p), text]))
  on('fs.exists', async (_$, e) => ({ value: byPath.has(norm(e.path)) }))
  on('fs.read', async (_$, e) => ({ value: byPath.get(norm(e.path)) ?? '' }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

const measure = { context: CONTEXT, rateLimits: [], changed: ['context' as const] }

test('shows the repo name and branch beside the percent', async ($, on) => {
  engine(
    on,
    { root: '/work/prompt-mascot', remote: 'https://github.com/MinhTam2773/prompt-mascot.git', internal: false, name: null },
    '/work/prompt-mascot/plugins',
    { '/work/prompt-mascot/.git': '', '/work/prompt-mascot/.git/HEAD': 'ref: refs/heads/main\n' },
  )
  await $.session.measure(measure)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface, ...BAND })
    expect((await ui.find({ key: 'context-percent' }))?.props.label).toBe('55%')
    expect(await ui.find({ type: 'Text', text: 'prompt-mascot' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '⎇ main' })).toBeDefined()
    await ui.unmount()
  }
})

test('follows a worktree to its branch and shortens a long one', async ($, on) => {
  engine(
    on,
    { root: 'C:/Programming/paranoidz', remote: 'git@github.com:MinhTam2773/paranoidz.git', internal: false, name: null },
    'C:/Programming/paranoidz-wt',
    {
      'C:/Programming/paranoidz-wt/.git': 'gitdir: C:/Programming/paranoidz/.git/worktrees/wt\n',
      'C:/Programming/paranoidz/.git/worktrees/wt/HEAD': 'ref: refs/heads/feature/context-donut-in-mascot-row\n',
    },
  )
  await $.session.measure(measure)

  const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'desktop', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'paranoidz' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⎇ feature/context-donut-i…' })).toBeDefined()
  await ui.unmount()
})

test('shows a short commit when no branch is checked out, and the folder name with no remote', async ($, on) => {
  engine(on, { root: '/work/scratch', remote: null, internal: false, name: null }, '/work/scratch', {
    '/work/scratch/.git': '',
    '/work/scratch/.git/HEAD': '8803e78c1f0a9b2d3e4f5a6b7c8d9e0f1a2b3c4d\n',
  })
  await $.session.measure(measure)

  const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'scratch' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⎇ 8803e78' })).toBeDefined()
  await ui.unmount()
})

test('outside a git repo only the donut and percent show', async ($, on) => {
  engine(on, null, '/home/notes', {})
  await $.session.measure(measure)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-mascot', surface, ...BAND })
    expect((await ui.find({ key: 'context-percent' }))?.props.label).toBe('55%')
    expect(await ui.find({ key: 'repo-name' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /⎇/ })).toBeUndefined()
    await ui.unmount()
  }
})
