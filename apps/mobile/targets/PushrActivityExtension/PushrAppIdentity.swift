import SwiftUI

/// Swift port of `apps/mobile/lib/appColor.ts`.
///
/// A source app with no uploaded logo is drawn as a monogram on its own
/// identity gradient, and that gradient comes from a hash of the app's id. The
/// widget has to derive it identically to the app — the same icon changing
/// color depending on where you look at it would read as a bug, not a theme.
///
/// Keep this in lockstep with `lib/appColor.ts`: the palette order matters (the
/// hash indexes into it), and so does the hash's exact arithmetic.
enum AppIdentity {
    /// Same list, same order as `APP_COLORS` in `lib/appColor.ts`.
    private static let palette: [String] = [
        "#17B8A0", // teal
        "#3E7BFA", // blue
        "#C9A24A", // gold
        "#C15CF0", // orchid
        "#2FB566", // green
        "#F0355A", // rose
        "#6558F5", // indigo
        "#E0763B", // ember
        "#4CA5E8", // sky
        "#D4499B"  // magenta
    ]

    struct Identity {
        /// Light end of the gradient (the app's `appGradient()[0]`).
        let from: Color
        /// Dark end — also what the monogram's contrast is judged against.
        let to: Color
        /// Monogram color: ink on the pale hues, white on the rest.
        let label: Color
    }

    /// Stable base color for an app, keyed on its id.
    ///
    /// FNV-1a, in the same wrapping 32-bit signed arithmetic JavaScript gives
    /// via `Math.imul` and `^=` on a Number. Two details are load-bearing:
    /// the hash walks UTF-16 code units (JS `charCodeAt`), and the final
    /// modulo is taken on the *widened* value — `abs(Int32.min)` traps in
    /// Swift, where JS's `Math.abs` just returns 2147483648.
    static func base(for key: String) -> String {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let seed = trimmed.isEmpty ? "?" : trimmed
        var hash = Int32(bitPattern: 0x811c_9dc5)
        for unit in seed.utf16 {
            hash ^= Int32(unit)
            hash = hash &* 0x0100_0193
        }
        return palette[abs(Int(hash)) % palette.count]
    }

    /// The gradient and monogram color for an app — `appGradient()` plus
    /// `readableOn()` from `lib/color.ts`.
    static func identity(for key: String) -> Identity {
        let rgb = parse(base(for: key))
        let from = mix(rgb, 0.9, RGB(r: 255, g: 255, b: 255))
        let to = mix(rgb, 0.78, RGB(r: 0, g: 0, b: 0))
        return Identity(
            from: color(from),
            to: color(to),
            // `readableOn(to)`: the app judges contrast against the dark end,
            // which is what sits under most of the glyph.
            label: luminance(to) > 0.62
                ? color(RGB(r: 20, g: 22, b: 26)) // #14161A
                : .white
        )
    }

    /// One- or two-letter monogram — `monogram()` in `lib/appColor.ts`.
    static func monogram(_ name: String) -> String {
        let words = name.split(whereSeparator: { $0.isWhitespace })
        guard let first = words.first else { return "?" }
        if words.count == 1 { return String(first.prefix(2)).uppercased() }
        let last = words[words.count - 1]
        return "\(first.prefix(1))\(last.prefix(1))".uppercased()
    }

    // MARK: - Color math (`lib/color.ts`)

    private struct RGB {
        var r: Double
        var g: Double
        var b: Double
    }

    private static func parse(_ hex: String) -> RGB {
        let raw = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        let value = UInt32(raw.prefix(6), radix: 16) ?? 0
        return RGB(
            r: Double((value >> 16) & 255),
            g: Double((value >> 8) & 255),
            b: Double(value & 255)
        )
    }

    /// Opaque blend of `color` over `base` — `mix()`, with `amount` 0–1.
    private static func mix(_ color: RGB, _ amount: Double, _ base: RGB) -> RGB {
        let t = min(max(amount, 0), 1)
        return RGB(
            r: color.r * t + base.r * (1 - t),
            g: color.g * t + base.g * (1 - t),
            b: color.b * t + base.b * (1 - t)
        )
    }

    /// Perceived luminance, 0–1. The app's own NTSC weighting, not WCAG's —
    /// mirrored so the ink/white flip happens on exactly the same hues.
    private static func luminance(_ c: RGB) -> Double {
        (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255
    }

    private static func color(_ c: RGB) -> Color {
        Color(red: c.r / 255, green: c.g / 255, blue: c.b / 255)
    }
}
