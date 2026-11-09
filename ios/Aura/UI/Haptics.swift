import UIKit

/// Little taps you can feel. The store already plays them for likes, follows and saves.
@MainActor
enum Haptics {
    /// A light tap: buttons, toggles.
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// A light but crisp tap for a like, the way Instagram's like and double-tap feel.
    static func like() {
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.7)
    }

    /// A tick, for picking something (follow, tab, reaction).
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    /// Something good happened (posted, shared, a milestone).
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
