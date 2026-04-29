import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Shared ActivityAttributes for pushr Live Activities.
///
/// IMPORTANT: this file is duplicated at
/// `mobile/modules/live-activity/ios/PushrActivityAttributes.swift` so the
/// main app's Expo module can construct the same type. Keep the two copies
/// in sync — they're separate compile units (one in the main app target,
/// one in this widget target) and ActivityKit requires the same struct
/// declaration in both.
///
/// `ContentState` is the mutable part (pushed on `update`). `Attributes`
/// (the outer struct's stored props) are immutable for the life of the
/// activity.
@available(iOS 16.2, *)
public struct PushrActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var title: String?
        public var status: String?
        public var progress: Double?   // 0..1
        public var icon: String?       // SF Symbol name

        public init(title: String? = nil,
                    status: String? = nil,
                    progress: Double? = nil,
                    icon: String? = nil) {
            self.title = title
            self.status = status
            self.progress = progress
            self.icon = icon
        }
    }

    public var name: String?
    public var logoUrl: String?
    /// The caller-provided activity id. Carried in Attributes so it
    /// survives server-initiated push-to-start: the backend puts the
    /// caller id into the APNs payload's `attributes.callerId` field and
    /// the Widget creates the activity with it; our observer then reads
    /// `activity.attributes.callerId` to correlate with backend records.
    public var callerId: String?

    public init(name: String? = nil,
                logoUrl: String? = nil,
                callerId: String? = nil) {
        self.name = name
        self.logoUrl = logoUrl
        self.callerId = callerId
    }
}
#endif
