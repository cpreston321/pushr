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
///
/// Push-to-start / per-activity update tokens (iOS 16.2+ and 17.2+ push-to-start):
/// the JS layer calls `enablePushUpdates()` on startup, which kicks off two
/// background tasks observing the ActivityKit token streams. Tokens are
/// emitted as events for the JS layer to report to the backend.
public class PushrActivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PushrActivity")

        Events("onPushToStartToken", "onActivityUpdateToken")

        AsyncFunction("areActivitiesEnabled") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }

        AsyncFunction("enablePushUpdates") { [weak self] () -> Bool in
            guard let self = self else { return false }
            return PushrActivityModule.startObservingTokens(module: self)
        }

        /// Returns the last push-to-start token captured by the observer, if
        /// any. Useful after a JS reload, when the observer is still running
        /// but new JS listeners missed the original emission.
        AsyncFunction("getLastPushToStartToken") { () -> String? in
            return PushrActivityModule._lastPushToStartToken
        }

        /// Returns the cached per-activity update tokens keyed by caller id.
        AsyncFunction("getActivityUpdateTokens") { () -> [[String: String]] in
            return PushrActivityModule._lastActivityTokens.map { entry in
                [
                    "activityId": entry.key,
                    "nativeActivityId": entry.value.nativeActivityId,
                    "token": entry.value.token,
                ]
            }
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

    // MARK: - Activity registry (session-scoped)

    @available(iOS 16.2, *)
    private static var _activeActivities: [String: Activity<PushrActivityAttributes>] = [:]

    /// Reverse lookup: ActivityKit's native id → caller id. Filled in on start so
    /// per-activity update token callbacks (which only know the native Activity)
    /// can be tagged with our caller id when emitting events.
    private static var _nativeIdToCallerId: [String: String] = [:]

    private static var _observingStartTokens = false
    private static var _observingActivityTokens = false

    /// Last push-to-start token captured by the observer — survives JS
    /// reloads so a fresh listener can backfill by calling
    /// `getLastPushToStartToken`.
    private static var _lastPushToStartToken: String?

    /// Last update token per caller-id — same story.
    private struct CachedActivityToken {
        let nativeActivityId: String
        let token: String
    }
    private static var _lastActivityTokens: [String: CachedActivityToken] = [:]

    // MARK: - Token observers

    /// Start the two ActivityKit token-update streams. Idempotent.
    /// - `Activity<T>.pushToStartTokenUpdates` — iOS 17.2+; fires once the
    ///    device has a push-to-start token for this attributes type.
    /// - `Activity<T>.activityUpdates` — iOS 16.2+; fires for every started
    ///    activity (including ones started from an APNs push-to-start). For
    ///    each, we subscribe to its own `pushTokenUpdates`.
    @discardableResult
    private static func startObservingTokens(module: Module) -> Bool {
        guard #available(iOS 16.2, *) else { return false }

        if !_observingActivityTokens {
            _observingActivityTokens = true

            // Backfill: any activity already running — including ones
            // created via push-to-start while the app was terminated — is
            // not yielded by `activityUpdates`. Subscribe to each one's
            // token stream now.
            for activity in Activity<PushrActivityAttributes>.activities {
                observeActivityTokens(activity, module: module)
            }

            Task {
                for await activity in Activity<PushrActivityAttributes>.activityUpdates {
                    observeActivityTokens(activity, module: module)
                }
            }
        }

        if #available(iOS 17.2, *), !_observingStartTokens {
            _observingStartTokens = true
            Task { [weak module] in
                for await tokenData in Activity<PushrActivityAttributes>
                    .pushToStartTokenUpdates
                {
                    let hex = tokenData
                        .map { String(format: "%02x", $0) }
                        .joined()
                    _lastPushToStartToken = hex
                    module?.sendEvent(
                        "onPushToStartToken",
                        ["token": hex]
                    )
                }
            }
        }

        return true
    }

    /// Register an activity with the module's caller-id map (keyed by native
    /// id for push-to-start-created activities) and begin watching its
    /// per-activity push token.
    @available(iOS 16.2, *)
    private static func observeActivityTokens(
        _ activity: Activity<PushrActivityAttributes>,
        module: Module?
    ) {
        if _nativeIdToCallerId[activity.id] == nil {
            // Prefer the caller-id embedded in the activity's attributes
            // (set by the backend for push-to-start, or by us on foreground
            // `start`). Fall back to the native UUID so older activities
            // still produce a stable key.
            let callerId = activity.attributes.callerId ?? activity.id
            _nativeIdToCallerId[activity.id] = callerId
            _activeActivities[callerId] = activity
        }
        Task { [weak module] in
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData
                    .map { String(format: "%02x", $0) }
                    .joined()
                let callerId = _nativeIdToCallerId[activity.id] ?? activity.id
                _lastActivityTokens[callerId] = CachedActivityToken(
                    nativeActivityId: activity.id,
                    token: hex
                )
                module?.sendEvent(
                    "onActivityUpdateToken",
                    [
                        "activityId": callerId,
                        "nativeActivityId": activity.id,
                        "token": hex,
                    ]
                )
            }
        }
    }

    // MARK: - Implementation

    private static func start(options: [String: Any]) async -> [String: Any] {
        if #available(iOS 16.2, *) {
            guard let activityId = options["activityId"] as? String else {
                return ["ok": false, "reason": "activityId is required"]
            }
            guard let stateRaw = options["state"] as? [String: Any] else {
                return ["ok": false, "reason": "state is required"]
            }
            let attrs = parseAttributes(
                options["attributes"] as? [String: Any],
                callerId: activityId
            )
            let content = parseContentState(stateRaw)
            let stale = (options["staleDate"] as? Double).map {
                Date(timeIntervalSince1970: $0 / 1000.0)
            }
            let relevance = options["relevanceScore"] as? Double

            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                return ["ok": false, "reason": "activities not enabled"]
            }

            if let existing = _activeActivities[activityId] {
                await existing.end(dismissalPolicy: .immediate)
                if let nid = _nativeIdToCallerId.first(where: {
                    $0.value == activityId
                })?.key {
                    _nativeIdToCallerId.removeValue(forKey: nid)
                }
                _activeActivities.removeValue(forKey: activityId)
            }

            do {
                let activityContent = ActivityContent(
                    state: content,
                    staleDate: stale,
                    relevanceScore: relevance ?? 0
                )
                // `pushType: .token` enrolls the activity for per-activity
                // push updates. The resulting tokens surface on
                // `activity.pushTokenUpdates`, which the module's observer
                // task forwards as `onActivityUpdateToken` events.
                let activity = try Activity.request(
                    attributes: attrs,
                    content: activityContent,
                    pushType: .token
                )
                _activeActivities[activityId] = activity
                _nativeIdToCallerId[activity.id] = activityId
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
            let stale = (options["staleDate"] as? Double).map {
                Date(timeIntervalSince1970: $0 / 1000.0)
            }
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
            if let nid = _nativeIdToCallerId.first(where: { $0.value == activityId })?
                .key
            {
                _nativeIdToCallerId.removeValue(forKey: nid)
            }
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

    @available(iOS 16.2, *)
    private static func parseAttributes(
        _ raw: [String: Any]?,
        callerId: String
    ) -> PushrActivityAttributes {
        return PushrActivityAttributes(
            name: raw?["name"] as? String,
            logoUrl: raw?["logoUrl"] as? String,
            callerId: callerId
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
