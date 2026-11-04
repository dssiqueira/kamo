// Undo/redo for the editor (F-09: at least 50 steps). States are immutable values (each
// edit returns a new Project), so a step is just the previous reference.

export const DEFAULT_HISTORY_CAPACITY = 100

export interface History<T> {
  /** current state */
  readonly present: T
  /**
   * State at `begin()` while a transaction is open, otherwise `present`. A drag computes each
   * update from here with the total delta of the gesture, so clamping never accumulates.
   */
  readonly base: T
  readonly inTransaction: boolean
  canUndo(): boolean
  canRedo(): boolean
  /** Records `next` as a new step. Inside a transaction it only replaces `present`. Same reference = no-op. */
  push(next: T): void
  undo(): T
  redo(): T
  /** Opens a transaction: everything pushed until `commit()` becomes one undo step. */
  begin(): void
  commit(): void
  /** Ends the transaction going back to `base`. */
  cancel(): void
  /** Replaces the state and clears both stacks (e.g. another project was opened). */
  reset(present: T): void
  subscribe(listener: () => void): () => void
}

export interface HistoryOptions {
  /** steps kept for undo; at least 50 (F-09) */
  capacity?: number
}

export function createHistory<T>(initial: T, options: HistoryOptions = {}): History<T> {
  const capacity = Math.max(50, Math.floor(options.capacity ?? DEFAULT_HISTORY_CAPACITY))
  let present = initial
  let base: T | null = null
  let past: T[] = []
  let future: T[] = []
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  const record = (previous: T) => {
    past.push(previous)
    if (past.length > capacity) past.splice(0, past.length - capacity)
    future = []
  }

  const commit = () => {
    if (base === null) return
    const previous = base
    base = null
    if (previous !== present) record(previous)
  }

  return {
    get present() {
      return present
    },
    get base() {
      return base ?? present
    },
    get inTransaction() {
      return base !== null
    },
    canUndo: () => past.length > 0 || (base !== null && base !== present),
    canRedo: () => base === null && future.length > 0,
    push(next) {
      if (next === present) return
      if (base === null) record(present)
      present = next
      notify()
    },
    undo() {
      commit()
      const previous = past.pop()
      if (previous === undefined) return present
      future.push(present)
      present = previous
      notify()
      return present
    },
    redo() {
      commit()
      const next = future.pop()
      if (next === undefined) return present
      past.push(present)
      present = next
      notify()
      return present
    },
    begin() {
      if (base === null) base = present
    },
    commit,
    cancel() {
      if (base === null) return
      const changed = base !== present
      present = base
      base = null
      if (changed) notify()
    },
    reset(next) {
      present = next
      base = null
      past = []
      future = []
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
