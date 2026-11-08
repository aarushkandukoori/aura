import SwiftUI

/// The interests people can pick in onboarding and Edit profile. The words are the ones the server's
/// interest matcher knows (server/repo/interests.ts), so Explore topics and the characters understand them.
enum InterestCatalog {
    static let all: [String] = [
        "music", "food", "fitness", "fashion", "travel", "art", "photography", "gaming", "books", "movies",
        "pets", "sports", "nature", "outdoors", "tech", "coffee", "dance", "comedy", "beauty", "cooking",
    ]

    private static let emojis: [String: String] = [
        "music": "🎧", "food": "🍜", "fitness": "💪", "fashion": "👗", "travel": "✈️", "art": "🎨",
        "photography": "📸", "gaming": "🎮", "books": "📚", "movies": "🎬", "pets": "🐾", "sports": "🏀",
        "nature": "🌿", "outdoors": "🏕️", "tech": "💻", "coffee": "☕", "dance": "💃", "comedy": "😂",
        "beauty": "💄", "cooking": "🍳",
    ]

    /// "🎧 music" (interests not in the list get a sparkle).
    static func label(_ interest: String) -> String {
        "\(emojis[interest.lowercased()] ?? "✨") \(interest)"
    }
}

/// Wrapping chips to pick interests. Tapping a chip adds or removes it (the server allows up to 12).
struct InterestPicker: View {
    @Binding var selection: [String]

    static let maximum = 12

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(choices, id: \.self) { interest in
                Button { toggle(interest) } label: {
                    ChipLabel(title: InterestCatalog.label(interest), isSelected: selection.contains(interest))
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// The catalog, plus anything already picked that isn't in it (so nothing silently disappears).
    private var choices: [String] {
        InterestCatalog.all + selection.filter { !InterestCatalog.all.contains($0) }
    }

    private func toggle(_ interest: String) {
        Haptics.selection()
        if let index = selection.firstIndex(of: interest) {
            selection.remove(at: index)
        } else if selection.count < Self.maximum {
            selection.append(interest)
        }
    }
}

/// Aura usernames: 3-24 lowercase letters, numbers, dots and underscores (the server checks the same rule).
enum UsernameRules {
    static let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789._")

    /// What the username field keeps as you type: lowercase, allowed characters only, at most 24.
    static func clean(_ text: String) -> String {
        String(text.lowercased().filter { allowed.contains($0) }.prefix(24))
    }

    /// nil when the username is fine, otherwise what is wrong in plain words.
    static func problem(with username: String) -> String? {
        if username.isEmpty { return "Pick a username" }
        if username.count < 3 { return "Usernames need at least 3 characters" }
        if username.count > 24 { return "Usernames can have at most 24 characters" }
        if username.contains(where: { !allowed.contains($0) }) {
            return "Only lowercase letters, numbers, dots and underscores"
        }
        return nil
    }

    /// A username made from a name: "José Martínez" -> "jose.martinez".
    static func suggestion(from name: String) -> String {
        let plain = name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        let words = plain.lowercased().split { !$0.isLetter && !$0.isNumber }
        return clean(words.joined(separator: "."))
    }
}
