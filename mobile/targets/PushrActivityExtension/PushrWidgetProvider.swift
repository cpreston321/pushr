import WidgetKit

@available(iOS 17.0, *)
struct PushrEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot
    let configuration: PushrWidgetIntent
}

/// Push-driven timeline. The host app (and the Notification Service
/// Extension) call `WidgetCenter.shared.reloadAllTimelines()` whenever
/// the snapshot changes. We pair that with a coarse fallback refresh
/// every 15 minutes — `.never` can leave the small widget stuck on the
/// initial placeholder on some iOS versions; an explicit reload date
/// guarantees iOS re-asks us.
@available(iOS 17.0, *)
struct PushrWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> PushrEntry {
        PushrEntry(
            date: Date(),
            snapshot: .empty,
            configuration: PushrWidgetIntent()
        )
    }

    func snapshot(
        for configuration: PushrWidgetIntent,
        in context: Context
    ) async -> PushrEntry {
        PushrEntry(
            date: Date(),
            snapshot: Snapshot.read(),
            configuration: configuration
        )
    }

    func timeline(
        for configuration: PushrWidgetIntent,
        in context: Context
    ) async -> Timeline<PushrEntry> {
        let entry = PushrEntry(
            date: Date(),
            snapshot: Snapshot.read(),
            configuration: configuration
        )
        let nextRefresh = Date().addingTimeInterval(15 * 60)
        return Timeline(entries: [entry], policy: .after(nextRefresh))
    }
}
