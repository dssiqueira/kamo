// E-02: "the content script has no keyboard listener nor any DOM reading beyond the coordinates
// (verifiable in the code)". These checks read the source of everything injected into a page.
import { describe, expect, it } from 'vitest'

/** Every script in this folder, as text (the tests themselves left out). */
const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const injected = Object.keys(sources).map((path) => path.slice(2))
/** The code without its comments, which may name what the code must not do. */
const code = (file: string) =>
  (sources[`./${file}`] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('scripts injected into the recorded page', () => {
  it('never listen to the keyboard', () => {
    expect(injected.length).toBeGreaterThan(1)
    for (const file of injected) {
      expect(code(file)).not.toMatch(/key(down|up|press)|onkey|KeyboardEvent|\.key\b|\.code\b/i)
    }
  })

  it('listen to the mouse only', () => {
    const source = code('mouse-capture.ts')
    const listened = [...source.matchAll(/addEventListener\(\s*'([a-z]+)'/g)].map((m) => m[1])
    expect(new Set(listened)).toEqual(
      new Set(['mousemove', 'mousedown', 'mouseup', 'wheel', 'mouseout']),
    )
  })

  it('never read the page content', () => {
    const forbidden =
      /querySelector|getElementBy|innerText|innerHTML|outerHTML|textContent|\.value\b|\.target\b|getSelection|document\.|location|localStorage|sessionStorage|clipboard|composedPath|getComputedStyle/
    expect(code('mouse-capture.ts')).not.toMatch(forbidden)
  })
})
