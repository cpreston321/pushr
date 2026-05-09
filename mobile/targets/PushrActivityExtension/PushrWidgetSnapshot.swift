import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(ImageIO)
import ImageIO
#endif

/// Snapshot codec — mirrors the JSON shape written by
/// `modules/widget-data/ios/PushrWidgetDataModule.swift`.
///
/// Single source of truth lives in App Group UserDefaults under
/// `snapshot.v1`. The bridge writes; we read. Bumping the key (`.v2`)
/// is the migration path if the shape ever changes.
struct Snapshot: Codable {
    struct App: Codable, Identifiable, Hashable {
        let id: String
        let name: String
        let logoUrl: String?
    }
    struct Notif: Codable, Identifiable, Hashable {
        let id: String
        let sourceAppId: String
        let title: String
        let body: String
        /// ms since epoch — RN side hands us Date.now()-style numbers.
        let createdAt: Double
        let url: String?
        let appUrl: String?
    }

    let updatedAt: Double
    /// Hex (#RRGGBB) of the user's selected app accent. Mirror of the
    /// `accent` field set by `lib/widget-sync.ts`. Optional so older
    /// snapshots — and the NSE write path that doesn't know the accent —
    /// still decode cleanly.
    let accent: String?
    let sourceApps: [App]
    let unread: [Notif]

    static let empty = Snapshot(updatedAt: 0, accent: nil, sourceApps: [], unread: [])

    /// Default accent (matches `ACCENT_PRESETS.blue.dark` in lib/theme.ts).
    static let defaultAccent = Color(red: 10/255, green: 132/255, blue: 1.0)

    var accentColor: Color {
        guard let hex = accent, let c = Color(hex: hex) else {
            return Snapshot.defaultAccent
        }
        return c
    }

    static let appGroup = "group.dev.cpreston.pushr"
    static let key = "snapshot.v1"

    static func read() -> Snapshot {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = defaults.data(forKey: key),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data)
        else {
            return .empty
        }
        return snap
    }

    /// Allowed-list filter. An empty selection means "show everything" —
    /// the widget is useful out-of-the-box before the user picks apps.
    func filtered(allowedIds: [String]) -> [Notif] {
        guard !allowedIds.isEmpty else { return unread }
        let allowed = Set(allowedIds)
        return unread.filter { allowed.contains($0.sourceAppId) }
    }

    func app(for id: String) -> App? {
        sourceApps.first { $0.id == id }
    }

    // MARK: - Logo cache (paired with the bridge)
    //
    // The widget-data bridge mirrors each source app's logo into
    // `<AppGroup>/logos/<sourceAppId>` so we can decode it from disk
    // synchronously. AsyncImage is unreliable in widgets — short
    // execution budget, no retry — disk is the right answer.

    static let logosDir = "logos"

    static func appGroupContainerURL() -> URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
        )
    }

    static func logoURL(for id: String) -> URL? {
        appGroupContainerURL()?
            .appendingPathComponent(logosDir, isDirectory: true)
            .appendingPathComponent(id)
    }

    #if canImport(UIKit)
    /// Returns the cached logo as a downsized UIImage, or nil if it isn't
    /// on disk yet. Callers fall back to an initials badge in that case.
    ///
    /// We decode through `CGImageSource` with a thumbnail max-pixel-size
    /// rather than `UIImage(contentsOfFile:)` so the full-resolution
    /// bitmap never enters memory. Small widgets have a ~30MB budget on
    /// iPhone — a single 1024×1024 PNG (~4MB decompressed) plus SwiftUI's
    /// own overhead is enough to push them over and silently fail
    /// rendering, leaving the widget stuck on placeholder.
    static func logoImage(for id: String, maxPixelSize: Int = 96) -> UIImage? {
        guard let url = logoURL(for: id) else { return nil }
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard
            let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let cgImage = CGImageSourceCreateThumbnailAtIndex(
                source, 0, options as CFDictionary
            )
        else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
    #endif
}

extension Color {
    /// Tiny `#RRGGBB` / `#RRGGBBAA` parser for the accent hex carried in
    /// the snapshot. Returns nil for malformed input so callers can fall
    /// back to a default.
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6 || s.count == 8 else { return nil }
        var value: UInt64 = 0
        guard Scanner(string: s).scanHexInt64(&value) else { return nil }
        let r, g, b, a: Double
        if s.count == 6 {
            r = Double((value >> 16) & 0xFF) / 255
            g = Double((value >> 8) & 0xFF) / 255
            b = Double(value & 0xFF) / 255
            a = 1.0
        } else {
            r = Double((value >> 24) & 0xFF) / 255
            g = Double((value >> 16) & 0xFF) / 255
            b = Double((value >> 8) & 0xFF) / 255
            a = Double(value & 0xFF) / 255
        }
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
