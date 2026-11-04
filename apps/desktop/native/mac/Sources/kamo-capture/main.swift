// kamo-capture: Mac screen capture helper (D-023). Started by the Electron main process,
// controlled over stdio (PROTOCOL.md). Video and mouse events (F-03); audio arrives in step 3.
import Foundation

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

// A closed stdout must not kill the helper before it finalizes the file.
signal(SIGPIPE, SIG_IGN)
// Kept alive for the whole process: SCStream only holds its output and delegate weakly.
let recorder = Recorder()
Events.ready()
readCommands(into: recorder)
dispatchMain()
