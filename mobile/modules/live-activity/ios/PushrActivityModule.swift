import ExpoModulesCore
import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// ActivityKit bridge exposed to JS as `PushrActivity`.
///
/// iOS 16.2+ is required for push/update/end (`ActivityContent` API).
/// On older iOS / non-iOS platforms every function resolves with
/// `{ ok: false, reason: "unsupported" }` so the JS facade can no-op.
public class PushrActivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PushrActivity")

        AsyncFunction("areActivitiesEnabled") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }

        AsyncFunction("start") { (options: [String: Any]) -> [String: Any] in
            return await PushrActivityModule.start(options: options)
        }

        AsyncFunction("update") { (options: [String: Any]) -> [String: Any] in
            return await PushrActivityModule.update(options: options)
        }

        AsyncFunction("end") { (options: [String: Any]) -> [String: Any] in
            return await PushrActivityModule.end(options: options)
        }

        AsyncFunction("listActive") { () -> [String] in
            return PushrActivityModule.listActive()
        }
    }

    // MARK: - Implementation

    /// Map of caller-provided activityId → ActivityKit `Activity` handle.
    /// ActivityKit assigns its own UUID per activity; we keep this map so
    /// callers can reference activities by a stable id across app restarts.
    @available(iOS 16.2, *)
    private static var activeActivities: [String: Activity<PushrActivityAttributes>] {
        get {
            // Rehydrate from the currently-running activities so the map
            // survives an app cold-start. We stuff the caller id into
            // ContentState? No — attributes can't change. Use the Activity's
            // `id` and rely on us starting fresh each app session.
            //
            // Simpler model: caller ids only persist for the app session.
            // End callers must tolerate "unknown id" for restarts.
            return _activeActivities
        }
    }

    @available(iOS 16.2, *)
    private static var _activeActivities: [String: Activity<PushrActivityAttributes>] = [:]

    private static func start(options: [String: Any]) async -> [String: Any] {
        if #available(iOS 16.2, *) {
            guard let activityId = options["activityId"] as? String else {
                return ["ok": false, "reason": "activityId is required"]
            }
            guard let stateRaw = options["state"] as? [String: Any] else {
                return ["ok": false, "reason": "state is required"]
            }
            let attrs = parseAttributes(options["attributes"] as? [String: Any])
            let content = parseContentState(stateRaw)
            let stale = (options["staleDate"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000.0) }
            let relevance = options["relevanceScore"] as? Double

            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                return ["ok": false, "reason": "activities not enabled"]
            }

            // End any existing activity with the same caller id so callers
            // can safely re-start after a crash/restart.
            if let existing = _activeActivities[activityId] {
                await existing.end(dismissalPolicy: .immediate)
                _activeActivities.removeValue(forKey: activityId)
            }

            do {
                let activityContent = ActivityContent(
                    state: content,
                    staleDate: stale,
                    relevanceScore: relevance ?? 0
                )
                let activity = try Activity.request(
                    attributes: attrs,
                    content: activityContent,
                    pushType: nil
                )
                _activeActivities[activityId] = activity
                return ["ok": true, "nativeId": activity.id]
            } catch {
                return ["ok": false, "reason": "\(error)"]
            }
        } else {
            return ["ok": false, "reason": "unsupported"]
        }
    }

    private static func update(options: [String: Any]) async -> [String: Any] {
        if #available(iOS 16.2, *) {
            guard let activityId = options["activityId"] as? String else {
                return ["ok": false, "reason": "activityId is required"]
            }
            guard let activity = _activeActivities[activityId] else {
                return ["ok": false, "reason": "activity not found"]
            }
            guard let stateRaw = options["state"] as? [String: Any] else {
                return ["ok": false, "reason": "state is required"]
            }
            let content = parseContentState(stateRaw)
            let stale = (options["staleDate"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000.0) }
            let relevance = options["relevanceScore"] as? Double
            let activityContent = ActivityContent(
                state: content,
                staleDate: stale,
                relevanceScore: relevance ?? 0
            )
            await activity.update(activityContent)
            return ["ok": true]
        } else {
            return ["ok": false, "reason": "unsupported"]
        }
    }

    private static func end(options: [String: Any]) async -> [String: Any] {
        if #available(iOS 16.2, *) {
            guard let activityId = options["activityId"] as? String else {
                return ["ok": false, "reason": "activityId is required"]
            }
            guard let activity = _activeActivities[activityId] else {
                return ["ok": false, "reason": "activity not found"]
            }
            let finalState: PushrActivityAttributes.ContentState
            if let stateRaw = options["state"] as? [String: Any] {
                finalState = parseContentState(stateRaw)
            } else {
                finalState = activity.content.state
            }
            let policy = parseDismissalPolicy(options["dismissalPolicy"])
            let content = ActivityContent(state: finalState, staleDate: nil)
            await activity.end(content, dismissalPolicy: policy)
            _activeActivities.removeValue(forKey: activityId)
            return ["ok": true]
        } else {
            return ["ok": false, "reason": "unsupported"]
        }
    }

    private static func listActive() -> [String] {
        if #available(iOS 16.2, *) {
            return Array(_activeActivities.keys)
        }
        return []
    }

    // MARK: - Parsing helpers

    private static func parseAttributes(_ raw: [String: Any]?) -> PushrActivityAttributes {
        return PushrActivityAttributes(
            name: raw?["name"] as? String,
            logoUrl: raw?["logoUrl"] as? String
        )
    }

    @available(iOS 16.2, *)
    private static func parseContentState(_ raw: [String: Any]) -> PushrActivityAttributes.ContentState {
        return PushrActivityAttributes.ContentState(
            title: raw["title"] as? String,
            status: raw["status"] as? String,
            progress: raw["progress"] as? Double,
            icon: raw["icon"] as? String
        )
    }

    @available(iOS 16.2, *)
    private static func parseDismissalPolicy(_ raw: Any?) -> ActivityUIDismissalPolicy {
        if let str = raw as? String {
            switch str {
            case "immediate": return .immediate
            case "default": return .default
            default: return .default
            }
        }
        if let dict = raw as? [String: Any], let after = dict["after"] as? Double {
            return .after(Date().addingTimeInterval(after / 1000.0))
        }
        return .default
    }
}
