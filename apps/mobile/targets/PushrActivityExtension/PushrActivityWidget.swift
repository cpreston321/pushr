import ActivityKit
import SwiftUI
import WidgetKit

/// Widget Extension entrypoint — hosts both the Live Activity widget
/// (iOS 16.2+) and the Home Screen feed widget (iOS 17+) in one bundle.
///
/// One Xcode Widget Extension target, multiple `Widget` declarations:
/// Apple supports this via `WidgetBundleBuilder`'s `if #available` block,
/// so each widget can require its own minimum OS without dragging the
/// other along.
///
/// Files in this target:
/// - PushrActivityAttributes.swift  — Live Activity attribute schema
/// - PushrWidgetSnapshot.swift      — App Group snapshot codec
/// - PushrWidgetIntent.swift        — Configuration intent + entity
/// - PushrWidgetProvider.swift      — TimelineProvider for the feed widget
/// - PushrWidgetView.swift          — Small + Medium SwiftUI views

@main
@available(iOS 16.2, *)
struct PushrActivityBundle: WidgetBundle {
    var body: some Widget {
        PushrActivityLiveWidget()
        if #available(iOS 17.0, *) {
            PushrFeedWidget()
        }
    }
}

@available(iOS 17.0, *)
struct PushrFeedWidget: Widget {
    let kind: String = "PushrFeedWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: PushrWidgetIntent.self,
            provider: PushrWidgetProvider()
        ) { entry in
            PushrWidgetView(entry: entry)
        }
        .configurationDisplayName("pushr feed")
        .description("Latest unread notifications. Pick which apps appear via Edit Widget.")
        .supportedFamilies([.systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

@available(iOS 16.2, *)
struct PushrActivityLiveWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PushrActivityAttributes.self) { context in
            // Lock screen / banner UI
            LockScreenView(
                attributes: context.attributes,
                state: context.state
            )
            .activityBackgroundTint(Color.black.opacity(0.25))
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        IconView(name: context.state.icon)
                            .font(.caption.bold())
                        if let name = context.attributes.name {
                            Text(name)
                                .font(.caption.bold())
                                .lineLimit(1)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let progress = context.state.progress {
                        Text(progressPercent(progress))
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        if let title = context.state.title {
                            Text(title)
                                .font(.headline)
                                .lineLimit(1)
                        }
                        if let status = context.state.status {
                            Text(status)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let progress = context.state.progress {
                        ProgressView(value: progress.clamped01())
                            .progressViewStyle(.linear)
                            .tint(.white)
                    }
                }
            } compactLeading: {
                IconView(name: context.state.icon)
                    .font(.caption.bold())
            } compactTrailing: {
                if let progress = context.state.progress {
                    Text(progressPercent(progress))
                        .font(.caption2.monospacedDigit())
                } else if let status = context.state.status {
                    Text(statusTag(status))
                        .font(.caption2.bold())
                        .lineLimit(1)
                }
            } minimal: {
                IconView(name: context.state.icon)
            }
            .keylineTint(.white)
        }
    }
}

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let attributes: PushrActivityAttributes
    let state: PushrActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                IconView(name: state.icon)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                if let name = attributes.name {
                    Text(name.uppercased())
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                        .tracking(0.8)
                }
                Spacer()
                if let progress = state.progress {
                    Text(progressPercent(progress))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            if let title = state.title {
                Text(title)
                    .font(.headline)
                    .lineLimit(2)
            }
            if let status = state.status {
                Text(status)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let progress = state.progress {
                ProgressView(value: progress.clamped01())
                    .progressViewStyle(.linear)
                    .tint(.white)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@available(iOS 16.2, *)
private struct IconView: View {
    let name: String?

    var body: some View {
        Image(systemName: name?.isEmpty == false ? name! : "bell.fill")
    }
}

private func progressPercent(_ value: Double) -> String {
    let clamped = value.clamped01()
    return "\(Int((clamped * 100).rounded()))%"
}

private func statusTag(_ value: String) -> String {
    // Dynamic Island compact has ~6-8 characters before truncation.
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return String(trimmed.prefix(8))
}

private extension Double {
    func clamped01() -> Double {
        return Swift.min(Swift.max(self, 0), 1)
    }
}
