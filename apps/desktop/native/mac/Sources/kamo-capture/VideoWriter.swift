// H.264 in a fragmented MP4 through AVAssetWriter (VideoToolbox does the encoding, in hardware
// on every Mac that runs ScreenCaptureKit). Times given to it are video time in seconds,
// already shifted for pauses by the Recorder, so the file starts at 0 and has no gaps.
import AVFoundation
import CoreMedia
import Foundation
import VideoToolbox

enum WriterError: Error {
    case unsupportedSettings
    case cannotAddInput
    case cannotStart(Error?)
}

final class VideoWriter: @unchecked Sendable {
    enum AppendResult {
        case appended
        /// The encoder is busy; the frame is skipped (real-time capture never waits).
        case dropped
        case failed
    }

    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor

    init(url: URL, width: Int, height: Int, fps: Int) throws {
        // AVAssetWriter refuses to write over an existing file.
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = false
        // Fragments every 2s: if the helper dies, the file still plays up to the last fragment.
        // finishWriting() turns it into a regular MP4.
        writer.movieFragmentInterval = CMTime(seconds: 2, preferredTimescale: 600)

        // Screen content is mostly static; ~0.08 bit per pixel per frame keeps text sharp.
        let bitrate = Int(min(max(Double(width * height * fps) * 0.08, 4_000_000), 50_000_000))
        var settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoExpectedSourceFrameRateKey: fps,
                AVVideoMaxKeyFrameIntervalKey: fps * 2,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                // No B-frames: decode order equals presentation order, simpler fragments.
                AVVideoAllowFrameReorderingKey: false,
            ] as [String: Any],
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ]
        // Ask for the hardware encoder explicitly; fall back to the defaults if refused.
        var withHardware = settings
        withHardware[AVVideoEncoderSpecificationKey] = [
            kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder as String: true,
        ]
        if writer.canApply(outputSettings: withHardware, forMediaType: .video) {
            settings = withHardware
        }
        // An invalid settings dictionary raises an Objective-C exception in AVAssetWriterInput's
        // initializer, which Swift cannot catch: check first.
        guard writer.canApply(outputSettings: settings, forMediaType: .video) else {
            throw WriterError.unsupportedSettings
        }
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw WriterError.cannotAddInput }
        writer.add(input)
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: nil
        )
        guard writer.startWriting() else { throw WriterError.cannotStart(writer.error) }
        writer.startSession(atSourceTime: .zero)

        self.writer = writer
        self.input = input
        self.adaptor = adaptor
    }

    var error: Error? { writer.error }

    func append(_ buffer: CVPixelBuffer, at seconds: Double) -> AppendResult {
        guard writer.status == .writing else { return .failed }
        guard input.isReadyForMoreMediaData else { return .dropped }
        let time = CMTime(seconds: seconds, preferredTimescale: 90_000)
        return adaptor.append(buffer, withPresentationTime: time) ? .appended : .failed
    }

    /// Ends the video at `seconds` and closes the file. Calls back with true when the MP4 is complete.
    func finish(at seconds: Double, completion: @escaping (Bool) -> Void) {
        guard writer.status == .writing else {
            completion(false)
            return
        }
        input.markAsFinished()
        writer.endSession(atSourceTime: CMTime(seconds: seconds, preferredTimescale: 90_000))
        writer.finishWriting {
            completion(self.writer.status == .completed)
        }
    }

    func cancel() {
        if writer.status == .writing { writer.cancelWriting() }
    }
}

/// True when the error (or one it wraps) means the disk is full.
func isDiskFull(_ error: Error?) -> Bool {
    var current = error.map { $0 as NSError }
    while let ns = current {
        if ns.domain == AVFoundationErrorDomain, ns.code == AVError.Code.diskFull.rawValue { return true }
        if ns.domain == NSPOSIXErrorDomain, ns.code == Int(ENOSPC) { return true }
        if ns.domain == NSCocoaErrorDomain, ns.code == NSFileWriteOutOfSpaceError { return true }
        current = ns.userInfo[NSUnderlyingErrorKey] as? NSError
    }
    return false
}
