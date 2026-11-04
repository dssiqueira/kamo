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
    /// Non-fatal: no mouse event tap (F-03); the video goes on without mouse events.
    case mouseUnavailable = "mouse_unavailable"
    case internalError = "internal"
}

// MARK: - Commands (stdin)

struct StartCommand: Decodable {
    let displayId: String
    let fps: Int
    let output: String
    let framesDir: String
    let frameIntervalMs: Int
    let frameWidth: Int
    /// Emit `mouse` events (F-03). Absent means true.
    let mouse: Bool?
}

enum Command {
    case start(StartCommand)
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
              !start.output.isEmpty, !start.framesDir.isEmpty
        else { throw CommandError.invalidStart }
        return .start(start)
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

    static func stopped(seconds: Double, frames: Int) {
        send(["event": "stopped", "durationMs": milliseconds(seconds), "frames": frames])
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
