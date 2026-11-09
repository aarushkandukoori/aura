import SwiftUI

extension View {
    /// Makes a badge pop (grow for a moment and settle) each time its number goes up, like the
    /// unread counts on Instagram's top bar.
    ///
    ///     Text("\(count)").popOnIncrease(count)
    func popOnIncrease(_ value: Int) -> some View {
        modifier(PopOnIncrease(value: value))
    }
}

private struct PopOnIncrease: ViewModifier {
    let value: Int

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pops = 0

    func body(content: Content) -> some View {
        content
            .keyframeAnimator(initialValue: 1.0, trigger: pops) { badge, scale in
                badge.scaleEffect(scale)
            } keyframes: { _ in
                SpringKeyframe(1.4, duration: 0.12, spring: .snappy)
                SpringKeyframe(1.0, duration: 0.36, spring: .init(response: 0.3, dampingRatio: 0.45))
            }
            .onChange(of: value) { old, new in
                if new > old && !reduceMotion { pops += 1 }
            }
    }
}
