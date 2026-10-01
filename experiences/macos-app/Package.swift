// swift-tools-version:5.10
// Chandrabindu menu bar app: a native macOS status-bar client for the hub.
// Build the .app bundle with scripts/build-app.sh (swift build alone produces a
// bare executable without the Info.plist the menu bar app needs).
import PackageDescription

let package = Package(
    name: "ChandrabinduBar",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "ChandrabinduBar",
            path: "Sources/ChandrabinduBar",
            linkerSettings: [
                .linkedFramework("Carbon"),
                .linkedFramework("WebKit"),
                .linkedFramework("ServiceManagement"),
            ]
        ),
    ]
)
