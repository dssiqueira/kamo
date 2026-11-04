// swift-tools-version:5.9
// Mac capture helper (D-023): records one display with ScreenCaptureKit and speaks the stdio
// protocol in apps/desktop/src/main/capture/PROTOCOL.md. No third-party dependencies.
import PackageDescription

let package = Package(
    name: "kamo-capture",
    platforms: [.macOS("13.3")],
    targets: [
        .executableTarget(
            name: "kamo-capture",
            path: "Sources/kamo-capture"
        ),
    ]
)
