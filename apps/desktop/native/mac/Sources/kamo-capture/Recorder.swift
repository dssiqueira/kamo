// Records one display, a region of it or one window (A-08) with ScreenCaptureKit into the
// VideoWriter and the FrameWriter, and the computer sound (D-024) into the AudioWriter.
//
// Threading: everything mutable lives on `queue`. Commands from stdin, sample buffers from
// ScreenCaptureKit (it delivers on `queue`), the monitor timer and completion handlers all hop
// onto it, so there are no locks here.
//
// Clock: sample buffers carry host time (the mach clock behind CMClockGetHostTimeClock).
//   video time = host time - startHost - pausedTotal
// where startHost is the first frame and pausedTotal the sum of the pauses. Frames captured
// while paused are dropped, so the MP4 is continuous and its duration excludes the pauses
// (F-02); every tMs sent to main is video time. Mouse events (F-03, Mouse.swift) use the same
// formula on their own host timestamps, and none is sent before the first frame, while paused,
// or for a moment that fell in a pause. Audio samples too: the sound file starts at its first
// sample after the first frame (its video time is the offset sent in `stopped`) and leaves the
// pauses out, like the video.
//
// Targets (A-08): a display is recorded whole; a region is the display stream with a
// `sourceRect` (the video is the region's size); a window is a desktop-independent window
// filter, whose frames are scaled into the video, which keeps the size the window had at the
// start. The mouse mapping follows the same rectangle, so events stay in video pixels.
import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import ScreenCaptureKit

/// electron-builder `appId`: Kamo's own windows (the floating bar) never show in the video.
private let kamoBundleIdentifier = "app.kamo.desktop"

/// H.264 encoders top out around 4096 px; larger displays (5K, 6K) are scaled down to fit.
private let maxVideoSide = 4096.0

/// Below this much free space the recording stops by itself with `disk_full` (main asks for
/// 1GB before starting), so the MP4 can still be finalized.
private let minFreeBytes: Int64 = 200 * 1024 * 1024

/// Smaller than this (points) is a widget, not a window to record (A-08 list).
private let minWindowSide = 64.0

/// How often the recorded window's position is read again for the mouse mapping (seconds).
private let windowGeometryInterval = 0.05

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private enum State {
        case idle, starting, recording, finishing
    }

    /// What is recorded (A-08).
    private enum Target {
        case display
        /// Part of the display, in points relative to its top left.
        case region(CGRect)
        case window(CGWindowID)
    }

    private let queue = DispatchQueue(label: "app.kamo.capture.recorder", qos: .userInteractive)
    private var state = State.idle
    private var options: StartCommand?
    private var target = Target.display
    private var displayID: CGDirectDisplayID = 0
    private var stream: SCStream?
    private var writer: VideoWriter?
    private var frames: FrameWriter?
    /// Computer sound (D-024); nil when not asked for or when it could not be set up.
    private var audio: AudioWriter?
    private var monitor: DispatchSourceTimer?
    private var monitorTicks = 0

    private var videoWidth = 0
    private var videoHeight = 0
    private var scaleFactor = 1.0

    // Clock, in seconds (see the header).
    private var startHost: Double?
    private var pausedTotal = 0.0
    private var pauseHost: Double?
    private var pausedVideoTime = 0.0
    /// Video time of the last frame given to the encoder; -1 before the first one.
    private var lastAppended = -1.0
    /// The frame on screen right now (ScreenCaptureKit only sends frames when something changes).
    private var lastPixelBuffer: CVPixelBuffer?
    /// Video time (ms) of the next reference frame.
    private var nextFrameMs = 0.0

    // Mouse (F-03). The tap runs on its own thread; the track lives on `queue`.
    private var mouseTap: MouseTap?
    private var mouseTrack: MouseTrack?
    /// Where the recorded content is, in global points (the mouse mapping).
    private var mouseBounds = CGRect.zero
    /// Host time the window's position was last read (Target.window).
    private var windowCheckedHost = -Double.infinity
    /// Host time of the last resume: an event from before it was captured during a pause.
    private var resumeHost = -Double.infinity
    /// Why the mouse tap failed before `started` went out; reported right after it.
    private var mouseProblem: String?

    // MARK: - Commands

    /// Called from the stdin thread.
    func handle(_ command: Command) {
        queue.async { self.apply(command) }
    }

    private func apply(_ command: Command) {
        switch command {
        case let .start(options):
            // Only the first `start` counts.
            if state == .idle { begin(options) }
        case let .listWindows(excludePid):
            listWindows(excluding: excludePid)
        case .pause:
            pause()
        case .resume:
            resume()
        case .stop:
            stop()
        }
    }

    private func begin(_ options: StartCommand) {
        state = .starting
        self.options = options
        // Electron's Display.id on macOS is the CGDirectDisplayID.
        guard let id = CGDirectDisplayID(options.displayId) else {
            Events.fatal(.displayNotFound, "displayId is not a CGDirectDisplayID")
        }
        displayID = id
        // Never prompts; onboarding (step 10) asks for the permission.
        guard CGPreflightScreenCaptureAccess() else {
            Events.fatal(.permissionDenied, "screen recording permission is not granted")
        }
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
            self.queue.async { self.configure(content: content, error: error) }
        }
    }

    private func configure(content: SCShareableContent?, error: Error?) {
        guard state == .starting, let options else { return }
        // Fails when Screen Recording is not allowed for the responsible app.
        guard let content else {
            Events.fatal(.permissionDenied, "SCShareableContent failed: \(describe(error))")
        }

        let filter: SCContentFilter
        /// Size of what is recorded, in points.
        let pointSize: CGSize
        var sourceRect: CGRect?
        if let windowId = options.windowId {
            guard let id = CGWindowID(windowId),
                  let window = content.windows.first(where: { $0.windowID == id })
            else {
                Events.fatal(.windowNotFound, "no shareable window with that id")
            }
            target = .window(id)
            filter = SCContentFilter(desktopIndependentWindow: window)
            let frame = windowBounds(id) ?? window.frame
            pointSize = frame.size
            mouseBounds = frame
            // The display the window is mostly on gives the backing scale.
            let center = CGPoint(x: frame.midX, y: frame.midY)
            if let display = content.displays.first(where: { $0.frame.contains(center) }) {
                displayID = display.displayID
            }
        } else {
            guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
                Events.fatal(.displayNotFound, "no shareable display with that id")
            }
            // Exclude every window of the parent app (Electron main owns all of Kamo's windows,
            // the floating bar included). The bundle id covers a packaged Kamo started some
            // other way.
            let parent = getppid()
            let kamo = content.applications.filter {
                $0.processID == parent || $0.bundleIdentifier == kamoBundleIdentifier
            }
            if kamo.isEmpty { Log.diag("parent app not found in shareable content; nothing excluded") }
            filter = SCContentFilter(display: display, excludingApplications: kamo, exceptingWindows: [])
            let displayBounds = CGDisplayBounds(displayID)
            if let region = options.region {
                let whole = CGRect(x: 0, y: 0, width: Double(display.width), height: Double(display.height))
                let rect = CGRect(x: region.x, y: region.y, width: region.width, height: region.height)
                    .intersection(whole)
                guard !rect.isNull, rect.width >= 2, rect.height >= 2 else {
                    Events.fatal(.displayNotFound, "the region is not on the display")
                }
                target = .region(rect)
                sourceRect = rect
                pointSize = rect.size
                mouseBounds = rect.offsetBy(dx: displayBounds.minX, dy: displayBounds.minY)
            } else {
                target = .display
                pointSize = CGSize(width: Double(display.width), height: Double(display.height))
                mouseBounds = displayBounds
            }
        }

        // Video size = physical pixels of what is recorded (points x backing scale), even.
        var backingScale = 1.0
        if let mode = CGDisplayCopyDisplayMode(displayID), mode.width > 0 {
            backingScale = Double(mode.pixelWidth) / Double(mode.width)
        }
        var pixelWidth = Double(pointSize.width) * backingScale
        var pixelHeight = Double(pointSize.height) * backingScale
        let fit = maxVideoSide / max(pixelWidth, pixelHeight, 1)
        if fit < 1 {
            pixelWidth *= fit
            pixelHeight *= fit
        }
        videoWidth = max(2, Int(pixelWidth.rounded()) & ~1)
        videoHeight = max(2, Int(pixelHeight.rounded()) & ~1)
        // Video pixels per point: the backing scale, unless the video was scaled down.
        scaleFactor = Double(videoWidth) / max(1, Double(pointSize.width))

        let config = SCStreamConfiguration()
        config.width = videoWidth
        config.height = videoHeight
        if let sourceRect { config.sourceRect = sourceRect }
        if case .window = target {
            // A window resized while recording is scaled into the video, aspect kept.
            if #available(macOS 14.0, *) {
                config.scalesToFit = true
                config.preservesAspectRatio = true
            }
        }
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
        // 4:2:0 video range goes to the H.264 encoder without a conversion.
        config.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        config.colorSpaceName = CGColorSpace.sRGB
        config.showsCursor = false // D-005: Kamo draws its own cursor from the mouse events
        config.queueDepth = 8 // one buffer is held as lastPixelBuffer

        // D-024: computer sound, never Kamo's own (the helper plays nothing; Kamo's app is
        // excluded by the display filter).
        if let path = options.systemAudio {
            do {
                audio = try AudioWriter(url: URL(fileURLWithPath: path))
            } catch {
                // Not fatal: the video goes on, main hears no `systemAudio` and warns.
                Log.diag("computer sound unavailable: \(describe(error))")
            }
        }
        config.capturesAudio = audio != nil
        if audio != nil {
            config.excludesCurrentProcessAudio = true
            config.sampleRate = 48_000
            config.channelCount = 2
        }

        do {
            writer = try VideoWriter(
                url: URL(fileURLWithPath: options.output),
                width: videoWidth,
                height: videoHeight,
                fps: options.fps
            )
        } catch {
            audio?.cancel()
            Events.fatal(.encoderFailed, "cannot start the MP4 writer: \(describe(error))")
        }
        frames = FrameWriter(directory: URL(fileURLWithPath: options.framesDir, isDirectory: true),
                             width: options.frameWidth)

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        do {
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        } catch {
            audio?.cancel()
            Events.fatal(.internalError, "cannot add the stream output: \(describe(error))")
        }
        if audio != nil {
            do {
                try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
            } catch {
                Log.diag("cannot add the audio output: \(describe(error))")
                audio?.cancel()
                audio = nil
            }
        }
        self.stream = stream
        // Before the capture, so the first frames already have their mouse events.
        if options.mouse ?? true { startMouse() }
        // `started` goes out with the first encoded frame (stream(_:didOutputSampleBuffer:of:)).
        stream.startCapture { error in
            guard let error else { return }
            self.queue.async { self.startFailed(error) }
        }
    }

    private func startFailed(_ error: Error) {
        guard state == .starting else { return }
        writer?.cancel()
        audio?.cancel()
        Events.fatal(isPermissionError(error) ? .permissionDenied : .internalError,
                     "cannot start the capture stream: \(describe(error))")
    }

    private func pause() {
        guard state == .recording, pauseHost == nil else { return }
        // Mouse events held back by the throttle belong before `paused`.
        mouseTrack?.flush()
        let now = hostNow()
        pauseHost = now
        pausedVideoTime = max(0, videoTime(atHost: now))
        Events.paused(seconds: pausedVideoTime)
    }

    private func resume() {
        guard state == .recording, let pauseHost else { return }
        let now = hostNow()
        pausedTotal += now - pauseHost
        resumeHost = now
        self.pauseHost = nil
        // Paused time is not video time: the video resumes where it paused.
        Events.resumed(seconds: pausedVideoTime)
    }

    private func stop() {
        switch state {
        case .idle:
            exit(0)
        case .starting:
            // Main gave up before the first frame: nothing worth keeping.
            stream?.stopCapture(completionHandler: nil)
            writer?.cancel()
            audio?.cancel()
            exit(0)
        case .recording:
            finish(warning: nil)
        case .finishing:
            break
        }
    }

    // MARK: - Windows (A-08)

    /// Answers `listWindows`: the windows a user would pick, front to back, never Kamo's own.
    private func listWindows(excluding excludePid: Int32?) {
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, error in
            guard let content else {
                // No permission yet: an empty list (Home shows the permission warning).
                Log.diag("cannot list windows: \(describe(error))")
                Events.windows([])
                return
            }
            var skip: Set<pid_t> = [getpid(), getppid()]
            if let excludePid { skip.insert(excludePid) }
            let list = content.windows.compactMap { (window: SCWindow) -> [String: Any]? in
                guard let app = window.owningApplication, let title = window.title,
                      window.windowLayer == 0, window.isOnScreen,
                      !title.trimmingCharacters(in: .whitespaces).isEmpty,
                      Double(window.frame.width) >= minWindowSide,
                      Double(window.frame.height) >= minWindowSide,
                      !skip.contains(app.processID), app.bundleIdentifier != kamoBundleIdentifier
                else { return nil }
                return [
                    "id": String(window.windowID),
                    "title": title,
                    "app": app.applicationName,
                    "x": Double(window.frame.minX),
                    "y": Double(window.frame.minY),
                    "width": Double(window.frame.width),
                    "height": Double(window.frame.height),
                ]
            }
            Events.windows(list)
        }
    }

    /// The window's frame in global points (top left origin, like mouse locations), or nil
    /// when it is gone.
    private func windowBounds(_ id: CGWindowID) -> CGRect? {
        guard let list = CGWindowListCopyWindowInfo(.optionIncludingWindow, id) as? [[String: Any]],
              let info = list.first,
              let dictionary = info[kCGWindowBounds as String] as? NSDictionary,
              let rect = CGRect(dictionaryRepresentation: dictionary as CFDictionary),
              rect.width > 0, rect.height > 0
        else { return nil }
        return rect
    }

    /// Where a window of `size` lands in the video: scaled to fit, aspect kept, centered.
    private func fitInVideo(_ size: CGSize) -> CGRect {
        let width = max(1, Double(size.width))
        let height = max(1, Double(size.height))
        let scale = min(Double(videoWidth) / width, Double(videoHeight) / height)
        let w = (width * scale).rounded()
        let h = (height * scale).rounded()
        return CGRect(x: ((Double(videoWidth) - w) / 2).rounded(), y: ((Double(videoHeight) - h) / 2).rounded(),
                      width: w, height: h)
    }

    /// Window recording: reads where the window is now, for the mouse mapping. `force` skips
    /// the 50ms throttle (a click, the 1s check). Returns false when the window is gone.
    @discardableResult
    private func followWindow(force: Bool) -> Bool {
        guard case let .window(id) = target else { return true }
        let now = hostNow()
        if !force, now - windowCheckedHost < windowGeometryInterval { return true }
        windowCheckedHost = now
        guard let frame = windowBounds(id) else { return false }
        mouseBounds = frame
        mouseTrack?.updateBounds(frame, dest: fitInVideo(frame.size))
        return true
    }

    // MARK: - Frames

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                of type: SCStreamOutputType)
    {
        if type == .audio {
            appendAudio(sampleBuffer)
            return
        }
        guard type == .screen, state == .starting || state == .recording, sampleBuffer.isValid,
              let writer
        else { return }
        // Only `.complete` frames carry an image; `.idle` means nothing changed on screen.
        let rawAttachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false)
        guard let attachments = rawAttachments as? [[SCStreamFrameInfo: Any]],
              let rawStatus = attachments.first?[.status] as? Int,
              SCFrameStatus(rawValue: rawStatus) == .complete,
              let pixelBuffer = sampleBuffer.imageBuffer
        else { return }

        let host = sampleBuffer.presentationTimeStamp.seconds
        if startHost == nil { startHost = host }
        // Captured after the pause began: not part of the video.
        if let pauseHost, host >= pauseHost { return }
        let t = videoTime(atHost: host)
        // Captured during a pause but delivered after the resume, or out of order.
        guard t > lastAppended else { return }

        // The previous frame was on screen until now: it is the reference frame for any slot before t.
        emitReferenceFrames(through: t * 1000, inclusive: false, using: lastPixelBuffer)

        switch writer.append(pixelBuffer, at: t) {
        case .appended:
            break
        case .dropped:
            return
        case .failed:
            writerFailed()
            return
        }
        lastAppended = t
        lastPixelBuffer = pixelBuffer
        emitReferenceFrames(through: t * 1000, inclusive: true, using: pixelBuffer)

        if state == .starting, let options {
            state = .recording
            startMonitor()
            Events.started(width: videoWidth, height: videoHeight, scaleFactor: scaleFactor, fps: options.fps)
            if let mouseProblem {
                Events.error(.mouseUnavailable, mouseProblem, fatal: false)
                self.mouseProblem = nil
            }
        }
    }

    /// Computer sound (D-024): only what plays while the video records, on the video clock.
    private func appendAudio(_ buffer: CMSampleBuffer) {
        guard state == .recording, let audio, buffer.isValid, let startHost, pauseHost == nil else { return }
        let host = buffer.presentationTimeStamp.seconds
        guard host.isFinite, host >= startHost, host >= resumeHost else { return }
        audio.append(buffer, videoTime: videoTime(atHost: host))
    }

    /// Queues the reference frames due up to `limitMs` of video time, all from `buffer`.
    private func emitReferenceFrames(through limitMs: Double, inclusive: Bool, using buffer: CVPixelBuffer?) {
        guard let buffer, let frames, let options else { return }
        while inclusive ? nextFrameMs <= limitMs : nextFrameMs < limitMs {
            frames.write(buffer, tMs: nextFrameMs)
            nextFrameMs += Double(options.frameIntervalMs)
        }
    }

    // MARK: - Monitor

    /// Once a second: display or window still there? disk not full? reference frames while the
    /// screen is static.
    private func startMonitor() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in self?.tick() }
        timer.resume()
        monitor = timer
    }

    private func tick() {
        guard state == .recording else { return }
        switch target {
        case .window:
            guard followWindow(force: true) else {
                finish(warning: (.windowLost, "the window was closed"))
                return
            }
        case .display, .region:
            if CGDisplayIsOnline(displayID) == 0 {
                finish(warning: (.displayLost, "the display went offline"))
                return
            }
            // The display can move in the arrangement while recording.
            let bounds = CGDisplayBounds(displayID)
            if case let .region(rect) = target {
                mouseBounds = rect.offsetBy(dx: bounds.minX, dy: bounds.minY)
            } else {
                mouseBounds = bounds
            }
            mouseTrack?.updateBounds(mouseBounds)
        }
        monitorTicks += 1
        if monitorTicks % 5 == 0, let free = freeBytes(), free < minFreeBytes {
            finish(warning: (.diskFull, "less than 200MB free on the output volume"))
            return
        }
        // A static screen sends no frames; the last one is still what is on screen. The small
        // margin leaves room for a frame that is already queued.
        if pauseHost == nil {
            emitReferenceFrames(through: (videoNow() - 0.1) * 1000, inclusive: true, using: lastPixelBuffer)
        }
    }

    private func freeBytes() -> Int64? {
        guard let options else { return nil }
        let folder = URL(fileURLWithPath: options.output).deletingLastPathComponent()
        guard let values = try? folder.resourceValues(forKeys: [.volumeAvailableCapacityKey]),
              let capacity = values.volumeAvailableCapacity
        else { return nil }
        return Int64(capacity)
    }

    // MARK: - Stopping

    /// ScreenCaptureKit stopped the stream by itself (display gone, window closed, stopped from
    /// the system UI, ...).
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        queue.async {
            switch self.state {
            case .starting:
                self.startFailed(error)
            case .recording:
                if case let .window(id) = self.target {
                    if self.windowBounds(id) == nil {
                        self.finish(warning: (.windowLost, "the capture stream stopped: window closed"))
                        return
                    }
                } else if CGDisplayIsOnline(self.displayID) == 0 {
                    self.finish(warning: (.displayLost, "the capture stream stopped: display offline"))
                    return
                }
                // Not one of the protocol's stop reasons: warn, then keep what was recorded.
                self.finish(warning: (.internalError, "the capture stream stopped: \(describe(error))"))
            case .idle, .finishing:
                break
            }
        }
    }

    /// Normal end: finalize the MP4 (and the sound file), send `stopped`, exit 0. With a warning
    /// (display_lost, window_lost, disk_full), the error goes out first as non-fatal, as
    /// PROTOCOL.md asks.
    private func finish(warning: (code: ErrorCode, message: String)?) {
        guard state == .recording, let writer, let options else { return }
        // Mouse events held back by the throttle belong before `stopped`.
        mouseTrack?.flush()
        state = .finishing
        mouseTap?.stop()
        monitor?.cancel()
        monitor = nil
        stream?.stopCapture(completionHandler: nil)

        let end = max(videoNow(), lastAppended)
        // The screen may have been static since the last frame: repeat it at the end so the
        // video lasts as long as the recording did.
        if let last = lastPixelBuffer, end - lastAppended > 0.5 / Double(options.fps) {
            if writer.append(last, at: end) == .appended { lastAppended = end }
        }
        emitReferenceFrames(through: end * 1000, inclusive: true, using: lastPixelBuffer)
        lastPixelBuffer = nil
        if let warning { Events.error(warning.code, warning.message, fatal: false) }

        writer.finish(at: end) { completed in
            self.queue.async {
                self.finishAudio { audioOffset in
                    let count = self.frames?.drain() ?? 0
                    if completed {
                        Events.stopped(seconds: end, frames: count, systemAudioOffset: audioOffset)
                        exit(0)
                    }
                    self.failAfterWriterError(count: count, duration: end)
                }
            }
        }
    }

    /// Closes the sound file; calls back on `queue` with its offset on the video timeline, or
    /// nil when there is no usable sound (main then warns, F-04).
    private func finishAudio(then: @escaping @Sendable (Double?) -> Void) {
        guard let audio else {
            then(nil)
            return
        }
        audio.finish { completed in
            self.queue.async { then(completed ? audio.offset : nil) }
        }
    }

    /// The encoder refused a frame while recording.
    private func writerFailed() {
        if state == .starting {
            Events.fatal(.encoderFailed, "the first frame was refused: \(describe(writer?.error))")
        }
        state = .finishing
        mouseTap?.stop()
        monitor?.cancel()
        monitor = nil
        stream?.stopCapture(completionHandler: nil)
        lastPixelBuffer = nil
        audio?.cancel()
        failAfterWriterError(count: frames?.drain() ?? 0, duration: max(0, lastAppended))
    }

    /// Disk full: the fragments already written still play, so it is a normal stop with a
    /// warning. Anything else: fatal, main keeps the folder for recovery.
    private func failAfterWriterError(count: Int, duration: Double) -> Never {
        let error = writer?.error
        if isDiskFull(error) {
            Events.error(.diskFull, "the disk is full", fatal: false)
            Events.stopped(seconds: duration, frames: count)
            exit(0)
        }
        Events.fatal(.encoderFailed, "the MP4 writer failed: \(describe(error))")
    }

    // MARK: - Mouse

    /// Starts the mouse tap (Mouse.swift). A tap that cannot be created is not fatal: the video
    /// goes on and main hears `mouse_unavailable`.
    private func startMouse() {
        let track = MouseTrack(queue: queue, videoWidth: videoWidth, videoHeight: videoHeight,
                               bounds: mouseBounds,
                               videoTime: { [unowned self] host in self.mouseVideoTime(atHost: host) })
        if case .window = target { track.updateBounds(mouseBounds, dest: fitInVideo(mouseBounds.size)) }
        mouseTrack = track
        // Diagnostics for F-13: does a mouse-only listen tap need Input Monitoring?
        Log.diag("listen event access preflight: \(CGPreflightListenEventAccess())")
        let tap = MouseTap { raw in
            self.queue.async {
                // A window can move at any time: read where it is before a click.
                self.followWindow(force: raw.kind == .down || raw.kind == .up)
                self.mouseTrack?.add(raw)
            }
        }
        mouseTap = tap
        tap.start { problem in
            guard let problem else { return }
            self.queue.async { self.mouseUnavailable(problem) }
        }
    }

    private func mouseUnavailable(_ problem: String) {
        mouseTap = nil
        mouseTrack = nil
        switch state {
        case .starting:
            mouseProblem = problem
        case .recording:
            Events.error(.mouseUnavailable, problem, fatal: false)
        case .idle, .finishing:
            break
        }
    }

    /// Video time of a mouse event, or nil when that moment is not in the video.
    private func mouseVideoTime(atHost host: Double) -> Double? {
        guard state == .recording, pauseHost == nil, let startHost,
              host >= startHost, host >= resumeHost
        else { return nil }
        return max(0, host - startHost - pausedTotal)
    }

    // MARK: - Clock

    private func hostNow() -> Double {
        CMClockGetTime(CMClockGetHostTimeClock()).seconds
    }

    private func videoTime(atHost host: Double) -> Double {
        guard let startHost else { return 0 }
        return host - startHost - pausedTotal
    }

    private func videoNow() -> Double {
        if pauseHost != nil { return pausedVideoTime }
        return max(0, videoTime(atHost: hostNow()))
    }
}

private func isPermissionError(_ error: Error) -> Bool {
    let ns = error as NSError
    return ns.domain == SCStreamErrorDomain && ns.code == SCStreamError.Code.userDeclined.rawValue
}
