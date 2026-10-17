import type { EngineInterface, SessionContextUsage } from 'claude-code'

import type { ContextDetail, ContextReading, RepoInfo } from '../types'

// The context donut drawn at the left of the mascot's row: how full the
// context window is, with the numbers only once the percent is pressed,
// then the repo and branch the session works in.

export const toReading = (c: SessionContextUsage): ContextReading => ({
  window: c.window,
  tokens: c.tokens ?? null,
  percent: c.percent ?? null,
})

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export const percentLabel = (pct: number | null) => (pct === null ? '–' : `${pct}%`)

// Orange while there's room, amber when it's getting full, red when compaction is near.
export const colorFor = (pct: number | null) =>
  pct === null ? '#9AA0B4' : pct >= 90 ? '#E5484D' : pct >= 70 ? '#F2B84B' : '#D97757'

// The terminal can't draw a ring, so it gets the nearest quarter-filled circle.
export const glyphFor = (pct: number | null) => ['○', '◔', '◑', '◕', '●'][Math.min(4, Math.round((pct ?? 0) / 25))]

export function drawDonut(pct: number | null): string {
  const r = 6
  const c = 2 * Math.PI * r
  const filled = (Math.max(0, Math.min(100, pct ?? 0)) / 100) * c
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
<circle cx="8" cy="8" r="${r}" fill="none" stroke="#9AA0B4" stroke-opacity="0.35" stroke-width="3"/>
<circle cx="8" cy="8" r="${r}" fill="none" stroke="${colorFor(pct)}" stroke-width="3" stroke-dasharray="${filled.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/>
</svg>`
}

// The breakdown is a local estimate (no API calls), fetched only when the numbers are opened.
export async function loadDetail($: EngineInterface, tokens: number | null): Promise<ContextDetail> {
  const b = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
  const top = (b?.categories ?? [])
    .filter(c => c.kind === 'used' && c.tokens > 0)
    .sort((x, y) => y.tokens - x.tokens)
    .slice(0, 4)
    .map(c => ({ name: c.name, tokens: c.tokens }))
  const threshold = b?.isAutoCompactEnabled ? b.autoCompactThreshold : undefined
  const used = tokens ?? b?.totalTokens ?? 0
  return { top, leftBeforeCompact: threshold === undefined ? null : Math.max(0, threshold - used) }
}

/** The repo's name from its `origin` remote (`…/owner/name.git`), else its folder's name. */
export function repoName(remote: string | null, root: string): string {
  const parts = (remote ?? root).replace(/[\\/]+$/, '').replace(/\.git$/, '').split(/[\\/:]/)
  return parts[parts.length - 1] || root
}

const MAX_BRANCH = 24
export const shortBranch = (b: string) => (b.length > MAX_BRANCH ? `${b.slice(0, MAX_BRANCH - 1)}…` : b)

const parentDir = (dir: string) => dir.replace(/[\\/][^\\/]*$/, '')
const isAbsolute = (p: string) => /^([a-zA-Z]:)?[\\/]/.test(p)

// HEAD names the branch (`ref: refs/heads/main`), or holds a commit when none is checked out.
function parseHead(head: string): string | null {
  const ref = /^ref:\s*refs\/heads\/(.+)$/m.exec(head)
  if (ref?.[1]) return ref[1].trim()
  const sha = /^[0-9a-f]{40}/.exec(head.trim())
  return sha ? sha[0].slice(0, 7) : null
}

// Walks up from where the session works to the nearest `.git`: a folder, or in a
// worktree a file pointing at the worktree's own git folder.
async function readBranch($: EngineInterface, from: string): Promise<string | null> {
  const text = async (p: string) => {
    const t = await $.fs.read(p)
    return typeof t === 'string' ? t : ''
  }
  for (let dir = from; dir !== ''; ) {
    const dotGit = `${dir}/.git`
    if (await $.fs.exists(`${dotGit}/HEAD`)) return parseHead(await text(`${dotGit}/HEAD`))
    if (await $.fs.exists(dotGit)) {
      const gitdir = /^gitdir:\s*(.+)$/m.exec(await text(dotGit))?.[1]?.trim()
      if (!gitdir) return null
      return parseHead(await text(`${isAbsolute(gitdir) ? gitdir : `${dir}/${gitdir}`}/HEAD`))
    }
    const up = parentDir(dir)
    if (up === dir) return null
    dir = up
  }
  return null
}

/** The repo and branch the session works in; null outside a git repo or when they can't be read. */
export async function loadRepo($: EngineInterface): Promise<RepoInfo | null> {
  try {
    const repo = await $.session.repo()
    if (repo === null) return null
    const branch = await readBranch($, await $.session.cwd())
    return { name: repoName(repo.remote, repo.root), branch: branch === null ? null : shortBranch(branch) }
  } catch {
    return null
  }
}

/** The lines shown under the donut once the percent is pressed. */
export function detailLines(r: ContextReading | null, d: ContextDetail | null): string[] {
  if (r === null || r.tokens === null) return ["No reading yet. It appears after Claude's first reply."]
  const left = d?.leftBeforeCompact
  const lines = [`${k(r.tokens)} of ${k(r.window)} used${left == null ? '' : ` · ${k(left)} left before compaction`}`]
  if (d && d.top.length > 0) lines.push(d.top.map(c => `${c.name} ${k(c.tokens)}`).join(' · '))
  return lines
}
