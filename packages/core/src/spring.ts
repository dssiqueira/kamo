/** Physics for every Kamo animation: camera, cursor and UI (rule 10). Never linear. */
export const SPRING = { stiffness: 170, damping: 26 } as const

export interface SpringConfig {
  stiffness: number
  damping: number
}

export interface SpringState {
  /** position */
  x: number
  /** velocity, units per second */
  v: number
}

/**
 * Advances a unit-mass damped spring toward `target` by `dt` seconds using the exact
 * closed-form solution, not a numeric integrator. The result does not depend on how `dt`
 * is split, so preview (any frame rate) and export land on the same values (rule 11).
 */
export function springStep(
  state: SpringState,
  target: number,
  dt: number,
  config: SpringConfig = SPRING,
): SpringState {
  if (dt <= 0) return state
  const k = config.stiffness
  const c = config.damping
  const omega = Math.sqrt(k)
  const zeta = c / (2 * omega)
  const x0 = state.x - target
  const v0 = state.v

  if (Math.abs(zeta - 1) < 1e-6) {
    // Critically damped: (A + B t) e^{-ωt}
    const b = v0 + omega * x0
    const decay = Math.exp(-omega * dt)
    return {
      x: target + (x0 + b * dt) * decay,
      v: (b - omega * (x0 + b * dt)) * decay,
    }
  }

  if (zeta < 1) {
    // Underdamped: e^{-ζωt} (A cos ωd t + B sin ωd t)
    const omegaD = omega * Math.sqrt(1 - zeta * zeta)
    const a = x0
    const b = (v0 + zeta * omega * x0) / omegaD
    const decay = Math.exp(-zeta * omega * dt)
    const cos = Math.cos(omegaD * dt)
    const sin = Math.sin(omegaD * dt)
    const x = decay * (a * cos + b * sin)
    const v =
      decay * ((b * omegaD - zeta * omega * a) * cos - (a * omegaD + zeta * omega * b) * sin)
    return { x: target + x, v }
  }

  // Overdamped: A e^{r1 t} + B e^{r2 t}
  const root = omega * Math.sqrt(zeta * zeta - 1)
  const r1 = -zeta * omega + root
  const r2 = -zeta * omega - root
  const b = (v0 - r1 * x0) / (r2 - r1)
  const a = x0 - b
  const e1 = Math.exp(r1 * dt)
  const e2 = Math.exp(r2 * dt)
  return { x: target + a * e1 + b * e2, v: a * r1 * e1 + b * r2 * e2 }
}

/** True once the spring is visually at rest (within `epsilon` of the target, nearly still). */
export function springSettled(state: SpringState, target: number, epsilon = 0.01): boolean {
  return Math.abs(state.x - target) < epsilon && Math.abs(state.v) < epsilon * 10
}

/**
 * Seconds a spring needs to go from rest at `distance` from the target until it settles.
 * Lets the camera start moving `leadMs` early and arrive on the click (F-06).
 */
export function springSettleTime(
  distance: number,
  epsilon = 0.01,
  config: SpringConfig = SPRING,
  maxSeconds = 5,
): number {
  const dt = 1 / 1000
  let state: SpringState = { x: distance, v: 0 }
  for (let t = 0; t < maxSeconds; t += dt) {
    if (springSettled(state, 0, epsilon)) return t
    state = springStep(state, 0, dt, config)
  }
  return maxSeconds
}
