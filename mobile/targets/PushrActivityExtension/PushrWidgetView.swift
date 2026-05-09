import SwiftUI
import WidgetKit

/// Visual tokens mirrored from `lib/theme.ts`. The widget always renders
/// dark — iOS already darkens the wallpaper behind us, and the in-app
/// surface is dark-first. Accent is read from the snapshot so the widget
/// inherits whatever the user picked in Settings → Appearance.
@available(iOS 17.0, *)
private enum Token {
    static let bg = Color.black
    static let cell = Color(red: 28/255, green: 28/255, blue: 30/255)        // #1C1C1E
    static let cellHi = Color(red: 44/255, green: 44/255, blue: 46/255)      // #2C2C2E
    static let label = Color.white
    static let secondary = Color.white.opacity(0.60)
    static let tertiary = Color.white.opacity(0.30)
    static let separator = Color.white.opacity(0.07)
    static let chip = Color.white.opacity(0.08)
    static let success = Color(red: 48/255, green: 209/255, blue: 88/255)    // #30D158
    /// Brand blue from the splash background — keep the badge color glued
    /// to the actual logo color rather than the user's theme accent.
    static let brand = Color(red: 39/255, green: 142/255, blue: 232/255)     // #278EE8
}

@available(iOS 17.0, *)
struct PushrWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: PushrEntry

    var body: some View {
        switch family {
        case .systemLarge: FeedListView(entry: entry, maxRows: 8)
        default: FeedListView(entry: entry, maxRows: 3)
        }
    }
}

// MARK: - Feed list (Medium = 3 rows, Large = 7 rows)

@available(iOS 17.0, *)
private struct FeedListView: View {
    let entry: PushrEntry
    let maxRows: Int

    var body: some View {
        let sources = entry.configuration.sources ?? []
        let allowed = sources.map(\.id)
        let unread = entry.snapshot.filtered(allowedIds: allowed)
        let rows = Array(unread.prefix(maxRows))
        let accent = entry.snapshot.accentColor
        let isPlaceholder = entry.snapshot.updatedAt == 0

        VStack(alignment: .leading, spacing: 8) {
            HeaderBar(
                accent: accent,
                count: unread.count,
                filterLabel: filterShortLabel(sources),
                compact: false,
                skeleton: isPlaceholder
            )
            .padding(.horizontal, 4)

            if isPlaceholder {
                SkeletonCard(rows: maxRows)
            } else if rows.isEmpty {
                EmptyCard(compact: false)
            } else {
                GroupedList(rows: rows, snapshot: entry.snapshot, accent: accent)
            }
            Spacer(minLength: 0)
        }
        .unredacted()
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(Token.bg, for: .widget)
    }
}

@available(iOS 17.0, *)
private struct GroupedList: View {
    let rows: [Snapshot.Notif]
    let snapshot: Snapshot
    let accent: Color

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, item in
                Link(destination: URL(string: "pushr://feed?notif=\(item.id)")!) {
                    FeedRow(item: item, snapshot: snapshot, accent: accent)
                }
                if idx < rows.count - 1 {
                    Rectangle()
                        .fill(Token.separator)
                        .frame(height: 0.5)
                        .padding(.leading, 44) // align past the avatar
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Token.cell)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

@available(iOS 17.0, *)
private struct FeedRow: View {
    let item: Snapshot.Notif
    let snapshot: Snapshot
    let accent: Color

    var body: some View {
        let app = snapshot.app(for: item.sourceAppId)
        // Pick the most informative single body line: prefer the body when
        // we have a distinct title, otherwise the title (notifications
        // sometimes come with title-only or body-only). Keeps each row to
        // two text lines so all three rows + the header fit in the
        // Medium widget budget without iOS clipping.
        let primary = item.title.isEmpty ? item.body : item.title
        let secondary = item.title.isEmpty ? "" : item.body

        HStack(alignment: .top, spacing: 10) {
            AppAvatar(appId: item.sourceAppId, name: app?.name ?? "?", size: 28)
                .overlay(alignment: .topLeading) {
                    UnreadDot(accent: accent, ringColor: Token.cell)
                        .offset(x: -3, y: -3)
                }

            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(app?.name ?? "")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Token.secondary)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(relativeTime(from: item.createdAt))
                        .font(.system(size: 10, weight: .regular).monospacedDigit())
                        .foregroundStyle(Token.tertiary)
                }
                Text(primary.isEmpty ? secondary : primary)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Token.label)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Header

@available(iOS 17.0, *)
private struct HeaderBar: View {
    let accent: Color
    let count: Int
    let filterLabel: String?
    let compact: Bool
    var skeleton: Bool = false

    var body: some View {
        HStack(spacing: 6) {
            // Brand mark stays solid even in skeleton mode — it's the
            // moment of "yes, this is pushr loading" and gives the user
            // something to anchor on. The text bars next to it become
            // grey rectangles while we wait for the snapshot.
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(Token.brand)
                .frame(width: 20, height: 20)
                .overlay(
                    Image("SplashIcon")
                        .resizable()
                        .renderingMode(.original)
                        .scaledToFit()
                        .padding(3)
                )

            if skeleton {
                SkeletonBar(width: 38, height: 9)
                if !compact {
                    SkeletonBar(width: 52, height: 8)
                        .opacity(0.7)
                }
                Spacer(minLength: 4)
                SkeletonBar(width: 22, height: 14, cornerRadius: 7)
            } else {
                Text("pushr")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Token.label)
                    .tracking(0.4)

                if !compact {
                    Text("·")
                        .font(.system(size: 11))
                        .foregroundStyle(Token.tertiary)
                    if let filterLabel {
                        Text(filterLabel)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(Token.secondary)
                            .lineLimit(1)
                    } else {
                        Text("All apps")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(Token.tertiary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 4)

                CountChip(count: count, accent: accent)
            }
        }
    }
}

@available(iOS 17.0, *)
private struct CountChip: View {
    let count: Int
    let accent: Color

    var body: some View {
        let label = count > 99 ? "99+" : "\(count)"
        let isActive = count > 0
        Text(label)
            .font(.system(size: 10, weight: .bold).monospacedDigit())
            .foregroundStyle(isActive ? Color.white : Token.secondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(
                Capsule().fill(isActive ? accent : Token.chip)
            )
    }
}

// MARK: - Skeleton

/// Shown while the snapshot is still being read (`updatedAt == 0`). Mirrors
/// the real layout structure so the transition into real content is a
/// content-fill rather than a layout shift.
@available(iOS 17.0, *)
private struct SkeletonCard: View {
    let rows: Int

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<rows, id: \.self) { idx in
                SkeletonRow()
                if idx < rows - 1 {
                    Rectangle()
                        .fill(Token.separator)
                        .frame(height: 0.5)
                        .padding(.leading, 50)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: rows == 1 ? .infinity : nil, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Token.cell)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

@available(iOS 17.0, *)
private struct SkeletonRow: View {
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Token.cellHi)
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    SkeletonBar(width: 60, height: 9)
                    Spacer(minLength: 4)
                    SkeletonBar(width: 22, height: 8)
                        .opacity(0.7)
                }
                SkeletonBar(width: nil, height: 11)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@available(iOS 17.0, *)
private struct SkeletonBar: View {
    var width: CGFloat? = nil
    var height: CGFloat = 10
    var cornerRadius: CGFloat = 4

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Token.cellHi)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
    }
}

// MARK: - Empty state

@available(iOS 17.0, *)
private struct EmptyCard: View {
    let compact: Bool

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: compact ? 22 : 26, weight: .regular))
                .foregroundStyle(Token.success)
            Text("All caught up")
                .font(.system(size: compact ? 11 : 12, weight: .semibold))
                .foregroundStyle(Token.label)
            if !compact {
                Text("New pushes show up here.")
                    .font(.system(size: 10))
                    .foregroundStyle(Token.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Token.cell)
        )
    }
}

// MARK: - Avatar

@available(iOS 17.0, *)
private struct AppAvatar: View {
    let appId: String
    let name: String
    let size: CGFloat

    var body: some View {
        // Try the disk-cached logo first (mirrored in by the widget-data
        // bridge). Falls back to a coloured initials badge while the
        // download is in flight or if it failed.
        Group {
            if let uiImage = Snapshot.logoImage(for: appId) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                InitialBadge(name: name)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
    }
}

@available(iOS 17.0, *)
private struct InitialBadge: View {
    let name: String

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Token.cellHi, Token.cell],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Text(initial(for: name))
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Token.label)
        }
    }

    private func initial(for name: String) -> String {
        guard let c = name.trimmingCharacters(in: .whitespaces).first else { return "?" }
        return String(c).uppercased()
    }
}

@available(iOS 17.0, *)
private struct UnreadDot: View {
    let accent: Color
    let ringColor: Color

    var body: some View {
        Circle()
            .fill(accent)
            .frame(width: 9, height: 9)
            .overlay(
                Circle().stroke(ringColor, lineWidth: 2)
            )
    }
}

// MARK: - Helpers

@available(iOS 17.0, *)
private func filterShortLabel(_ sources: [SourceAppEntity]) -> String? {
    if sources.isEmpty { return nil }
    if sources.count == 1 { return sources[0].name }
    return "\(sources.count) apps"
}

/// Compact, widget-friendly relative-time formatter. We avoid SwiftUI's
/// `Text(_:style:)` countdown variants because the widget can sit on the
/// home screen for hours; static tokens render predictably and don't keep
/// re-evaluating.
@available(iOS 17.0, *)
private func relativeTime(from msSinceEpoch: Double) -> String {
    let date = Date(timeIntervalSince1970: msSinceEpoch / 1000)
    let delta = max(0, Date().timeIntervalSince(date))
    let m = Int(delta / 60)
    if m < 1 { return "now" }
    if m < 60 { return "\(m)m" }
    let h = m / 60
    if h < 24 { return "\(h)h" }
    let d = h / 24
    if d < 7 { return "\(d)d" }
    let w = d / 7
    return "\(w)w"
}
