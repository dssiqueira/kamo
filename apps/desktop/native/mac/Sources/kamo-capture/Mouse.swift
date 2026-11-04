// Mouse events for F-03 (D-003, D-023): a listen-only Quartz event tap whose mask is built from
// mouse event types and nothing else (AGENTS.md rule 2: Kamo never captures the keyboard, so no
// keyboard event type appears in this file, not even in the mask).
//
// Tap location: `.cgSessionEventTap`. It sees every mouse event of the user's login session,
// which is all a recording needs, and it is the level an unprivileged process may observe. A
// HID tap (`.cghidEventTap`) sits below the window server, historically needs root or extra
// privacy permissions, and would add nothing: locations are the same global coordinates.
//
// Threads: the tap runs on its own thread with its own run loop (MouseTap) and only reads the
// event; everything else happens on the Recorder's queue (MouseTrack).
import CoreGraphics
import CoreMedia
import Foundation

enum MouseButton: String, Sendable {
    case left, right, middle
}

/// One mouse event as the tap saw it: global display coordinates (points, origin at the top
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

// MARK: - Tap

/// Owns the event tap and its thread. `deliver` is called on the tap thread.
final class MouseTap: @unchecked Sendable {
    /// Mouse event types only (rule 2). Drags are moves with a button held.
    private static let eventTypes: [CGEventType] = [
        .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged,
        .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
        .otherMouseDown, .otherMouseUp, .scrollWheel,
    ]

    static var eventMask: CGEventMask {
        eventTypes.reduce(CGEventMask(0)) { mask, type in mask | (CGEventMask(1) << CGEventMask(type.rawValue)) }
    }

    private let deliver: @Sendable (RawMouseEvent) -> Void
    private let lock = NSLock()
    // Guarded by `lock`: written on the tap thread, read by stop() and the callback.
    private var port: CFMachPort?
    private var runLoop: CFRunLoop?
    private var stopped = false

    init(deliver: @escaping @Sendable (RawMouseEvent) -> Void) {
        self.deliver = deliver
    }

    /// Starts the tap thread. `ready(nil)` once events flow, `ready(reason)` if the tap cannot be
    /// created (no permission). Called on the tap thread.
    func start(ready: @escaping @Sendable (_ problem: String?) -> Void) {
        let thread = Thread { self.run(ready: ready) }
        thread.name = "mouse-tap"
        thread.qualityOfService = .userInteractive
        thread.start()
    }

    func stop() {
        lock.lock()
        stopped = true
        let port = self.port
        let loop = runLoop
        self.port = nil
        runLoop = nil
        lock.unlock()
        if let port {
            CGEvent.tapEnable(tap: port, enable: false)
            // Also invalidates the run loop source, so CFRunLoopRun returns even if it had not
            // started yet when CFRunLoopStop was called.
            CFMachPortInvalidate(port)
        }
        if let loop { CFRunLoopStop(loop) }
    }

    private func run(ready: @Sendable (_ problem: String?) -> Void) {
        // The tap does not retain its context; the Recorder keeps this object alive.
        let context = Unmanaged.passUnretained(self).toOpaque()
        guard let port = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: MouseTap.eventMask,
            callback: mouseTapCallback,
            userInfo: context
        ) else {
            ready("cannot create the mouse event tap (listen access preflight: \(CGPreflightListenEventAccess()))")
            return
        }
        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, port, 0) else {
            CFMachPortInvalidate(port)
            ready("cannot create a run loop source for the mouse event tap")
            return
        }
        let loop = CFRunLoopGetCurrent()
        lock.lock()
        let stoppedEarly = stopped
        if !stoppedEarly {
            self.port = port
            runLoop = loop
        }
        lock.unlock()
        if stoppedEarly {
            CFMachPortInvalidate(port)
            return
        }
        CFRunLoopAddSource(loop, source, .commonModes)
        CGEvent.tapEnable(tap: port, enable: true)
        ready(nil)
        CFRunLoopRun()
    }

    /// On the tap thread, for every event of the mask (and the tap's own notifications).
    fileprivate func handle(_ type: CGEventType, _ event: CGEvent) {
        let kind: RawMouseEvent.Kind
        var button: MouseButton?
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            // The system can switch a tap off; turn it back on unless we are stopping.
            lock.lock()
            let current = stopped ? nil : port
            lock.unlock()
            if let current { CGEvent.tapEnable(tap: current, enable: true) }
            return
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
            guard event.getIntegerValueField(.mouseEventButtonNumber) == 2 else { return }
            kind = type == .otherMouseDown ? .down : .up
            button = .middle
        case .scrollWheel:
            kind = .scroll
        default:
            return
        }
        let location = event.location
        var raw = RawMouseEvent(kind: kind, host: hostSeconds(of: event),
                                x: Double(location.x), y: Double(location.y), button: button)
        if kind == .scroll {
            raw.scrollX = Double(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis2))
            raw.scrollY = Double(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1))
        }
        deliver(raw)
    }

    /// The event's time on the host clock (CMClockGetHostTimeClock, the clock of the frames'
    /// presentation timestamps), in seconds. CGEventTimestamp is documented as nanoseconds since
    /// startup but is reported to be mach absolute time on Apple silicon, where a tick is not a
    /// nanosecond; both readings are tried and the one closest to now wins (on Intel they are the
    /// same). A listen-only tap gets events within milliseconds, so anything far off is a clock
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

/// C callback of the tap: no captures, the MouseTap comes through `userInfo`.
private func mouseTapCallback(
    proxy _: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    userInfo: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    if let userInfo {
        Unmanaged<MouseTap>.fromOpaque(userInfo).takeUnretainedValue().handle(type, event)
    }
    // Listen-only: the event goes on untouched whatever is returned.
    return Unmanaged.passUnretained(event)
}

// MARK: - Track

/// Turns raw events into protocol `mouse` events (PROTOCOL.md): positions in video pixels
/// relative to the recorded display, times in video ms, moves and scrolls thinned to ~60 Hz.
/// Confined to the Recorder's queue.
///
/// Off the recorded display: moves go out with `outside: true` (the camera ignores them);
/// `down` and `scroll` are not sent (the format only allows `outside` on moves); an `up` is sent
/// only when its `down` was, clamped to the display edge, so a drag that leaves the display
/// still ends.
final class MouseTrack: @unchecked Sendable {
    /// A little under 1/60 s, so a 60 Hz stream of events is not halved by jitter.
    private static let interval = 1.0 / 60 - 0.002

    private let queue: DispatchQueue
    /// Video time (seconds) of a host time, or nil when it is not recorded (before the first
    /// frame, while paused or stopping).
    private let videoTime: (Double) -> Double?
    private let videoWidth: Double
    private let videoHeight: Double
    /// The recorded display in global coordinates (points).
    private var bounds: CGRect
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
        self.videoWidth = Double(videoWidth)
        self.videoHeight = Double(videoHeight)
        self.bounds = bounds
        self.videoTime = videoTime
    }

    /// The display can move in the arrangement or change resolution while recording.
    func updateBounds(_ rect: CGRect) {
        if rect.width > 0, rect.height > 0 { bounds = rect }
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
            point.x = min(max(point.x, 0), videoWidth)
            point.y = min(max(point.y, 0), videoHeight)
            Events.mouse(["t": milliseconds(t), "type": "up", "button": button.rawValue, "x": point.x, "y": point.y])
        }
    }

    private func isOnDisplay(_ raw: RawMouseEvent) -> Bool {
        bounds.contains(CGPoint(x: raw.x, y: raw.y))
    }

    /// Video pixels per point on each axis (the backing scale, or less if the video was scaled
    /// down to fit the encoder).
    private func videoScale() -> (x: Double, y: Double) {
        (videoWidth / Double(bounds.width), videoHeight / Double(bounds.height))
    }

    /// Global points → pixels of the recorded video, origin at its top left.
    private func toVideo(_ raw: RawMouseEvent) -> (x: Double, y: Double) {
        let scale = videoScale()
        return (round1((raw.x - Double(bounds.minX)) * scale.x), round1((raw.y - Double(bounds.minY)) * scale.y))
    }
}

private func round1(_ value: Double) -> Double {
    (value * 10).rounded() / 10
}

private func milliseconds(_ seconds: Double) -> Double {
    round1(max(0, seconds * 1000))
}
