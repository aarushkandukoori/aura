import SwiftUI
import UIKit

/// Aura's colors (SPEC section 9). Each one switches between its light and dark value by itself.
///
///     Text(name).foregroundStyle(Theme.text)
///     Text(time).foregroundStyle(Theme.muted)
///     Rectangle().fill(Theme.surface)
enum Theme {
    // MARK: Brand

    /// Buttons, links, my chat bubbles.
    static let accent = Color(hex: 0x6E56F8)
    static let accentPressed = Color(hex: 0x5B43EA)
    /// The like heart.
    static let like = Color(hex: 0xFF3D6E)

    // MARK: Surfaces and text

    static let background = Color(light: 0xFFFFFF, dark: 0x0B0B0F)
    /// Cards, inputs, skeletons.
    static let surface = Color(light: 0xF7F7F8, dark: 0x15151B)
    /// Secondary buttons ("Following", "Message", "Edit profile").
    static let secondaryFill = Color(light: 0xEFEFF2, dark: 0x262630)
    /// Dividers and outlines.
    static let border = Color(light: 0xE7E7EA, dark: 0x272730)
    static let text = Color(light: 0x0E0E11, dark: 0xF4F4F6)
    /// Secondary text: times, counts, hints.
    static let muted = Color(light: 0x6B6B76, dark: 0x9E9EAB)
    /// The flat ring around a story you've already seen.
    static let seenRing = Color(light: 0xD3D3DA, dark: 0x3A3A45)

    // MARK: The aura gradient

    static let aura1 = Color(hex: 0x9B7BFF) // violet
    static let aura2 = Color(hex: 0xFF7EC7) // pink
    static let aura3 = Color(hex: 0xFFC36B) // gold
    static let aura4 = Color(hex: 0x5CE1B5) // mint
    static let aura5 = Color(hex: 0x5BB8FF) // sky
    static let auraColors = [aura1, aura2, aura3, aura4, aura5]

    /// Wordmark, celebrations, highlights.
    static let auraGradient = LinearGradient(colors: [aura1, aura2, aura3], startPoint: .leading, endPoint: .trailing)

    /// The story ring: a full loop through every aura color. The web's conic gradient starts at
    /// 200° from the top; SwiftUI counts from 3 o'clock, so that is 110° here.
    static let ringGradient = AngularGradient(colors: [aura1, aura2, aura3, aura4, aura5, aura1],
                                              center: .center, angle: .degrees(110))
}

extension Color {
    /// A color from a hex number: `Color(hex: 0x6E56F8)`.
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }

    /// A color with one value for light mode and one for dark mode.
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(Color(hex: traits.userInterfaceStyle == .dark ? dark : light))
        })
    }

    /// Reads a CSS color like the story overlays use: "#fff", "#ffffff", "#ffffffcc",
    /// "rgb(255, 255, 255)" or "rgba(0, 0, 0, 0.45)". Returns nil for anything else.
    init?(css: String?) {
        guard let css = css?.trimmingCharacters(in: .whitespaces).lowercased(), !css.isEmpty else { return nil }
        if css.hasPrefix("#") {
            var hex = String(css.dropFirst())
            if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() } // #abc -> #aabbcc
            guard hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else { return nil }
            let rgb = hex.count == 8 ? UInt32(value >> 8) : UInt32(value)
            let alpha = hex.count == 8 ? Double(value & 0xFF) / 255 : 1
            self.init(hex: rgb, opacity: alpha)
            return
        }
        if css.hasPrefix("rgb"), let open = css.firstIndex(of: "("), let close = css.lastIndex(of: ")") {
            let numbers = css[css.index(after: open)..<close]
                .split(separator: ",")
                .compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            guard numbers.count >= 3 else { return nil }
            self.init(.sRGB, red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255,
                      opacity: numbers.count > 3 ? numbers[3] : 1)
            return
        }
        return nil
    }
}
