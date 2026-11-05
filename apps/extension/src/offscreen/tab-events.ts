// EventSource of the extension (E-02): mouse samples from the content script in the recorded
// tab, over a runtime port, turned into events.jsonl records (video pixels, recording time).
// Only the recorded tab's top frame is heard; pauses drop what arrives meanwhile.
import type { EventSource, MouseEventRecord } from '@kamo/core'
import type { Size } from '../shared/capture.ts'
import { MOUSE_PORT } from '../shared/messages.ts'
import { parsePointerSample, toMouseEvent } from '../shared/pointer.ts'

export interface TabEventSourceOptions {
  tabId: number
  /** The recorded video's size (what the coordinates are in). */
  video(): Size
  /** Recording time of a `Date.now()` instant; null while paused. */
  recordedAt(wallMs: number): number | null
}

export class TabEventSource implements EventSource {
  private onEvent: ((event: MouseEventRecord) => void) | null = null
  private paused = false
  private readonly ports = new Set<chrome.runtime.Port>()

  constructor(private readonly options: TabEventSourceOptions) {}

  private readonly onConnect = (port: chrome.runtime.Port) => {
    if (port.name !== MOUSE_PORT) return
    const sender = port.sender
    if (sender?.tab?.id !== this.options.tabId || (sender.frameId ?? 0) !== 0) {
      port.disconnect()
      return
    }
    this.ports.add(port)
    port.onDisconnect.addListener(() => this.ports.delete(port))
    port.onMessage.addListener((message: unknown) => this.receive(message))
  }

  start(onEvent: (event: MouseEventRecord) => void): Promise<void> {
    this.onEvent = onEvent
    this.paused = false
    chrome.runtime.onConnect.addListener(this.onConnect)
    return Promise.resolve()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  stop(): Promise<void> {
    chrome.runtime.onConnect.removeListener(this.onConnect)
    // The content script hears the disconnect and removes its listeners.
    for (const port of this.ports) port.disconnect()
    this.ports.clear()
    this.onEvent = null
    return Promise.resolve()
  }

  /** Exposed for tests and the port listener. */
  receive(message: unknown): void {
    if (this.paused || !this.onEvent) return
    const sample = parsePointerSample(message)
    if (!sample) return
    const t = this.options.recordedAt(sample.at)
    if (t === null) return
    const event = toMouseEvent(sample, this.options.video(), t)
    if (event) this.onEvent(event)
  }
}
