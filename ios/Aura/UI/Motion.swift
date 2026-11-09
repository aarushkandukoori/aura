import SwiftUI

/// The app's motion, tuned to feel like Instagram on iOS: quick springs that settle fast, a little
/// overshoot on things that "pop" (hearts, badges), and no bounce on things that slide or page.
/// Every animation in the app picks one of these, so the whole app moves the same way.
///
///     withAnimation(Motion.pop) { showsBadge = true }
///     .animation(Motion.slide.orFade(reduceMotion), value: isVisible)
enum Motion {
    /// A quick spring with a visible overshoot: hearts, badges and reactions popping in.
    static let pop = Animation.spring(response: 0.32, dampingFraction: 0.58)
    /// Fast and settled, no bounce: paging, a story snapping back, rows moving.
    static let snap = Animation.spring(response: 0.3, dampingFraction: 0.92)
    /// A finger pressing a button down (and letting go).
    static let press = Animation.spring(response: 0.2, dampingFraction: 0.75)
    /// Bars, chips and rows sliding in or out.
    static let slide = Animation.spring(response: 0.42, dampingFraction: 0.86)
    /// The story viewer growing out of an avatar, or shrinking back into it.
    static let zoom = Animation.spring(response: 0.36, dampingFraction: 0.9)
    /// A plain cross-fade, used instead of movement when Reduce Motion is on.
    static let fade = Animation.easeInOut(duration: 0.22)
}

extension Animation {
    /// This animation, or a plain fade when the person has turned on Reduce Motion.
    ///
    ///     @Environment(\.accessibilityReduceMotion) private var reduceMotion
    ///     withAnimation(Motion.pop.orFade(reduceMotion)) { ... }
    func orFade(_ reduceMotion: Bool) -> Animation {
        reduceMotion ? Motion.fade : self
    }
}
