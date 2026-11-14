// kamo-capture: Mac screen capture helper (D-023). Started by the Electron main process,
// controlled over stdio (PROTOCOL.md). Video of a display, a region or a window (A-08), mouse
// events (F-03) and the computer sound (D-024).
import AppKit
import CoreGraphics
import Foundation
import ScreenCaptureKit

/// Reads commands line by line on a background thread; stdin EOF means `stop`.
func readCommands(into recorder: Recorder) {
    let thread = Thread {
        while let line = readLine(strippingNewline: true) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            do {
                recorder.handle(try parseCommand(trimmed))
            } catch {
                // Never echo the line: it can contain paths with the user's name.
                Events.error(.internalError, "ignored an invalid command line", fatal: false)
            }
        }
        recorder.handle(.stop)
    }
    thread.name = "stdin"
    thread.start()
}

// Onboarding (F-13): `--request-screen-access` asks macOS for Screen Recording and exits.
// Electron has no API for it. On macOS 26 CGRequestScreenCaptureAccess neither prompts nor adds
// the app to System Settings (tccd: "Service kTCCServiceScreenCapture does not allow prompting");
// asking ScreenCaptureKit for the shareable content does both, once per request. The helper is
// Kamo's child, so macOS attributes the request to Kamo (the responsible process). Prints one
// line, `{"granted":true|false}`, and never records. Only the onboarding and Settings call it,
// never a list that refreshes (each call would show the dialog again).
if CommandLine.arguments.dropFirst().contains("--request-screen-access") {
    var granted = CGPreflightScreenCaptureAccess()
    if !granted {
        let done = DispatchSemaphore(value: 0)
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, _ in
            granted = content != nil
            done.signal()
        }
        // The system dialog does not block the answer; never hang the onboarding.
        _ = done.wait(timeout: .now() + 10)
        if !granted { _ = CGRequestScreenCaptureAccess() }
    }
    print("{\"granted\":\(granted)}")
    exit(0)
}

// A closed stdout must not kill the helper before it finalizes the file.
signal(SIGPIPE, SIG_IGN)
// Kept alive for the whole process: SCStream only holds its output and delegate weakly.
let recorder = Recorder()
Events.ready()
readCommands(into: recorder)
// NSApplication instead of dispatchMain(): the mouse monitor (Mouse.swift) needs AppKit's event
// loop on the main thread, which also drains the main queue. Never shows in the Dock.
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
application.run()
