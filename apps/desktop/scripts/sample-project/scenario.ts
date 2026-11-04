// The sample recording: a ~19s session on a fake product screen, written with the same
// generator the engine fixtures use (packages/core/fixtures/generate.ts). Each action is
// tagged with the time it happens so the page can make the UI under the click react.
import type { MouseEventRecord } from '../../../../packages/core/src/events/events.ts'
import { FIXTURES, FIXTURE_VIDEO } from '../../../../packages/core/fixtures/generate.ts'

export const VIDEO = FIXTURE_VIDEO

/** What the page needs to animate the fake UI; times are ms since the recording start. */
export interface Scenario {
  durationMs: number
  events: MouseEventRecord[]
  targets: typeof TARGETS
  marks: {
    navClick: number
    newClick: number
    fieldClick: number
    toggleClick: number
    createClick: number
    dragStart: number
    dragEnd: number
    scrolls: { t: number; dy: number }[]
  }
}

type Point = { x: number; y: number }
type Button = 'left' | 'right' | 'middle'

/** The fixtures' Recording class is not exported; this is the part of it we drive. */
interface Recording {
  readonly events: MouseEventRecord[]
  t: number
  moveTo(to: Point, durationMs: number): Recording
  wait(ms: number): Recording
  click(button?: Button): Recording
  scroll(dy: number): Recording
  drag(to: Point, durationMs: number): Recording
}

// Reuse the generator itself (60Hz moves with hand jitter, 80ms clicks) by taking the class
// from any fixture, so the sample moves exactly like the recordings the engine is tested on.
const RecordingClass = Object.getPrototypeOf(FIXTURES['spaced-clicks']()).constructor as new (
  seed: number,
  start: Point,
) => Recording

/** Where the fake UI puts each target; the page draws the elements at these points. */
export const TARGETS = {
  nav: { x: 150, y: 330 },
  newButton: { x: 1720, y: 110 },
  field: { x: 1600, y: 330 },
  toggle: { x: 1790, y: 470 },
  create: { x: 1760, y: 960 },
  cardFrom: { x: 560, y: 470 },
  cardTo: { x: 1080, y: 470 },
  scroll: { x: 900, y: 760 },
} as const

export function buildScenario(): Scenario {
  const rec = new RecordingClass(7, { x: 960, y: 540 })
  const at = () => rec.t

  rec.wait(800).moveTo(TARGETS.nav, 1000)
  const navClick = at()
  rec.click().wait(1500).moveTo(TARGETS.newButton, 1100)
  const newClick = at()
  rec.click().wait(1200).moveTo(TARGETS.field, 700)
  const fieldClick = at()
  rec.click().wait(1500).moveTo(TARGETS.toggle, 600)
  const toggleClick = at()
  rec.click().wait(1000).moveTo(TARGETS.create, 900)
  const createClick = at()
  rec.click().wait(1200).moveTo(TARGETS.cardFrom, 900).wait(300)
  const dragStart = at()
  rec.drag(TARGETS.cardTo, 1500)
  const dragEnd = at()
  rec.wait(900).moveTo(TARGETS.scroll, 700).wait(200)
  const scrolls: { t: number; dy: number }[] = []
  for (let i = 0; i < 4; i++) {
    scrolls.push({ t: at(), dy: 120 })
    rec.scroll(120).wait(150)
  }
  rec.wait(1800)

  return {
    durationMs: Math.ceil(rec.t),
    events: rec.events,
    targets: TARGETS,
    marks: {
      navClick,
      newClick,
      fieldClick,
      toggleClick,
      createClick,
      dragStart,
      dragEnd,
      scrolls,
    },
  }
}
