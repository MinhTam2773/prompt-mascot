import type { MascotMood, MascotState } from '../types'

// The pixel critter, animated the way a sprite is: every mood is a list of
// hand-built poses, each held for a number of frames, played at FPS frames a
// second. Nothing glides; a pose snaps to the next, as in the agent-view video.

const BODY = '#D97757'
const SHADE = '#C15F3C' // an arm crossing in front of the body
const INK = '#1F1A17'
const GOLD = '#F2B84B'
const BLUE = '#7EC4F2'
const PINK = '#F27A93'
const RED = '#E5484D'
const GREY = '#9AA0B4'
const SIDE = '#C4664A' // the body in shadow: its far side, its right edge and bottom, the legs
const LIGHT = '#E8977C' // a highlight where the light (top left) catches the body
const SCREEN = '#A3A3AB'
const KEYBOARD = '#8A8A92'
const LIT = '#B9CBDA' // the screen's face, flickering between these two
const DIM = '#8EA9BF'
const MUG = '#F4EDE4'
const MUG_SHADE = '#CDBFB1'
const STEAM = '#F6EFE8'
const COFFEE = '#6E4330'
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace"

export const WIDTH = 252
export const HEIGHT = 72

// One sprite pixel is U by U CSS pixels. Grid column 0, row 0 sits at
// (OX, OY); the feet end on row 7, at the bottom of the picture. Rows above 0
// are headroom for jumps and for things floating over its head.
const U = 5
const OX = 168
const OY = 30
// Frames a second. Holds in the timelines below are written in tenths of a
// second (frames at 10 fps) and converted as they play: a one-frame moment
// (a keystroke, a take-off) stays one frame, and a long hold keeps its length.
const FPS = 12
const AUTHORED_FPS = 10
const BUBBLE_RIGHT = OX - 12

type Cell = readonly [number, number]

type Body = 'normal' | 'bob' | 'squash' | 'stretch' | 'tipped'
type Eyes = 'open' | 'blink' | 'dot' | 'happy' | 'closed' | 'wide'
// 'tap', 'hover' and 'reach' are the side view's typing arms.
type Arm = 'down' | 'up' | 'out' | 'low' | 'chin' | 'tap' | 'hover' | 'reach'
type Legs = 'stand' | 'stepA' | 'stepB' | 'splay' | 'lift'

/** Something drawn near the critter: a heart, a "?", a falling tear. */
type Prop = { cells: readonly Cell[]; color: string; c: number; r: number; p: number }

type Pose = {
  body: Body
  y: number // whole-body hop, in sprite pixels (negative is up)
  lean: number // top of the body shifted sideways, legs planted
  eyes: Eyes
  gx: number // where the eyes look
  gy: number
  tilt: number // right eye raised (-1) or lowered (+1): a head tilt
  armL: Arm
  armR: Arm
  legs: Legs
  side: boolean // turned to face left, at the laptop
  lid: 'none' | 'closed' | 'half' | 'open' // the laptop, in the side view
  screen: number // laptop screen brightness step
  mug: 'none' | 'low' | 'mid' | 'sip' | 'gulp' // a coffee mug in the right hand: held in front, halfway up, at the mouth, or tipped further for a gulp
  props: readonly Prop[]
}

const BASE: Pose = {
  body: 'normal',
  y: 0,
  lean: 0,
  eyes: 'open',
  gx: 0,
  gy: 0,
  tilt: 0,
  armL: 'down',
  armR: 'down',
  legs: 'stand',
  side: false,
  lid: 'open',
  screen: 0,
  mug: 'none',
  props: [],
}

const pose = (over: Partial<Pose>): Pose => ({ ...BASE, ...over })

// ---- small pixel pictures for props ----

function pattern(rows: readonly string[]): Cell[] {
  const cells: Cell[] = []
  rows.forEach((row, r) => [...row].forEach((ch, c) => ch === 'X' && cells.push([c, r])))
  return cells
}

const HEART = pattern(['.X.X.', 'XXXXX', '.XXX.', '..X..'])
const SPARKLE = pattern(['.X.', 'XXX', '.X.'])
const QUESTION = pattern(['XXX', '..X', '.XX', '...', '.X.'])
const BANG = pattern(['X', 'X', 'X', '.', 'X'])
const ZED = pattern(['XXXX', '..X.', '.X..', 'XXXX'])
const DOT: Cell[] = [[0, 0]]
const DROP: Cell[] = [[0, 0], [0, 1]]
const PUFF = pattern(['.X', 'XX'])
const WISP = pattern(['.X', 'X.', '.X'])

// ---- drawing one frame ----

function bodyBox(body: Body) {
  switch (body) {
    case 'bob':
      return { l: 2, r: 11, t: 1, b: 5 } // breathing out: one pixel shorter
    case 'squash':
      return { l: 1, r: 12, t: 2, b: 5 } // crouch or landing: low and wide
    case 'stretch':
      return { l: 3, r: 10, t: -2, b: 5 } // take-off or a big stretch: tall and thin
    default:
      return { l: 2, r: 11, t: 0, b: 5 }
  }
}

function armCells(arm: Arm, edge: number, side: -1 | 1, a: number): { body: Cell[]; front: Cell[] } {
  const out = (k: number) => edge + side * k
  const inward = (k: number) => edge - side * k
  switch (arm) {
    case 'up':
      // Angled up and away from the head, so it reads as an arm, not a horn.
      return { body: [[out(1), a], [out(1), a + 1], [out(2), a - 1], [out(2), a], [out(3), a - 2]], front: [] }
    case 'out':
      return { body: [[out(1), a], [out(2), a], [out(3), a], [out(1), a + 1]], front: [] }
    case 'low':
      return { body: [[out(1), a + 1], [out(1), a + 2]], front: [] }
    case 'chin':
      return { body: [[out(1), a + 1]], front: [[inward(1), a + 2], [inward(2), a + 2], [inward(3), a + 1]] }
    default:
      return { body: [[out(1), a], [out(2), a], [out(1), a + 1], [out(2), a + 1]], front: [] }
  }
}

function eyeCells(p: Pose, l: number, r: number, t: number): Cell[] {
  const eL = l + 2 + p.gx
  const eR = r - 2 + p.gx
  const row = t + 1 + p.gy
  const rowR = row + p.tilt
  switch (p.eyes) {
    case 'blink':
    case 'dot':
      return [[eL, row + 1], [eR, rowR + 1]]
    case 'happy':
      return [[eL - 1, row + 1], [eL, row], [eL + 1, row + 1], [eR - 1, rowR + 1], [eR, rowR], [eR + 1, rowR + 1]]
    case 'closed':
      return [[eL - 1, row + 1], [eL, row + 1], [eR, rowR + 1], [eR + 1, rowR + 1]]
    case 'wide':
      return [[eL - 1, row], [eL, row], [eL - 1, row + 1], [eL, row + 1], [eR, rowR], [eR + 1, rowR], [eR, rowR + 1], [eR + 1, rowR + 1]]
    default:
      return [[eL, row], [eL, row + 1], [eR, rowR], [eR, rowR + 1]]
  }
}

function legCells(legs: Legs): Cell[] {
  const top: Cell[] = [[3, 6], [5, 6], [8, 6], [10, 6]]
  const feet: Record<Legs, number[]> = {
    stand: [3, 5, 8, 10],
    stepA: [2, 5, 7, 10],
    stepB: [3, 6, 8, 11],
    splay: [2, 4, 9, 11],
    lift: [3, 5, 8],
  }
  return [...top, ...feet[legs].map(c => [c, 7] as Cell)]
}

/** Sprite pixels by "col,row". */
type Pixels = Map<string, { c: number; r: number; color: string }>

/** A grid to paint on. A later `put` on the same cell wins, so parts go back to front. */
function canvas() {
  const cells: Pixels = new Map()
  const put = (list: readonly Cell[], color: string, dx = 0, dy = 0) => {
    for (const [c, r] of list) cells.set(`${c + dx},${r + dy}`, { c: c + dx, r: r + dy, color })
  }
  return { cells, put }
}

/** One path per colour, in `order`. */
function paint(cells: Pixels, order: readonly string[], under = ''): string {
  const byColor = new Map<string, string>()
  for (const { c, r, color } of cells.values()) {
    byColor.set(color, (byColor.get(color) ?? '') + `M${OX + c * U} ${OY + r * U}h${U}v${U}h-${U}z`)
  }
  let out = under
  for (const color of order) {
    const d = byColor.get(color)
    if (d !== undefined) out += `<path d="${d}" fill="${color}"/>`
  }
  return out
}

function propsSvg(props: readonly Prop[]): string {
  return props
    .map(prop => {
      const d = prop.cells
        .map(([c, r]) => `M${(OX + prop.c * U + c * prop.p).toFixed(1)} ${(OY + prop.r * U + r * prop.p).toFixed(1)}h${prop.p}v${prop.p}h-${prop.p}z`)
        .join('')
      return `<path d="${d}" fill="${prop.color}"/>`
    })
    .join('')
}

/**
 * One frame, in three layers that animate separately: the figure (body, legs,
 * arms, shadow, laptop), the eyes on top of it, and the props around it. A
 * blink then changes only the eyes layer instead of redrawing the critter.
 */
type Layers = { figure: string; eyes: string; props: string }
const LAYERS = ['figure', 'eyes', 'props'] as const

/** A frame's pixels before they become SVG. */
type Drawing = { figure: Pixels; eyes: Pixels; order: readonly string[]; under: string; props: readonly Prop[] }

function frame(p: Pose): Layers {
  const d = draw(p)
  return { figure: paint(d.figure, d.order, d.under), eyes: paint(d.eyes, [INK]), props: propsSvg(d.props) }
}

function draw(p: Pose): Drawing {
  if (p.side) return drawSide(p)
  const fig = canvas()
  const eyes = canvas()
  const { l, r, t, b } = bodyBox(p.body)
  const top = p.y
  const lean = p.lean
  const a = t + 2 // the row the arms hang from
  const left = armCells(p.armL, l, -1, a)
  // Holding the mug, the right hand is drawn with the mug instead.
  const m = p.mug === 'none' ? null : t + { low: 3, mid: 2, sip: 0, gulp: -1 }[p.mug] // the mug's top row
  const right = m === null ? armCells(p.armR, r, 1, a) : { body: [], front: [] }

  // Lit from the top left, like the side view: the legs sit in the body's
  // shadow, the right column and bottom row are darker, and the top-left
  // corner catches a highlight.
  // Tipped back to drink, as in the coffee reference: the top steps up toward
  // the right, where the face is, one row every few columns, and a row more on
  // a gulp. The mug sits against the face inside that raised part.
  const raised = p.mug === 'gulp' ? t - 2 : t - 1
  const topOf = (c: number) => (p.body !== 'tipped' ? t : c <= l + 2 ? t + 1 : c <= l + 5 ? t : raised)
  const columns = block(l, 0, r, 0).map(([c]) => c)
  fig.put(legCells(p.legs), SIDE, 0, top)
  fig.put(columns.flatMap(c => block(c, topOf(c), c, b)), BODY, lean, top)
  fig.put([...block(r, topOf(r), r, b), ...block(l, b, r, b)], SIDE, lean, top)
  fig.put([[l, topOf(l)], [l + 1, topOf(l + 1)]], LIGHT, lean, top)
  fig.put([...left.body, ...right.body], BODY, lean, top)
  fig.put([...left.front, ...right.front], SHADE, lean, top)
  // Tipped back, both eyes sit left of the mug, closed, each the same
  // distance below its part of the sloping top.
  const tippedEyes: Cell[] = [[l + 1, t + 3], [l + 2, t + 3], [l + 4, t + 2], [l + 5, t + 2]]
  eyes.put(p.body === 'tipped' ? tippedEyes : eyeCells(p, l, r, t), INK, lean, top)
  if (m !== null && p.body === 'tipped') {
    // Drinking: the mug tilted against the face, its bottom up and to the
    // right, the rim at the bottom left where the mouth is; the handle on the
    // body's edge and the hand just outside it.
    const x = r - 3
    fig.put([[x + 1, m], [x + 2, m], [x, m + 1], [x + 1, m + 1], [x + 2, m + 1], [x, m + 2], [x + 1, m + 2]], MUG, lean, top)
    fig.put([[x + 2, m], [x + 2, m + 1], [r, m + 1]], MUG_SHADE, lean, top)
    fig.put([...block(r + 1, m + 1, r + 1, a + 1), [r + 1, m + 2]], BODY, lean, top)
    for (const [c, row] of block(x, m, x + 2, m + 2)) eyes.cells.delete(`${c + lean},${row + top}`)
  } else if (m !== null) {
    // A mug three pixels square in front of the right side of the body, its
    // right column in shade, the handle sticking out, the hand holding it.
    fig.put(block(r - 2, m, r, m + 2), MUG, lean, top)
    fig.put([...block(r, m, r, m + 2), [r + 1, m + 1]], MUG_SHADE, lean, top)
    // The arm runs up the side from the shoulder to the hand.
    fig.put([...block(r + 1, Math.min(m + 2, a + 1), r + 1, a + 1), [r + 2, m + 1], [r + 2, m + 2]], BODY, lean, top)
    // Held low it is seen from a little above: the coffee shows at the top.
    if (p.mug === 'low') fig.put([[r - 2, m], [r - 1, m]], COFFEE, lean, top)
    // The mug hides whatever part of the right eye is behind it.
    for (const [c, row] of block(r - 2, m, r, m + 2)) eyes.cells.delete(`${c + lean},${row + top}`)
  }
  return { figure: fig.cells, eyes: eyes.cells, order: [SIDE, BODY, LIGHT, SHADE, MUG, MUG_SHADE, COFFEE], under: shadow(p.y, 7), props: p.props }
}

/**
 * Turned three-quarters to the left, typing on a laptop on the ground, as in
 * the reference: body in columns 5-12 with the far side (11-12) darker, eyes
 * near the front edge, the near arm reaching forward at mid height, the far
 * hand (darker) down on the keys, the screen tilted open toward it.
 * `armL` is the near arm (tap or hover), `armR` the far hand (tap, hover or
 * reach, one key further on).
 */
function drawSide(p: Pose): Drawing {
  const { cells, put } = canvas()
  const eyes = canvas()
  const t = p.body === 'bob' ? 1 : 0

  // The laptop: open, the screen a diagonal lit on the side facing the
  // critter; half open, a shorter diagonal; closed, a flat slab; or not there.
  let laptop = ''
  if (p.lid === 'open') {
    put([[1, 7], [0, 6], [-1, 5]], SCREEN)
    put([[1, 6], [0, 5]], p.screen ? LIT : DIM)
  } else if (p.lid === 'half') {
    put([[1, 7], [0, 7], [-1, 6]], SCREEN)
  } else if (p.lid === 'closed') {
    laptop += `<rect x="${OX + U}" y="${OY + 8 * U - 4}" width="${5 * U}" height="2" fill="${SCREEN}"/>`
  }
  if (p.lid !== 'none') laptop += `<rect x="${OX + U}" y="${OY + 8 * U - 2}" width="${5 * U}" height="2" fill="${KEYBOARD}"/>`

  put([[5, 6], [5, 7], [7, 6], [7, 7], [10, 6], [10, 7]], BODY)
  put([[12, 6], [12, 7]], SIDE)
  put(block(5, t, 10, 5), BODY)
  put(block(11, t, 12, 5), SIDE)

  const ex = 5 + p.gx
  const ex2 = 9 + p.gx
  eyes.put(p.eyes === 'blink' ? [[ex, t + 2], [ex2, t + 2]] : [[ex, t + 1], [ex, t + 2], [ex2, t + 1], [ex2, t + 2]], INK)

  const far: Record<string, Cell[]> = {
    tap: [[3, 5], [4, 5], [3, 6], [4, 6]],
    hover: [[3, 4], [4, 4], [3, 5], [4, 5]],
    reach: [[2, 5], [3, 5], [2, 6], [3, 6]],
  }
  put(far[p.armR] ?? far.tap ?? [], SIDE)
  put(p.armL === 'tap' ? [[4, t + 3], [4, t + 4]] : [[4, t + 2], [4, t + 3]], BODY)

  return { figure: cells, eyes: eyes.cells, order: [SIDE, BODY, SCREEN, LIT, DIM], under: shadow(0, 8.5) + laptop, props: p.props }
}

function block(c0: number, r0: number, c1: number, r1: number): Cell[] {
  const out: Cell[] = []
  for (let row = r0; row <= r1; row++) for (let c = c0; c <= c1; c++) out.push([c, row])
  return out
}

/** A soft shadow on the ground, centred on `center`, shrinking while in the air. */
function shadow(y: number, center: number): string {
  const width = Math.max(4, 9 + y) * U
  return `<rect x="${OX + center * U - width / 2}" y="${OY + 8 * U - 2}" width="${width}" height="2" fill="#000" opacity="0.18"/>`
}

// ---- turning a timeline into an animation ----

type Beat = readonly [Pose, number]
type Extras = (tick: number) => Prop[]

/**
 * Plays `intro` once (a transition into this mood), then plays `loop` over
 * and over: each pose held for its number of frames. `extras` adds props per
 * frame of the loop (things that float or fall). Each layer runs on its own:
 * every distinct drawing of a layer appears once and is switched on and off
 * in its slots.
 */
function animate(loop: readonly Beat[], extras?: Extras, intro: readonly Beat[] = []): string {
  const cache = new Map<string, Layers>()
  const expand = (beats: readonly Beat[], add?: Extras) => {
    const ticks: Layers[] = []
    for (const [p, held] of beats) {
      const n = Math.max(1, Math.round((held * FPS) / AUTHORED_FPS))
      for (let i = 0; i < n; i++) {
        // Props step on the authored clock, so they drift at the speed they were written for.
        const props = [...p.props, ...(add?.(Math.floor((ticks.length * AUTHORED_FPS) / FPS)) ?? [])]
        const key = JSON.stringify({ ...p, props })
        let drawn = cache.get(key)
        if (drawn === undefined) {
          drawn = frame({ ...p, props })
          cache.set(key, drawn)
        }
        ticks.push(drawn)
      }
    }
    return ticks
  }
  const first = expand(intro)
  const repeat = expand(loop, extras)
  const timing = { introDur: (first.length / FPS).toFixed(2), loopDur: (repeat.length / FPS).toFixed(2) }
  return LAYERS.map(layer => track(layer, first.map(t => t[layer]), repeat.map(t => t[layer]), timing)).join('')
}

/**
 * One layer's drawings over time: `first` plays once, then `repeat` loops.
 * An empty drawing ('') is no group at all: at those moments nothing of the
 * layer is switched on.
 */
function track(
  layer: string,
  first: readonly string[],
  repeat: readonly string[],
  { introDur, loopDur }: { introDur: string; loopDur: string },
): string {
  const all = [...first, ...repeat]
  const unique = [...new Set(all)].filter(f => f !== '')
  if (unique.length === 0) return ''
  if (unique.length === 1 && all.every(f => f === unique[0])) return `<g data-l="${layer}">${unique[0]}</g>`

  // A drawing's on/off switches over one run of ticks, as values and keyTimes.
  const switches = (ticks: readonly string[], f: string) => {
    const values: string[] = []
    const times: string[] = []
    let last = ''
    ticks.forEach((t, i) => {
      const v = t === f ? '1' : '0'
      if (v !== last) {
        values.push(v)
        times.push((i / ticks.length).toFixed(4))
        last = v
      }
    })
    return `values="${values.join(';')}" keyTimes="${times.join(';')}"`
  }
  return unique
    .map(f => {
      const shownFirst = (first.length > 0 ? first[0] : repeat[0]) === f
      const once =
        first.length > 0 && first.includes(f)
          ? `<animate attributeName="opacity" calcMode="discrete" ${switches(first, f)} dur="${introDur}s"/>`
          : ''
      const always = `<animate attributeName="opacity" calcMode="discrete" ${switches(repeat, f)} begin="${introDur}s" dur="${loopDur}s" repeatCount="indefinite"/>`
      return `<g data-l="${layer}" opacity="${shownFirst ? 1 : 0}">${f}${once}${always}</g>`
    })
    .join('')
}

const prop = (cells: readonly Cell[], color: string, c: number, r: number, p = 2): Prop => ({ cells, color, c, r, p })

// ---- the moods ----

const STAND = pose({})
const with_ = (p: Pose, over: Partial<Pose>) => ({ ...p, ...over })

/**
 * A breath: hold, then one sprite pixel down, then back. Whole pixels only:
 * half-transparent in-between frames read as a faint ghost trailing the body
 * on this 5-pixel grid, and made the movement look like slow motion.
 */
function breath(p: Pose, rest: number, out: number): Beat[] {
  const down = with_(p, { body: 'bob' })
  return [[p, rest + 1], [down, out + 1]]
}

/** Steam off the mug: two wisps rising and swaying, `k` the step (0-2). */
function steam(k: number, m = 3): Prop[] {
  return [0, 1].map(i => {
    const rise = (k + i * 1.5) % 3
    return prop(WISP, STEAM, 9.4 + i * 1.2 + (k % 2) * 0.4, m - 2.2 - rise * 1.2, 2.5)
  })
}

/** A coffee break: picks up the mug, two sips, then puts it back down out of sight. */
function coffee(): Beat[] {
  const cup = (mug: Pose['mug'], over: Partial<Pose> = {}) => pose({ mug, ...over })
  const drink = (mug: 'sip' | 'gulp', over: Partial<Pose> = {}) => cup(mug, { body: 'tipped', eyes: 'closed', ...over })
  const sip = (gulps: number): Beat[] => [
    [cup('low', { body: 'bob', eyes: 'closed' }), 1], // a little dip before lifting
    [cup('mid', { eyes: 'closed', gx: -1 }), 1], // eyes to the left, clear of the mug on its way up
    [drink('sip'), 3], // tips back, the mug at its mouth
    // Each gulp tips the head and the mug back one row further, then down again.
    ...Array.from({ length: gulps }, (_, i): Beat[] => [[drink('gulp', i === gulps - 1 ? { legs: 'lift' } : {}), 3], [drink('sip'), 2]]).flat(),
    [drink('sip'), 2],
    [cup('mid', { eyes: 'happy', gx: -1 }), 1],
  ]
  return [
    [pose({ armR: 'out', gx: 1 }), 2], // reaches to the side for it
    [cup('low', { gx: 1 }), 2], // brings it in and looks at it
    [cup('low', { gx: 1, props: steam(0) }), 3],
    [cup('low', { props: steam(1) }), 3],
    [cup('low', { props: steam(2) }), 2],
    ...sip(2),
    [cup('low', { eyes: 'happy', props: steam(0) }), 4], // contented
    [cup('low', { eyes: 'happy', body: 'bob', props: steam(1) }), 4], // a happy sigh
    [cup('low', { eyes: 'happy', props: steam(2) }), 3],
    [cup('low', { eyes: 'blink', props: steam(0) }), 1],
    [cup('low', { props: steam(1) }), 3],
    ...sip(1),
    [cup('low', { eyes: 'happy', props: steam(2) }), 5],
    [cup('low', { eyes: 'happy', body: 'bob', props: steam(0) }), 3],
    [pose({ armR: 'out', eyes: 'happy' }), 2], // puts it back down
    [STAND, 3],
  ]
}

function idle(intro: readonly Beat[]): string {
  const lookL = with_(STAND, { gx: -1 })
  const lookR = with_(STAND, { gx: 1 })
  const reach = pose({ body: 'stretch', armL: 'up', armR: 'up', eyes: 'closed' })
  return animate([
    ...breath(STAND, 8, 4), [with_(STAND, { eyes: 'blink' }), 1], ...breath(STAND, 5, 4),
    ...glance(STAND, -1), ...breath(lookL, 6, 3), ...glance(lookL, 0), [STAND, 2],
    ...glance(STAND, 1), ...breath(lookR, 5, 3), ...glance(lookR, 0),
    ...coffee(),
    // a little foot tap
    [with_(STAND, { legs: 'lift' }), 2], [STAND, 2], [with_(STAND, { legs: 'lift' }), 2], [STAND, 4],
    ...breath(STAND, 5, 4), [with_(STAND, { eyes: 'blink' }), 1], [STAND, 2], [with_(STAND, { eyes: 'blink' }), 1],
    // a big stretch, arms up, eased in and out
    [with_(STAND, { body: 'squash' }), 2],
    [reach, 3], [with_(reach, { y: -1 }), 4],
    [pose({ armL: 'out', armR: 'out' }), 3], [STAND, 8],
  ], undefined, intro)
}

function sleepy(intro: readonly Beat[]): string {
  const z = pose({ eyes: 'closed', armL: 'low', armR: 'low' })
  const zb = with_(z, { body: 'bob' })
  return animate(
    [
      ...breath(z, 10, 8), ...breath(z, 8, 6),
      [with_(zb, { gy: 1 }), 6], [with_(z, { body: 'squash' }), 2], [with_(z, { body: 'bob' }), 1], [z, 4],
    ],
    tick =>
      // One "z" at a time drifts up and out, growing as it goes.
      [0, 1].flatMap(k => {
        const phase = (tick + k * 12) % 24
        const step = Math.floor(phase / 3)
        return phase < 18 ? [prop(ZED, GREY, 11.6 + step * 0.35, -step * 0.9, 1 + step * 0.25)] : []
      }),
    intro,
  )
}

function thinking(intro: readonly Beat[]): string {
  const think = pose({ gx: 1, gy: -1, armR: 'chin' })
  const lift = with_(think, { legs: 'lift' })
  const dots = (n: number) =>
    [[12.2, 0.2, 2], [13.2, -1.2, 3], [12.6, -3, 4]].slice(0, n).map(([c, r, p]) => prop(DOT, '#E9DED3', c ?? 0, r ?? 0, p ?? 2))
  return animate([
    [with_(think, { props: dots(1) }), 4], [with_(think, { props: dots(2) }), 4], [with_(think, { props: dots(3) }), 6],
    [with_(lift, { props: dots(3) }), 2], [with_(think, { props: dots(3) }), 2], [with_(lift, { props: dots(3) }), 2],
    [with_(think, { props: dots(3) }), 4], [with_(think, { gx: 0, props: dots(3) }), 6], [with_(think, { gx: 0, eyes: 'blink' }), 1],
    [with_(think, { gx: 0 }), 3], ...breath(think, 1, 3),
  ], undefined, intro)
}

function typing(intro: readonly Beat[]): string {
  // Each letter is one keystroke frame: A is the reference pose (far hand on
  // the keys), B both arms lifted, C the far hand one key further on.
  const strokes: Record<string, Partial<Pose>> = {
    A: { armL: 'hover', armR: 'tap' },
    B: { armL: 'tap', armR: 'hover' },
    C: { armL: 'hover', armR: 'reach' },
  }
  const key = (ch: string, over: Partial<Pose> = {}) => pose({ side: true, ...strokes[ch], ...over })
  // The body breathes under the keystrokes, one pixel down and back.
  const breathing: Partial<Pose>[] = [{}, {}, {}, { body: 'bob' }, { body: 'bob' }, { body: 'bob' }]
  const burst = (rhythm: string, from: number): Beat[] =>
    [...rhythm].map((ch, i) => [key(ch, { screen: (from + i) % 2, ...breathing[(from + i) % 6] }), 1])

  return animate(
    [
      ...burst('ABABACABAB', 0),
      [key('A'), 3], // a pause to read
      ...burst('BABCABAB', 1),
      [key('A', { gx: 1 }), 5], // a glance back at you
      [key('A', { gx: 1, eyes: 'blink' }), 1],
      [key('A', { gx: 1 }), 2],
      ...burst('ABACABABAB', 0),
      [key('A', { eyes: 'blink' }), 1],
      [key('A', { body: 'bob' }), 4],
    ],
    // Little bits of code drifting up off the screen.
    tick =>
      [0, 1].flatMap(k => {
        const phase = (tick + k * 5) % 10
        const colors = ['#7FD1AE', '#9FD3FF', GOLD]
        return phase < 7 ? [prop(DOT, colors[(Math.floor(tick / 10) + k) % 3] ?? GOLD, -1.2 + k * 0.9, 4.2 - phase * 0.7, 2)] : []
      }),
    intro,
  )
}

/**
 * A jump on an eased arc: quick off the ground, a beat over the top, quick
 * back down. Whole pixels and only five frames in the air, so it stays snappy.
 */
function hop(face: Partial<Pose>, height: number, arms: Arm, crouch = 2): Beat[] {
  const arc = [0.6, 0.9, 1, 0.9, 0.6].map(s => -Math.round(height * s))
  const air = (y: number) => pose({ ...face, armL: arms, armR: arms, y })
  const squash = pose({ ...face, body: 'squash' })
  return [
    [squash, crouch], // anticipation, held
    [pose({ ...face, body: 'stretch', armL: arms, armR: arms, y: -1 }), 1], // take-off, stretched tall
    ...arc.map(y => [air(y), 1] as Beat),
    [with_(squash, { legs: 'splay', props: dust(0) }), 1], // landing, dust kicks out
    [with_(squash, { legs: 'splay', props: dust(1) }), 1],
    [pose({ ...face, body: 'bob' }), 1], // rising out of the crouch in whole pixels
    [pose({ ...face, y: -1 }), 1], // overshoot: a little bounce
    [pose(face), 1], // settles
  ]
}

/** Two puffs of dust kicking out from the feet, a frame apart (secondary animation). */
function dust(step: number, from = 2, to = 11): Prop[] {
  const spread = step === 0 ? 0.6 : 1.6
  const p = step === 0 ? 2 : 1.5
  return [prop(PUFF, '#B9AEA4', from - spread, 7.1 - step * 0.4, p), prop(PUFF, '#B9AEA4', to + spread, 7.1 - step * 0.4, p)]
}

/** A glance that swings one pixel past where it is going, then settles there. */
const glance = (p: Pose, gx: number): Beat[] => [[with_(p, { gx: gx + Math.sign(gx - p.gx) }), 1]]

function happy(intro: readonly Beat[]): string {
  const face = { eyes: 'happy' as const }
  return animate(
    [[pose(face), 4], ...hop(face, 3, 'up'), [pose(face), 4], [pose({ ...face, body: 'bob' }), 4], [pose(face), 6]],
    tick => {
      const phase = tick % 20
      return phase < 12 ? [prop(HEART, PINK, 11.5, -1 - Math.floor(phase / 3))] : []
    },
    intro,
  )
}

function excited(intro: readonly Beat[]): string {
  const face = { eyes: 'happy' as const }
  return animate(
    [...hop(face, 5, 'up', 3), [pose({ ...face, armL: 'out', armR: 'out' }), 1], ...hop(face, 5, 'up', 3), [pose(face), 2]],
    tick =>
      [[-1.5, 1], [12.8, -1.5], [4, -4.5], [9.5, -4]].flatMap(([c, r], k) =>
        (tick + k * 2) % 6 < 3 ? [prop(SPARKLE, GOLD, c ?? 0, r ?? 0)] : [],
      ),
    intro,
  )
}

function curious(intro: readonly Beat[]): string {
  const a = pose({ tilt: -1, gx: 1 })
  const b = pose({ tilt: 1, gx: -1 })
  return animate(
    [
      [a, 10], [with_(a, { eyes: 'blink' }), 1], [a, 5], [with_(a, { body: 'bob' }), 3], [a, 3],
      [b, 10], [with_(b, { body: 'bob' }), 3], [b, 4], [with_(b, { legs: 'lift' }), 2], [b, 3],
    ],
    tick => [prop(QUESTION, SHADE, 12.4, -5 - (Math.floor(tick / 4) % 2) * 0.4, 3)],
    intro,
  )
}

function worried(intro: readonly Beat[]): string {
  const w = pose({ armL: 'low', armR: 'low' })
  return animate(
    [
      [with_(w, { gx: -1 }), 5], [with_(w, { gx: -1, body: 'bob' }), 2], [with_(w, { gx: 1 }), 5], [w, 2],
      // a nervous shuffle
      [with_(w, { legs: 'stepA', lean: -1 }), 2], [with_(w, { legs: 'stepB', lean: 1 }), 2], [with_(w, { legs: 'stepA', lean: -1 }), 2], [with_(w, { legs: 'stepB', lean: 1 }), 2],
      [with_(w, { eyes: 'blink' }), 1], [w, 3],
    ],
    tick => {
      const phase = tick % 11
      return phase < 8 ? [prop(DROP, BLUE, 12.2, -0.6 + phase * 0.4, 3)] : []
    },
    intro,
  )
}

function sad(intro: readonly Beat[]): string {
  const d = pose({ body: 'bob', eyes: 'dot', gy: 1, armL: 'low', armR: 'low' })
  return animate(
    [[d, 14], [with_(d, { body: 'squash' }), 4], [d, 10], [with_(d, { eyes: 'closed', gy: 0 }), 2], [d, 10]],
    tick => {
      const phase = tick % 12
      return phase < 8 ? [prop(DROP, BLUE, 4.1, 4 + phase * 0.45, 3)] : []
    },
    intro,
  )
}

function surprised(intro: readonly Beat[]): string {
  const face = { eyes: 'wide' as const }
  // The jump back is its entrance (see ENTER); the loop is the wide-eyed after.
  return animate(
    [
      [pose({ ...face, armL: 'out', armR: 'out' }), 8],
      [pose(face), 10], [pose({ eyes: 'blink' }), 1], [pose(face), 6], [pose({ ...face, body: 'bob' }), 4], [pose(face), 6],
    ],
    tick => (tick % 8 < 6 ? [prop(BANG, RED, 13, -5, 3)] : []),
    intro,
  )
}

// ---- transitions ----

const side = (over: Partial<Pose>) => pose({ side: true, armL: 'hover', armR: 'tap', ...over })

/** How each mood winds back down to plain standing. */
const EXIT: Partial<Record<MascotMood, readonly Beat[]>> = {
  typing: [
    [side({ armR: 'hover' }), 2], // hands off the keys
    [side({ lid: 'half', armR: 'hover' }), 2], // folds the screen down
    [side({ lid: 'closed', armL: 'tap', armR: 'tap' }), 2],
    [side({ lid: 'none', body: 'bob', armL: 'tap', armR: 'tap' }), 2], // tucks it away
    [side({ lid: 'none' }), 1],
    [pose({ gx: -1 }), 2], // turns back to face you
    [pose({ eyes: 'blink' }), 1],
    [STAND, 1],
  ],
  thinking: [[pose({ gx: 1, gy: -1, armR: 'low' }), 2], [pose({ eyes: 'blink' }), 1], [STAND, 1]],
  happy: [[pose({ eyes: 'happy', body: 'bob' }), 2], [STAND, 1]],
  excited: [[pose({ eyes: 'happy', body: 'squash', legs: 'splay' }), 2], [pose({ eyes: 'happy', body: 'bob' }), 2], [STAND, 1]],
  curious: [[pose({ eyes: 'blink' }), 1], [STAND, 1]],
  worried: [[pose({ eyes: 'blink', armL: 'low', armR: 'low' }), 1], [pose({ body: 'bob' }), 3], [STAND, 1]], // a sigh of relief
  sad: [[pose({ body: 'bob', eyes: 'blink', armL: 'low', armR: 'low' }), 3], [pose({ eyes: 'blink' }), 1], [STAND, 2]], // a sniff, then straightens up
  surprised: [[pose({ eyes: 'wide', body: 'bob' }), 2], [pose({ eyes: 'blink' }), 1], [pose({ body: 'squash' }), 1], [STAND, 1]],
  sleepy: [
    [pose({ eyes: 'closed', body: 'bob' }), 2], [pose({ eyes: 'blink' }), 2], // wakes up
    [pose({ body: 'squash' }), 1], [pose({ body: 'stretch', armL: 'up', armR: 'up', eyes: 'closed' }), 4], // a big stretch
    [pose({ eyes: 'blink' }), 1], [STAND, 1],
  ],
}

/** How each mood starts from plain standing, before its loop. */
const ENTER: Partial<Record<MascotMood, readonly Beat[]>> = {
  typing: [
    [pose({ gx: -1 }), 2], // looks to its left
    [side({ lid: 'none' }), 2], // turns
    [side({ lid: 'none', body: 'bob', armL: 'tap', armR: 'tap' }), 2], // reaches down
    [side({ lid: 'closed', armL: 'tap', armR: 'tap', props: dust(0, 0.4, 5.6) }), 1], // sets the laptop down: a puff of dust
    [side({ lid: 'closed', armL: 'tap', armR: 'tap', props: dust(1, 0.4, 5.6) }), 1],
    [side({ lid: 'half', armR: 'hover' }), 2], // opens it
    [side({ armR: 'hover', screen: 1 }), 1], // the screen flickers on
    [side({ armR: 'hover' }), 1],
    [side({ armR: 'hover', screen: 1 }), 2],
  ],
  thinking: [[pose({ gy: -1 }), 2], [pose({ gx: 1, gy: -1, armR: 'low' }), 2]],
  happy: [[pose({ eyes: 'blink' }), 1], [pose({ eyes: 'happy' }), 2], ...hop({ eyes: 'happy' }, 3, 'up')],
  excited: [[pose({ eyes: 'wide' }), 2], [pose({ eyes: 'happy', body: 'squash' }), 2]],
  curious: [[pose({ gx: 1 }), 2], [pose({ gx: 1, tilt: -1, body: 'bob' }), 1]],
  worried: [[pose({ eyes: 'wide' }), 2], [pose({ gx: -1, armL: 'low', armR: 'low' }), 2]],
  sad: [[pose({ eyes: 'blink' }), 1], [pose({ eyes: 'dot', gy: 1 }), 3], [pose({ eyes: 'dot', gy: 1, armL: 'low', armR: 'low' }), 2]],
  surprised: hop({ eyes: 'wide' }, 4, 'out', 1), // a flinch, not a wind-up: surprise is sudden
  sleepy: [
    [pose({ body: 'stretch', armL: 'up', armR: 'up', eyes: 'closed' }), 4], // a yawn
    [pose({ eyes: 'closed' }), 3],
    [pose({ eyes: 'closed', body: 'bob', armL: 'low', armR: 'low' }), 3], // slumps
  ],
}

/** The one-off frames between two moods: the old one's exit, then the new one's entrance. */
function transition(from: MascotMood | undefined, to: MascotMood): readonly Beat[] {
  if (from === undefined || from === to) return []
  return [...(EXIT[from] ?? []), ...(ENTER[to] ?? [])]
}

const MOODS: Record<MascotMood, (intro: readonly Beat[]) => string> = {
  idle,
  sleepy,
  thinking,
  typing,
  happy,
  excited,
  curious,
  worried,
  sad,
  surprised,
}

// The frames for each move between moods never change, so each is drawn once per load.
const drawn = new Map<string, string>()
const sprite = (mood: MascotMood, from: MascotMood | undefined) => {
  const key = `${from ?? ''}>${mood}`
  let svg = drawn.get(key)
  if (svg === undefined) {
    svg = MOODS[mood](transition(from, mood))
    drawn.set(key, svg)
  }
  return svg
}

// ---- speech bubble ----

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function bubble(state: MascotState): string {
  if (state.line === '') return ''
  const dots = state.mood === 'thinking'
  const textWidth = state.line.length * 6.6
  const width = Math.min(BUBBLE_RIGHT - 2, Math.round(textWidth + 18 + (dots ? 16 : 0)))
  const left = BUBBLE_RIGHT - width
  const dotMarks = dots
    ? [0, 1, 2]
        .map(
          i =>
            `<rect x="${left + 9 + textWidth + 4 + i * 5}" y="40" width="3" height="3" fill="#3D2B22" opacity="0.2"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="${i * 0.2}s" calcMode="discrete" repeatCount="indefinite"/></rect>`,
        )
        .join('')
    : ''
  // It pops in with a pixel bounce: 3 px low, 1 px high, then in place.
  return `<g><animateTransform attributeName="transform" type="translate" values="0 3;0 -1;0 0" keyTimes="0;0.4;0.8" dur="0.25s" calcMode="discrete" fill="freeze"/>
<rect x="${left}" y="29" width="${width}" height="20" fill="#FFFBF6" stroke="#C9B3A3" stroke-width="1.5"/>
<rect x="${BUBBLE_RIGHT}" y="36" width="4" height="4" fill="#C9B3A3"/><rect x="${BUBBLE_RIGHT + 4}" y="39" width="3" height="3" fill="#C9B3A3"/>
<text x="${left + 9}" y="43" font-size="11" font-family="${MONO}" fill="#3D2B22">${escape(state.line)}</text>${dotMarks}</g>`
}

/** The whole picture for one state, as an SVG document. */
export function drawMascot(state: MascotState): string {
  // The picture is shown as an image now, which has no backdrop. The style line
  // stays for the case of a frame, whose backdrop turns solid white when its
  // colour scheme differs from the page around it.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" shape-rendering="crispEdges">
<style>:root{color-scheme:light dark;background:transparent}</style>
${bubble(state)}
${sprite(state.mood, state.from)}
</svg>`
}

/** The terminal has no pictures: a little text face instead. */
export const FACES: Record<MascotMood, string> = {
  idle: '▐▛▘▝▜▌',
  sleepy: '▐▀▀▀▀▌ zZ',
  thinking: '▐▛▘▝▜▌…',
  typing: '▐▛▘▝▜▌⌨',
  happy: '▐^▀▀^▌',
  excited: '\\▐^▀▀^▌/',
  curious: '▐▛▘ ▖▌?',
  worried: '▐▛▘▝▜▌;',
  sad: '▐▖▀▀▗▌',
  surprised: '▐█▀▀█▌!',
}
