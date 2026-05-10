import AppIntents
import WidgetKit

/// AppEntity that represents one of the user's source apps. Used as the
/// element type of the widget's multi-select picker.
///
/// Identity is the Convex `Id<"sourceApps">` string. Suggested entities are
/// pulled from the App Group snapshot, so as soon as the RN app has run
/// once the picker shows the user's actual apps with names.
@available(iOS 17.0, *)
struct SourceAppEntity: AppEntity, Identifiable, Hashable {
  let id: String
  let name: String
  let logoUrl: String?

  static var typeDisplayRepresentation: TypeDisplayRepresentation {
    TypeDisplayRepresentation(name: "Source App")
  }

  static var defaultQuery = SourceAppQuery()

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

@available(iOS 17.0, *)
struct SourceAppQuery: EntityQuery {
  func entities(for identifiers: [SourceAppEntity.ID]) async throws -> [SourceAppEntity] {
    let snap = Snapshot.read()
    // Duplicate-tolerant init — `Dictionary(uniqueKeysWithValues:)`
    // crashes on duplicates, which would tear down the configuration
    // resolution and pin the widget on the placeholder screen.
    let byId = Dictionary(
      snap.sourceApps.map { ($0.id, $0) },
      uniquingKeysWith: { first, _ in first }
    )
    return identifiers.compactMap { id in
      guard let app = byId[id] else { return nil }
      return SourceAppEntity(id: app.id, name: app.name, logoUrl: app.logoUrl)
    }
  }

  func suggestedEntities() async throws -> [SourceAppEntity] {
    Snapshot.read().sourceApps.map {
      SourceAppEntity(id: $0.id, name: $0.name, logoUrl: $0.logoUrl)
    }
  }
}

/// Configuration intent surfaced to the user via long-press → "Edit Widget".
/// `sources` is an *optional* array — Apple's recommended shape for "leave
/// empty = show all". An empty concrete `[]` can be interpreted by iOS as
/// "the user still needs to configure this", which has been observed to
/// pin the Small widget on its placeholder screen indefinitely while the
/// Medium happily renders.
@available(iOS 17.0, *)
struct PushrWidgetIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "pushr feed"
  static var description = IntentDescription(
    "Pick which apps appear in the widget. Leave empty to see them all."
  )

  @Parameter(title: "Apps")
  var sources: [SourceAppEntity]?

  init() {}
  init(sources: [SourceAppEntity]?) {
    self.sources = sources
  }
}
