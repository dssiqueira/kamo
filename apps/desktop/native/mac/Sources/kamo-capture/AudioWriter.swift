// Computer sound (F-04, D-024): ScreenCaptureKit's audio samples into AAC (`system.m4a`) through
// AVAssetWriter, on the same host clock as the video. The Recorder hands over samples with their
// video time; the file starts at the first one (its time is the track's offset on the video
// timeline, sent to main in `stopped`) and has no gaps for pauses, like the video.
import AVFoundation
import CoreMedia
import Foundation

final class AudioWriter: @unchecked Sendable {
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    /// Video time (seconds) of the first sample written; nil until then.
    private(set) var offset: Double?
    /// Video time of the end of the last sample written, to refuse overlaps.
    private var lastEnd = -Double.infinity
    private(set) var failed = false

    init(url: URL) throws {
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        let writer = try AVAssetWriter(outputURL: url, fileType: .m4a)
        writer.shouldOptimizeForNetworkUse = false
        // Like the video: if the helper dies, what was written up to the last fragment plays.
        writer.movieFragmentInterval = CMTime(seconds: 2, preferredTimescale: 600)
        // AAC-LC 48kHz stereo, the format of the Windows computer sound (D-024).
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48_000,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 160_000,
        ]
        // An invalid settings dictionary raises an Objective-C exception Swift cannot catch.
        guard writer.canApply(outputSettings: settings, forMediaType: .audio) else {
            throw WriterError.unsupportedSettings
        }
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw WriterError.cannotAddInput }
        writer.add(input)
        guard writer.startWriting() else { throw WriterError.cannotStart(writer.error) }
        writer.startSession(atSourceTime: .zero)
        self.writer = writer
        self.input = input
    }

    var error: Error? { writer.error }

    /// Writes one sample buffer whose first sample is at `videoTime` (seconds, pauses removed).
    /// Its timestamps are moved so the file starts at 0 and follows the video clock.
    func append(_ buffer: CMSampleBuffer, videoTime: Double) {
        guard !failed, writer.status == .writing else { return }
        let base = offset ?? videoTime
        let start = videoTime - base
        // A buffer that overlaps the previous one (delivered late around a resume) is skipped.
        guard start >= lastEnd - 0.001 else { return }
        guard input.isReadyForMoreMediaData else { return }
        let hostPTS = buffer.presentationTimeStamp
        guard hostPTS.isValid else { return }
        // Shift every timestamp by the same amount: host PTS → time in this file.
        let shift = CMTimeSubtract(hostPTS, CMTime(seconds: start, preferredTimescale: hostPTS.timescale))
        guard let moved = retimed(buffer, by: shift) else { return }
        if input.append(moved) {
            offset = base
            let duration = buffer.duration
            lastEnd = start + (duration.isValid ? duration.seconds : 0)
        } else {
            failed = true
            Log.diag("computer sound: a sample was refused (\(describe(writer.error)))")
        }
    }

    /// Closes the file. Calls back with true when it is complete and has sound in it.
    func finish(completion: @escaping (Bool) -> Void) {
        guard writer.status == .writing else {
            completion(false)
            return
        }
        if offset == nil {
            // Nothing was written: no file to keep.
            writer.cancelWriting()
            completion(false)
            return
        }
        input.markAsFinished()
        writer.finishWriting {
            completion(self.writer.status == .completed)
        }
    }

    func cancel() {
        if writer.status == .writing { writer.cancelWriting() }
    }
}

/// A copy of `buffer` with every timestamp moved back by `shift`.
private func retimed(_ buffer: CMSampleBuffer, by shift: CMTime) -> CMSampleBuffer? {
    var needed: CMItemCount = 0
    guard CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: 0, arrayToFill: nil,
                                                 entriesNeededOut: &needed) == noErr,
        needed > 0
    else { return nil }
    let count = needed
    var timing = [CMSampleTimingInfo](repeating: CMSampleTimingInfo(), count: count)
    guard CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: count, arrayToFill: &timing,
                                                 entriesNeededOut: &needed) == noErr
    else { return nil }
    for index in timing.indices {
        timing[index].presentationTimeStamp = CMTimeSubtract(timing[index].presentationTimeStamp, shift)
        if timing[index].decodeTimeStamp.isValid {
            timing[index].decodeTimeStamp = CMTimeSubtract(timing[index].decodeTimeStamp, shift)
        }
    }
    var copy: CMSampleBuffer?
    guard CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: buffer,
                                                sampleTimingEntryCount: count, sampleTimingArray: &timing,
                                                sampleBufferOut: &copy) == noErr
    else { return nil }
    return copy
}
