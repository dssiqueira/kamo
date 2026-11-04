// Reference frames (D-023, data-model.md): a JPEG `frameWidth` px wide every `frameIntervalMs`
// of video time, straight from the captured pixel buffers, encoded off the capture queue.
import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import ImageIO
import UniformTypeIdentifiers

final class FrameWriter: @unchecked Sendable {
    private let queue = DispatchQueue(label: "app.kamo.capture.frames", qos: .utility)
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let directory: URL
    private let width: Int
    /// Only touched on `queue`.
    private var written = 0

    init(directory: URL, width: Int) {
        self.directory = directory
        self.width = width
    }

    /// Queues one thumbnail for video time `tMs`; the `frame` event goes out once it is on disk.
    func write(_ buffer: CVPixelBuffer, tMs: Double) {
        queue.async { self.encode(buffer, tMs: tMs) }
    }

    /// Waits for the queued thumbnails and returns how many were written.
    func drain() -> Int {
        queue.sync { written }
    }

    private func encode(_ buffer: CVPixelBuffer, tMs: Double) {
        // File name: the video second, zero-padded to 4 digits (0000.jpg, 0005.jpg, ...).
        let file = String(format: "%04d.jpg", Int((tMs / 1000).rounded()))
        let image = CIImage(cvPixelBuffer: buffer)
        guard image.extent.width > 0, image.extent.height > 0 else { return }

        // Lanczos keeps small UI text readable at 480px, where a plain affine scale aliases.
        let scale = Double(width) / Double(image.extent.width)
        let filter = CIFilter.lanczosScaleTransform()
        filter.inputImage = image
        filter.scale = Float(scale)
        filter.aspectRatio = 1
        let height = max(1, (Double(image.extent.height) * scale).rounded())
        let rect = CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height))
        guard let output = filter.outputImage, let cgImage = context.createCGImage(output, from: rect) else {
            Log.diag("reference frame \(file): scaling failed")
            return
        }

        let url = directory.appendingPathComponent(file)
        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL, UTType.jpeg.identifier as CFString, 1, nil
        ) else {
            Log.diag("reference frame \(file): cannot create the JPEG file")
            return
        }
        let properties = [kCGImageDestinationLossyCompressionQuality: 0.7] as CFDictionary
        CGImageDestinationAddImage(destination, cgImage, properties)
        guard CGImageDestinationFinalize(destination) else {
            Log.diag("reference frame \(file): writing the JPEG failed")
            return
        }
        written += 1
        Events.frame(file: file, tMs: tMs)
    }
}
