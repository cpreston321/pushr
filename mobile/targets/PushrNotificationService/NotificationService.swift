import Intents
import UserNotifications
import os.log

#if canImport(UIKit)
import UIKit
#endif

/// Notification Service Extension for pushr.
///
/// Runs in a tiny separate process before the OS displays a remote push,
/// giving us a chance to mutate the payload. We do two things:
///
///   1. **Communication Notifications (iOS 15+).** Replace the default app
///      icon on the lockscreen banner with the source app's logo (or fall
///      back to the app icon when no logo is set). Achieved via
///      `INSendMessageIntent` + `request.content.updating(from: intent)` —
///      the standard iOS Messages-style avatar surface. The push payload
///      carries `data.logoUrl` and `data.sourceAppName` (set by
///      `convex/expoPush.ts`).
///
///   2. **Category rewrite.** Pick the right pre-registered notification
///      category (`pushr.acts.1` … `pushr.acts.4`, plus reply variants)
///      based on the number of `data.actions` so the lockscreen banner
///      shows the correct number of action buttons.
///
/// Communication Notifications require the
/// `com.apple.developer.usernotifications.communication` entitlement on the
/// main app target AND `IntentsSupported = [INSendMessageIntent]` inside
/// `NSExtensionAttributes` in this NSE's Info.plist. Without either,
/// `intent.updating(from:)` throws and we fall back gracefully to the
/// unmodified content.
///
/// To see the NSE's logs while debugging:
///   Console.app → connect device → filter "subsystem:dev.cpreston.pushr.NSE"
class NotificationService: UNNotificationServiceExtension {
    private static let log = OSLog(subsystem: "dev.cpreston.pushr.NSE", category: "service")

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttempt: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        let userInfo = request.content.userInfo
        os_log(.info, log: Self.log, "didReceive — userInfo keys: %{public}@",
               String(describing: Array(userInfo.keys)))
        // Dump the full payload so we can see how Expo nested it.
        if let json = try? JSONSerialization.data(withJSONObject: userInfo, options: [.fragmentsAllowed]),
           let s = String(data: json, encoding: .utf8) {
            os_log(.info, log: Self.log, "userInfo: %{public}@", s)
        }
        self.contentHandler = contentHandler
        guard let mutable = request.content.mutableCopy() as? UNMutableNotificationContent else {
            os_log(.error, log: Self.log, "mutableCopy failed — passing through")
            contentHandler(request.content)
            return
        }
        self.bestAttempt = mutable

        rewriteCategoryIdentifier(mutable)
        applyCommunicationAvatar(mutable)
    }

    override func serviceExtensionTimeWillExpire() {
        os_log(.error, log: Self.log, "serviceExtensionTimeWillExpire — handing back partial content")
        if let attempt = bestAttempt, let handler = contentHandler {
            handler(attempt)
        }
    }

    // MARK: - Category rewrite

    private func rewriteCategoryIdentifier(_ content: UNMutableNotificationContent) {
        let bag = Self.flattenPayload(content.userInfo)
        let actions = (bag["actions"] as? [[String: Any]]) ?? []
        if actions.isEmpty { return }

        let hasReply = actions.contains { ($0["kind"] as? String) == "reply" }
        let nonReplyCount = actions.filter { ($0["kind"] as? String) != "reply" }.count

        let category: String
        if hasReply {
            category = nonReplyCount == 0
                ? "pushr.acts.reply"
                : "pushr.acts.reply.\(min(nonReplyCount, 3))"
        } else {
            category = "pushr.acts.\(min(nonReplyCount, 4))"
        }
        os_log(.info, log: Self.log, "categoryIdentifier %{public}@ → %{public}@",
               content.categoryIdentifier, category)
        content.categoryIdentifier = category
    }

    // MARK: - Communication Notification (per-source-app avatar)

    /// Always apply the Communication transformation. If a `data.logoUrl` is
    /// present, fetch it as the sender avatar; otherwise apply the intent
    /// without an image so iOS at least uses the Communication style (with
    /// the app icon as the implicit avatar).
    private func applyCommunicationAvatar(_ content: UNMutableNotificationContent) {
        guard #available(iOS 15.0, *) else {
            os_log(.info, log: Self.log, "iOS < 15 — skipping intent transform")
            finish(content)
            return
        }

        let userInfo = content.userInfo
        let bag = Self.flattenPayload(userInfo)

        let logoUrlString = bag["logoUrl"] as? String
        let sourceAppName = (bag["sourceAppName"] as? String) ?? "pushr"
        let sourceAppId = (bag["sourceAppId"] as? String) ?? sourceAppName

        os_log(.info, log: Self.log,
               "comm-notif: name=%{public}@ id=%{public}@ logoUrl=%{public}@",
               sourceAppName, sourceAppId, logoUrlString ?? "<nil>")

        guard let logoUrlString = logoUrlString,
              let logoUrl = URL(string: logoUrlString) else {
            // No logo URL — still apply Communication style with no avatar so
            // the notification gets the right layout.
            donateAndUpdate(
                content: content,
                senderName: sourceAppName,
                senderId: sourceAppId,
                avatar: nil
            )
            return
        }

        downloadImage(from: logoUrl) { [weak self] image in
            guard let self = self else { return }
            os_log(.info, log: Self.log, "logo download → %{public}@",
                   image == nil ? "FAILED" : "ok")
            self.donateAndUpdate(
                content: content,
                senderName: sourceAppName,
                senderId: sourceAppId,
                avatar: image
            )
        }
    }

    @available(iOS 15.0, *)
    private func donateAndUpdate(
        content: UNMutableNotificationContent,
        senderName: String,
        senderId: String,
        avatar: INImage?
    ) {
        // Layout strategy:
        //   - speakableGroupName = original title  → top large header
        //   - sender.displayName = app name        → "appName: body" line
        //   - intent.content     = original body
        //   - sender.image       = app logo        → avatar (next to app name)
        //
        // The avatar stays attached to the app name (the actual sender) — the
        // title sits at the top as the conversation header. When the caller
        // didn't pass a title (or it duplicates the app name), drop the group
        // header and fall back to a 1:1 layout with the app as sender. That
        // avoids the "RPH \n RPH" duplication when both slots carry the same
        // string.
        let originalTitle = content.title
        let useTitleAsHeader =
            !originalTitle.isEmpty && originalTitle != senderName

        let speakableGroup: INSpeakableString? =
            useTitleAsHeader ? INSpeakableString(spokenPhrase: originalTitle) : nil
        let senderDisplayName = senderName

        let senderHandle = INPersonHandle(value: senderId, type: .unknown)
        let sender = INPerson(
            personHandle: senderHandle,
            nameComponents: nil,
            displayName: senderDisplayName,
            image: avatar,
            contactIdentifier: nil,
            customIdentifier: senderId
        )
        let me = INPerson(
            personHandle: INPersonHandle(value: "me", type: .unknown),
            nameComponents: nil,
            displayName: nil,
            image: nil,
            contactIdentifier: nil,
            customIdentifier: nil
        )

        let intent = INSendMessageIntent(
            recipients: [me],
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: speakableGroup,
            conversationIdentifier: senderId,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )
        if let avatar = avatar {
            intent.setImage(avatar, forParameterNamed: \.sender)
        }

        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate { error in
            if let error = error {
                os_log(.error, log: Self.log,
                       "donate failed: %{public}@", String(describing: error))
            }
        }

        do {
            let updated = try content.updating(from: intent)
            os_log(.info, log: Self.log, "updating(from: intent) ok — finishing")
            finish(updated)
        } catch {
            os_log(.error, log: Self.log,
                   "updating(from: intent) THREW — likely missing entitlement: %{public}@",
                   String(describing: error))
            finish(content)
        }
    }

    // MARK: - Helpers

    private func finish(_ content: UNNotificationContent) {
        if let handler = contentHandler {
            handler(content)
            contentHandler = nil
        }
    }

    /// Walk the userInfo and merge every nested `data` dict (Expo nests under
    /// `userInfo["body"]` as a JSON-encoded STRING; legacy callers nest under
    /// `userInfo["data"]`; some flows put fields top-level). Returns a flat
    /// bag of fields with later layers winning.
    private static func flattenPayload(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
        var out: [String: Any] = [:]

        func merge(_ dict: [String: Any]) {
            for (k, v) in dict { out[k] = v }
        }

        // 1. Top-level keys (string-coerced)
        for (k, v) in userInfo {
            if let key = k as? String { out[key] = v }
        }

        // 2. userInfo["data"] if present
        if let nested = userInfo["data"] as? [String: Any] {
            merge(nested)
        }

        // 3. userInfo["body"] — Expo's serialization. Can be a dict OR a
        //    JSON-encoded string of a dict.
        if let bodyDict = userInfo["body"] as? [String: Any] {
            merge(bodyDict)
            if let nestedData = bodyDict["data"] as? [String: Any] {
                merge(nestedData)
            }
        } else if let bodyString = userInfo["body"] as? String,
                  let bodyData = bodyString.data(using: .utf8),
                  let parsed = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any] {
            merge(parsed)
            if let nestedData = parsed["data"] as? [String: Any] {
                merge(nestedData)
            }
        }

        return out
    }

    private func downloadImage(from url: URL, completion: @escaping (INImage?) -> Void) {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 5
        config.timeoutIntervalForResource = 10
        let session = URLSession(configuration: config)
        let task = session.dataTask(with: url) { data, _, error in
            if let error = error {
                os_log(.error, log: Self.log, "download error: %{public}@",
                       String(describing: error))
            }
            if let data = data, !data.isEmpty {
                completion(INImage(imageData: data))
            } else {
                completion(nil)
            }
        }
        task.resume()
    }
}
