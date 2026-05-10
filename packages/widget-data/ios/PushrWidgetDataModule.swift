import ExpoModulesCore
import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Bridge between the RN app and the Home Screen widget extension.
///
/// We share state via App Group `UserDefaults` (suite name
/// `group.dev.cpreston.pushr`). The JS layer hands us a snapshot of source
/// apps + recent unread notifications; we serialize it to JSON under a
/// single key and then ask WidgetKit to reload all timelines so the
/// widget re-renders with the fresh data.
///
/// Why one key (raw JSON) instead of mirrored Swift types: the widget
/// target lives in its own bundle and shipping shared types between
/// extensions is fragile under Expo prebuild. A single JSON blob is
/// trivially decoded on either side and survives schema additions.
public class PushrWidgetDataModule: Module {
    static let appGroup = "group.dev.cpreston.pushr"
    static let snapshotKey = "snapshot.v1"
    static let logosDir = "logos"

    public func definition() -> ModuleDefinition {
        Name("PushrWidgetData")

        AsyncFunction("setSnapshot") { (snapshot: [String: Any], promise: Promise) in
            // Write the snapshot first so the widget can render *something*
            // immediately, then download logos in the background and reload
            // once they're on disk. Returns true once everything is cached.
            _ = PushrWidgetDataModule.write(snapshot: snapshot)
            Task {
                await PushrWidgetDataModule.cacheLogos(from: snapshot)
                _ = PushrWidgetDataModule.reloadAllTimelines()
                promise.resolve(true)
            }
        }

        AsyncFunction("reload") { () -> Bool in
            return PushrWidgetDataModule.reloadAllTimelines()
        }

        AsyncFunction("clear") { () -> Bool in
            guard let defaults = UserDefaults(suiteName: PushrWidgetDataModule.appGroup) else {
                return false
            }
            defaults.removeObject(forKey: PushrWidgetDataModule.snapshotKey)
            // Also wipe the logo cache so it can't outlive the user's session.
            if let dir = PushrWidgetDataModule.logosDirectoryURL() {
                try? FileManager.default.removeItem(at: dir)
            }
            _ = PushrWidgetDataModule.reloadAllTimelines()
            return true
        }
    }

    static func write(snapshot: [String: Any]) -> Bool {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            NSLog("PushrWidgetData: missing App Group \(appGroup)")
            return false
        }
        guard JSONSerialization.isValidJSONObject(snapshot),
              let data = try? JSONSerialization.data(withJSONObject: snapshot) else {
            NSLog("PushrWidgetData: snapshot was not JSON-serializable")
            return false
        }
        defaults.set(data, forKey: snapshotKey)
        // Fire-and-forget: it's fine if reload arrives a frame before the
        // write is flushed — WidgetKit reads on its own schedule and the
        // App Group store is process-safe.
        _ = reloadAllTimelines()
        return true
    }

    @discardableResult
    static func reloadAllTimelines() -> Bool {
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
            return true
        }
        #endif
        return false
    }

    // MARK: - Logo cache
    //
    // We mirror each source app's logo into the App Group container so the
    // widget can decode it from disk synchronously. AsyncImage in widgets
    // is unreliable — short execution budget, no guaranteed retry. Disk
    // is.
    //
    // Layout: <AppGroup>/logos/<sourceAppId>
    // The widget reads `UIImage(contentsOfFile:)` against this path.

    static func appGroupContainerURL() -> URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
        )
    }

    static func logosDirectoryURL() -> URL? {
        appGroupContainerURL()?.appendingPathComponent(logosDir, isDirectory: true)
    }

    static func cacheLogos(from snapshot: [String: Any]) async {
        guard let dir = logosDirectoryURL() else { return }
        try? FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true
        )

        let sourceApps = (snapshot["sourceApps"] as? [[String: Any]]) ?? []
        await withTaskGroup(of: Void.self) { group in
            for app in sourceApps {
                guard
                    let id = app["id"] as? String,
                    let urlStr = app["logoUrl"] as? String,
                    let url = URL(string: urlStr)
                else { continue }
                group.addTask {
                    await downloadLogo(id: id, from: url, into: dir)
                }
            }
        }
    }

    private static func downloadLogo(id: String, from url: URL, into dir: URL) async {
        let dest = dir.appendingPathComponent(id)
        // Skip the network round-trip if we already have a non-empty cached
        // copy. Convex storage URLs are versioned per upload so a stale
        // logo only happens after the user re-uploads — at which point the
        // user will trigger another snapshot write on next app open.
        if FileManager.default.fileExists(atPath: dest.path),
           let attrs = try? FileManager.default.attributesOfItem(atPath: dest.path),
           let size = attrs[.size] as? Int, size > 0 {
            return
        }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard !data.isEmpty else { return }
            try data.write(to: dest, options: .atomic)
        } catch {
            NSLog("PushrWidgetData: logo download failed for \(id): \(error)")
        }
    }
}
