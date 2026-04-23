import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Shared ActivityAttributes for pushr Live Activities.
///
/// Included in BOTH the main app target (so the ExpoModule can `Activity.request`)
/// and the Widget Extension target (so the Widget can read the struct). The file
/// is referenced from Expo's config plugin — don't move it without updating
/// `plugin.js`.
///
/// `ContentState` is the mutable part (pushed on `update`). `Attributes` (the
/// outer struct's stored props) are immutable for the life of the activity.
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

    public init(name: String? = nil, logoUrl: String? = nil) {
        self.name = name
        self.logoUrl = logoUrl
    }
}
#endif
