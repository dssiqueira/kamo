// The 3-2-1 over the recorded tab (E-01, flows.md step 3). Injected with
// `chrome.scripting.executeScript` (activeTab), one call per number, and removed before the
// first recorded frame: during the recording nothing of Kamo is in the page.
//
// Each function is serialized on its own, so it must not use anything from outside its body.
// It only draws: no listeners of any kind, and it reads nothing from the page (rule 2).

export interface CountdownLook {
  /** Already formatted with Intl for the browser language. */
  label: string
  surface: string
  text: string
  shadow: string
}

export function showCountdown(look: CountdownLook): void {
  const id = 'kamo-countdown-overlay'
  let host = document.getElementById(id)
  if (!host) {
    host = document.createElement('div')
    host.id = id
    // A closed shadow root keeps the page's CSS away from the overlay and vice versa.
    const root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = `
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
        display: flex; align-items: center; justify-content: center; }
      .disc { width: 220px; height: 220px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; font: 400 140px/1 Georgia, serif; }
      @media (prefers-reduced-motion: no-preference) {
        .disc span { animation: kamo-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
      }
      @keyframes kamo-in { from { transform: scale(1.2); } to { transform: scale(1); } }`
    const disc = document.createElement('div')
    disc.className = 'disc'
    disc.append(document.createElement('span'))
    root.append(style, disc)
    ;(host as HTMLElement & { kamoDisc?: HTMLElement }).kamoDisc = disc
    document.documentElement.append(host)
  }
  const disc = (host as HTMLElement & { kamoDisc?: HTMLElement }).kamoDisc
  if (!disc) return
  disc.style.background = look.surface
  disc.style.color = look.text
  disc.style.boxShadow = look.shadow
  const number = document.createElement('span')
  number.textContent = look.label
  disc.replaceChildren(number)
}

export function removeCountdown(): void {
  document.getElementById('kamo-countdown-overlay')?.remove()
}
