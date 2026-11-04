// Records one display with ScreenCaptureKit into the VideoWriter and the FrameWriter.
//
// Threading: everything mutable lives on `queue`. Commands from stdin, sample buffers from
// ScreenCaptureKit (it delivers on `queue`), the monitor timer and completion handlers all hop
// onto it, so there are no locks here.
//
// Clock: sample buffers carry host time (the mach clock behind CMClockGetHostTimeClock).
//   video time = host time - startHost - pausedTotal
// where startHost is the first frame and pausedTotal the sum of the pauses. Frames captured
// while paused are dropped, so the MP4 is continuous and its duration excludes the pauses
// (F-02); every tMs sent to main is video time.
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

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private enum State {
        case idle, starting, recording, finishing
    }

    private let queue = DispatchQueue(label: "app.kamo.capture.recorder", qos: .userInteractive)
    private var state = State.idle
    private var options: StartCommand?
    private var displayID: CGDirectDisplayID = 0
    private var stream: SCStream?
    private var writer: VideoWriter?
    private var frames: FrameWriter?
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
        guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
            Events.fatal(.displayNotFound, "no shareable display with that id")
        }

        // Exclude every window of the parent app (Electron main owns all of Kamo's windows, the
        // floating bar included). The bundle id covers a packaged Kamo started some other way.
        let parent = getppid()
        let kamo = content.applications.filter {
            $0.processID == parent || $0.bundleIdentifier == kamoBundleIdentifier
        }
        if kamo.isEmpty { Log.diag("parent app not found in shareable content; nothing excluded") }
        let filter = SCContentFilter(display: display, excludingApplications: kamo, exceptingWindows: [])

        // Video size = physical pixels of the display (points x backing scale), even for H.264.
        let pointWidth = Double(display.width)
        let pointHeight = Double(display.height)
        var backingScale = 1.0
        if let mode = CGDisplayCopyDisplayMode(displayID), mode.width > 0 {
            backingScale = Double(mode.pixelWidth) / Double(mode.width)
        }
        var pixelWidth = pointWidth * backingScale
        var pixelHeight = pointHeight * backingScale
        let fit = maxVideoSide / max(pixelWidth, pixelHeight)
        if fit < 1 {
            pixelWidth *= fit
            pixelHeight *= fit
        }
        videoWidth = max(2, Int(pixelWidth.rounded()) & ~1)
        videoHeight = max(2, Int(pixelHeight.rounded()) & ~1)
        // Video pixels per display point: the backing scale, unless the video was scaled down.
        scaleFactor = Double(videoWidth) / pointWidth

        let config = SCStreamConfiguration()
        config.width = videoWidth
        config.height = videoHeight
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
        // 4:2:0 video range goes to the H.264 encoder without a conversion.
        config.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        config.colorSpaceName = CGColorSpace.sRGB
        config.showsCursor = false // D-005: Kamo draws its own cursor from the mouse events
        config.capturesAudio = false // audio arrives in step 3
        config.queueDepth = 8 // one buffer is held as lastPixelBuffer

        do {
            writer = try VideoWriter(
                url: URL(fileURLWithPath: options.output),
                width: videoWidth,
                height: videoHeight,
                fps: options.fps
            )
        } catch {
            Events.fatal(.encoderFailed, "cannot start the MP4 writer: \(describe(error))")
        }
        frames = FrameWriter(directory: URL(fileURLWithPath: options.framesDir, isDirectory: true),
                             width: options.frameWidth)

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        do {
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        } catch {
            Events.fatal(.internalError, "cannot add the stream output: \(describe(error))")
        }
        self.stream = stream
        // `started` goes out with the first encoded frame (stream(_:didOutputSampleBuffer:of:)).
        stream.startCapture { error in
            guard let error else { return }
            self.queue.async { self.startFailed(error) }
        }
    }

    private func startFailed(_ error: Error) {
        guard state == .starting else { return }
        writer?.cancel()
        Events.fatal(isPermissionError(error) ? .permissionDenied : .internalError,
                     "cannot start the capture stream: \(describe(error))")
    }

    private func pause() {
        guard state == .recording, pauseHost == nil else { return }
        let now = hostNow()
        pauseHost = now
        pausedVideoTime = max(0, videoTime(atHost: now))
        Events.paused(seconds: pausedVideoTime)
    }

    private func resume() {
        guard state == .recording, let pauseHost else { return }
        pausedTotal += hostNow() - pauseHost
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
            exit(0)
        case .recording:
            finish(warning: nil)
        case .finishing:
            break
        }
    }

    // MARK: - Frames

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                of type: SCStreamOutputType)
    {
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
        }
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

    /// Once a second: display still there? disk not full? reference frames while the screen is static.
    private func startMonitor() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in self?.tick() }
        timer.resume()
        monitor = timer
    }

    private func tick() {
        guard state == .recording else { return }
        if CGDisplayIsOnline(displayID) == 0 {
            finish(warning: (.displayLost, "the display went offline"))
            return
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

    /// ScreenCaptureKit stopped the stream by itself (display gone, stopped from the system UI, ...).
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        queue.async {
            switch self.state {
            case .starting:
                self.startFailed(error)
            case .recording:
                if CGDisplayIsOnline(self.displayID) == 0 {
                    self.finish(warning: (.displayLost, "the capture stream stopped: display offline"))
                } else {
                    // Not one of the protocol's stop reasons: warn, then keep what was recorded.
                    self.finish(warning: (.internalError, "the capture stream stopped: \(describe(error))"))
                }
            case .idle, .finishing:
                break
            }
        }
    }

    /// Normal end: finalize the MP4, send `stopped`, exit 0. With a warning (display_lost,
    /// disk_full), the error goes out first as non-fatal, as PROTOCOL.md asks.
    private func finish(warning: (code: ErrorCode, message: String)?) {
        guard state == .recording, let writer, let options else { return }
        state = .finishing
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
                let count = self.frames?.drain() ?? 0
                if completed {
                    Events.stopped(seconds: end, frames: count)
                    exit(0)
                }
                self.failAfterWriterError(count: count, duration: end)
            }
        }
    }

    /// The encoder refused a frame while recording.
    private func writerFailed() {
        if state == .starting {
            Events.fatal(.encoderFailed, "the first frame was refused: \(describe(writer?.error))")
        }
        state = .finishing
        monitor?.cancel()
        monitor = nil
        stream?.stopCapture(completionHandler: nil)
        lastPixelBuffer = nil
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
