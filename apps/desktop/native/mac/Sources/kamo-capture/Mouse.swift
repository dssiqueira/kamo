// Mouse events for F-03 (D-003, D-023, D-043): an AppKit global monitor whose mask is built from
// mouse event types and nothing else (AGENTS.md rule 2: Kamo never captures the keyboard, so no
// keyboard event type appears in this file, not even in the mask).
//
// Why a global monitor and not a Quartz event tap: on macOS 26 a listen-only `CGEvent.tapCreate`
// is created but gets no events without Input Monitoring (tccd: "Service kTCCServiceListenEvent
// does not allow prompting; returning denied"), and macOS describes that permission as reading
// keystrokes. AppKit's global monitor needs no permission for mouse events (only key
// events need Accessibility), observes only (it cannot change or block an event) and reports the
// same global coordinates. It does not see events sent to this process, which has no windows.
//
// Threads: AppKit calls the monitor on the main thread (main.swift runs NSApplication); it only
// reads the event, and everything else happens on the Recorder's queue (MouseTrack).
import AppKit
import CoreGraphics
import CoreMedia
import Foundation

enum MouseButton: String, Sendable {
    case left, right, middle
}

/// One mouse event as the monitor saw it: global display coordinates (points, origin at the top
/// left of the main display, y down) and host-clock seconds (the clock of the video frames).
struct RawMouseEvent: Sendable {
    enum Kind: Sendable {
        case move, down, up, scroll
    }

    var kind: Kind
    var host: Double
    var x: Double
    var y: Double
    var button: MouseButton?
    /// Scroll deltas in points (horizontal, vertical), as macOS reports them.
    var scrollX = 0.0
    var scrollY = 0.0
}

// MARK: - Monitor

/// Owns the global mouse monitor. `deliver` is called on the main thread.
final class MouseTap: @unchecked Sendable {
    /// Mouse event types only (rule 2). Drags are moves with a button held.
    static let eventMask: NSEvent.EventTypeMask = [
        .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged,
        .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
        .otherMouseDown, .otherMouseUp, .scrollWheel,
    ]

    private let deliver: @Sendable (RawMouseEvent) -> Void
    // Main thread only.
    private var monitor: Any?
    private var stopped = false

    init(deliver: @escaping @Sendable (RawMouseEvent) -> Void) {
        self.deliver = deliver
    }

    /// Installs the monitor on the main thread. `ready(nil)` once it is in place,
    /// `ready(reason)` if AppKit refuses it.
    func start(ready: @escaping @Sendable (_ problem: String?) -> Void) {
        DispatchQueue.main.async {
            guard !self.stopped else { return }
            self.monitor = NSEvent.addGlobalMonitorForEvents(matching: MouseTap.eventMask) { event in
                self.handle(event)
            }
            ready(self.monitor == nil ? "cannot install the global mouse monitor" : nil)
        }
    }

    func stop() {
        DispatchQueue.main.async {
            self.stopped = true
            if let monitor = self.monitor { NSEvent.removeMonitor(monitor) }
            self.monitor = nil
        }
    }

    /// On the main thread, for every event of the mask.
    private func handle(_ event: NSEvent) {
        guard !stopped, let cgEvent = event.cgEvent else { return }
        let kind: RawMouseEvent.Kind
        var button: MouseButton?
        switch event.type {
        case .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged:
            kind = .move
        case .leftMouseDown:
            kind = .down
            button = .left
        case .leftMouseUp:
            kind = .up
            button = .left
        case .rightMouseDown:
            kind = .down
            button = .right
        case .rightMouseUp:
            kind = .up
            button = .right
        case .otherMouseDown, .otherMouseUp:
            // Button 2 is the middle button; 3 and up (back, forward...) are not in the format.
            guard event.buttonNumber == 2 else { return }
            kind = event.type == .otherMouseDown ? .down : .up
            button = .middle
        case .scrollWheel:
            kind = .scroll
        default:
            return
        }
        // Quartz coordinates: global, top left of the main display, y down (NSEvent's own
        // locationInWindow is bottom-up).
        let location = cgEvent.location
        var raw = RawMouseEvent(kind: kind, host: hostSeconds(of: cgEvent),
                                x: Double(location.x), y: Double(location.y), button: button)
        if kind == .scroll {
            raw.scrollX = Double(cgEvent.getIntegerValueField(.scrollWheelEventPointDeltaAxis2))
            raw.scrollY = Double(cgEvent.getIntegerValueField(.scrollWheelEventPointDeltaAxis1))
        }
        deliver(raw)
    }

    /// The event's time on the host clock (CMClockGetHostTimeClock, the clock of the frames'
    /// presentation timestamps), in seconds. CGEventTimestamp is documented as nanoseconds since
    /// startup but is reported to be mach absolute time on Apple silicon, where a tick is not a
    /// nanosecond; both readings are tried and the one closest to now wins (on Intel they are the
    /// same). The monitor gets events within milliseconds, so anything far off is a clock
    /// mismatch and the time of arrival is used instead.
    private func hostSeconds(of event: CGEvent) -> Double {
        let now = CMClockGetTime(CMClockGetHostTimeClock()).seconds
        let stamp = event.timestamp
        guard stamp > 0 else { return now }
        let asTicks = CMClockMakeHostTimeFromSystemUnits(stamp).seconds
        let asNanoseconds = Double(stamp) / 1_000_000_000
        let seconds = abs(asTicks - now) <= abs(asNanoseconds - now) ? asTicks : asNanoseconds
        guard seconds.isFinite, now - seconds < 0.25, seconds - now < 0.005 else { return now }
        return min(seconds, now)
    }
}

// MARK: - Track

/// Turns raw events into protocol `mouse` events (PROTOCOL.md): positions in video pixels
/// relative to the recorded display, times in video ms, moves and scrolls thinned to ~60 Hz.
/// Confined to the Recorder's queue.
///
/// Off the recorded display (A-08: or region, or window): moves go out with `outside: true` (the
/// camera ignores them); `down` and `scroll` are not sent (the format only allows `outside` on
/// moves), so such clicks make no zoom; an `up` is sent only when its `down` was, clamped to the
/// edge, so a drag that leaves it still ends.
final class MouseTrack: @unchecked Sendable {
    /// A little under 1/60 s, so a 60 Hz stream of events is not halved by jitter.
    private static let interval = 1.0 / 60 - 0.002

    private let queue: DispatchQueue
    /// Video time (seconds) of a host time, or nil when it is not recorded (before the first
    /// frame, while paused or stopping).
    private let videoTime: (Double) -> Double?
    /// The recorded display, region or window in global coordinates (points).
    private var bounds: CGRect
    /// Where `bounds` lands in the video, in video pixels: the whole video, or (a window resized
    /// while recording, A-08) the part it is scaled into.
    private var dest: CGRect
    private var pendingMove: RawMouseEvent?
    private var pendingScroll: RawMouseEvent?
    private var lastMoveHost = -Double.infinity
    private var lastScrollHost = -Double.infinity
    private var flushScheduled = false
    /// Buttons whose `down` went out.
    private var pressed = Set<MouseButton>()

    init(queue: DispatchQueue, videoWidth: Int, videoHeight: Int, bounds: CGRect,
         videoTime: @escaping (Double) -> Double?)
    {
        self.queue = queue
        self.bounds = bounds
        dest = CGRect(x: 0, y: 0, width: videoWidth, height: videoHeight)
        self.videoTime = videoTime
    }

    /// The display can move in the arrangement or change resolution while recording; a window
    /// moves and changes size (then `dest` says where it is scaled into).
    func updateBounds(_ rect: CGRect, dest newDest: CGRect? = nil) {
        if rect.width > 0, rect.height > 0 { bounds = rect }
        if let newDest, newDest.width > 0, newDest.height > 0 { dest = newDest }
    }

    func add(_ raw: RawMouseEvent) {
        switch raw.kind {
        case .move:
            if raw.host - lastMoveHost >= MouseTrack.interval {
                pendingMove = nil
                emitMove(raw)
            } else {
                // Held back, not dropped: the last position before the pointer rests must go out.
                pendingMove = raw
                scheduleFlush()
            }
        case .scroll:
            var merged = raw
            if let pending = pendingScroll {
                merged.scrollX += pending.scrollX
                merged.scrollY += pending.scrollY
            }
            if raw.host - lastScrollHost >= MouseTrack.interval {
                pendingScroll = nil
                emitScroll(merged)
            } else {
                pendingScroll = merged
                scheduleFlush()
            }
        case .down, .up:
            // The position just before a click goes out before the click.
            flush()
            emitButton(raw)
        }
    }

    /// Sends what the throttle holds back. The Recorder calls it before `paused` and before
    /// `stopped`, so no event is lost to, or lands in, a pause.
    func flush() {
        if let move = pendingMove {
            pendingMove = nil
            emitMove(move)
        }
        if let scroll = pendingScroll {
            pendingScroll = nil
            emitScroll(scroll)
        }
    }

    private func scheduleFlush() {
        guard !flushScheduled else { return }
        flushScheduled = true
        queue.asyncAfter(deadline: .now() + MouseTrack.interval) { [weak self] in
            guard let self else { return }
            self.flushScheduled = false
            self.flush()
        }
    }

    private func emitMove(_ raw: RawMouseEvent) {
        guard let t = videoTime(raw.host) else { return }
        lastMoveHost = raw.host
        let point = toVideo(raw)
        var fields: [String: Any] = ["t": milliseconds(t), "type": "move", "x": point.x, "y": point.y]
        if !isOnDisplay(raw) { fields["outside"] = true }
        Events.mouse(fields)
    }

    private func emitScroll(_ raw: RawMouseEvent) {
        guard isOnDisplay(raw), let t = videoTime(raw.host) else { return }
        lastScrollHost = raw.host
        let point = toVideo(raw)
        let scale = videoScale()
        Events.mouse([
            "t": milliseconds(t), "type": "scroll", "x": point.x, "y": point.y,
            "dx": round1(raw.scrollX * scale.x), "dy": round1(raw.scrollY * scale.y),
        ])
    }

    private func emitButton(_ raw: RawMouseEvent) {
        guard let button = raw.button else { return }
        var point = toVideo(raw)
        if raw.kind == .down {
            guard isOnDisplay(raw) else { return }
            guard let t = videoTime(raw.host) else { return }
            pressed.insert(button)
            Events.mouse(["t": milliseconds(t), "type": "down", "button": button.rawValue, "x": point.x, "y": point.y])
        } else {
            // Released either way; sent only if its `down` was.
            guard pressed.remove(button) != nil, let t = videoTime(raw.host) else { return }
            point.x = min(max(point.x, Double(dest.minX)), Double(dest.maxX))
            point.y = min(max(point.y, Double(dest.minY)), Double(dest.maxY))
            Events.mouse(["t": milliseconds(t), "type": "up", "button": button.rawValue, "x": point.x, "y": point.y])
        }
    }

    private func isOnDisplay(_ raw: RawMouseEvent) -> Bool {
        bounds.contains(CGPoint(x: raw.x, y: raw.y))
    }

    /// Video pixels per point on each axis (the backing scale, or less if the video was scaled
    /// down to fit the encoder).
    private func videoScale() -> (x: Double, y: Double) {
        (Double(dest.width) / Double(bounds.width), Double(dest.height) / Double(bounds.height))
    }

    /// Global points → pixels of the recorded video, origin at its top left.
    private func toVideo(_ raw: RawMouseEvent) -> (x: Double, y: Double) {
        let scale = videoScale()
        return (round1(Double(dest.minX) + (raw.x - Double(bounds.minX)) * scale.x),
                round1(Double(dest.minY) + (raw.y - Double(bounds.minY)) * scale.y))
    }
}

private func round1(_ value: Double) -> Double {
    (value * 10).rounded() / 10
}

private func milliseconds(_ seconds: Double) -> Double {
    round1(max(0, seconds * 1000))
}
