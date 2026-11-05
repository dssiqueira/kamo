// Wire protocol with the Electron main process (PROTOCOL.md, protocol.ts is the source of truth).
// JSON Lines: commands on stdin, events on stdout. stderr is for technical diagnostics only and
// never carries user data (no paths, no window titles, no screen content).
import Foundation

let helperVersion = "0.1.0"

enum ErrorCode: String {
    case displayNotFound = "display_not_found"
    case permissionDenied = "permission_denied"
    case encoderFailed = "encoder_failed"
    case diskFull = "disk_full"
    case displayLost = "display_lost"
    /// A-08: the window to record is gone (fatal, before `started`).
    case windowNotFound = "window_not_found"
    /// A-08: the recorded window was closed (non-fatal: the helper stops by itself).
    case windowLost = "window_lost"
    /// Non-fatal: no mouse event tap (F-03); the video goes on without mouse events.
    case mouseUnavailable = "mouse_unavailable"
    case internalError = "internal"
}

// MARK: - Commands (stdin)

/// A-08: part of a display, in points relative to its top left.
struct RegionRect: Decodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct StartCommand: Decodable {
    let displayId: String
    let fps: Int
    let output: String
    let framesDir: String
    let frameIntervalMs: Int
    let frameWidth: Int
    /// Emit `mouse` events (F-03). Absent means true.
    let mouse: Bool?
    /// A-08: record this window (a CGWindowID, from `listWindows`) instead of the display.
    let windowId: String?
    /// A-08: record only this part of the display.
    let region: RegionRect?
    /// D-024: record the computer sound into this file (AAC, `system.m4a.partial`).
    let systemAudio: String?
}

enum Command {
    case start(StartCommand)
    /// A-08: answer with the windows that can be recorded, leaving out this process id.
    case listWindows(excludePid: Int32?)
    case pause
    case resume
    case stop
}

enum CommandError: Error {
    case unknown
    case invalidStart
}

func parseCommand(_ line: String) throws -> Command {
    struct Head: Decodable { let cmd: String }
    let data = Data(line.utf8)
    let decoder = JSONDecoder()
    switch try decoder.decode(Head.self, from: data).cmd {
    case "start":
        let start = try decoder.decode(StartCommand.self, from: data)
        guard start.fps == 30 || start.fps == 60, start.frameIntervalMs > 0, start.frameWidth > 0,
              !start.output.isEmpty, !start.framesDir.isEmpty,
              start.windowId == nil || start.region == nil,
              start.systemAudio.map({ !$0.isEmpty }) ?? true
        else { throw CommandError.invalidStart }
        if let region = start.region {
            guard region.width.isFinite, region.height.isFinite, region.x.isFinite, region.y.isFinite,
                  region.width >= 2, region.height >= 2
            else { throw CommandError.invalidStart }
        }
        return .start(start)
    case "listWindows":
        struct ListWindows: Decodable { let excludePid: Int32? }
        return .listWindows(excludePid: try decoder.decode(ListWindows.self, from: data).excludePid)
    case "pause": return .pause
    case "resume": return .resume
    case "stop": return .stop
    default: throw CommandError.unknown
    }
}

// MARK: - Events (stdout)

enum Events {
    private static let lock = NSLock()

    /// One JSON object per line. A single write(2) per line, under a lock, so lines from
    /// different queues never interleave; FileHandle is unbuffered, so every line is flushed.
    static func send(_ fields: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(fields),
              var line = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys])
        else {
            Log.diag("dropped an event that is not valid JSON")
            return
        }
        line.append(0x0A)
        lock.lock()
        defer { lock.unlock() }
        do {
            try FileHandle.standardOutput.write(contentsOf: line)
        } catch {
            // Main went away; stdin EOF will stop the recording.
        }
    }

    static func ready() {
        send(["event": "ready", "version": helperVersion])
    }

    static func started(width: Int, height: Int, scaleFactor: Double, fps: Int) {
        send(["event": "started", "width": width, "height": height, "scaleFactor": scaleFactor, "fps": fps])
    }

    static func paused(seconds: Double) {
        send(["event": "paused", "tMs": milliseconds(seconds)])
    }

    static func resumed(seconds: Double) {
        send(["event": "resumed", "tMs": milliseconds(seconds)])
    }

    static func frame(file: String, tMs: Double) {
        send(["event": "frame", "file": file, "tMs": Int(max(0, tMs).rounded())])
    }

    /// One mouse event (F-03): `t` is video time in ms, the other fields are those of a line of
    /// events.jsonl (MouseEventRecord in @kamo/core), built by MouseTrack.
    static func mouse(_ fields: [String: Any]) {
        var event = fields
        event["event"] = "mouse"
        send(event)
    }

    /// `systemAudioOffset`: D-024, where the first sample of the computer sound file sits on the
    /// video timeline (seconds); nil when no sound was recorded.
    static func stopped(seconds: Double, frames: Int, systemAudioOffset: Double? = nil) {
        var fields: [String: Any] = ["event": "stopped", "durationMs": milliseconds(seconds), "frames": frames]
        if let offset = systemAudioOffset {
            fields["systemAudio"] = ["offsetMs": milliseconds(offset)]
        }
        send(fields)
    }

    /// A-08: the answer to `listWindows`. Titles go to stdout only, never to stderr.
    static func windows(_ windows: [[String: Any]]) {
        send(["event": "windows", "windows": windows])
    }

    static func error(_ code: ErrorCode, _ message: String, fatal: Bool) {
        Log.diag("\(code.rawValue): \(message)")
        send(["event": "error", "code": code.rawValue, "message": message, "fatal": fatal])
    }

    /// Fatal error: the helper exits non-zero without `stopped` (PROTOCOL.md).
    static func fatal(_ code: ErrorCode, _ message: String) -> Never {
        error(code, message, fatal: true)
        exit(1)
    }

    private static func milliseconds(_ seconds: Double) -> Int {
        Int(max(0, seconds * 1000).rounded())
    }
}

enum Log {
    static func diag(_ message: String) {
        let line = Data("kamo-capture: \(message)\n".utf8)
        do {
            try FileHandle.standardError.write(contentsOf: line)
        } catch {
            // Nothing else to report to.
        }
    }
}

/// Domain and code only: error descriptions can contain paths with the user's name.
func describe(_ error: Error?) -> String {
    guard let error else { return "unknown error" }
    let ns = error as NSError
    return "\(ns.domain) \(ns.code)"
}
