import SwiftUI

/// An icon that pops when it turns on: the like heart filling red, the bookmark filling in. Turning it
/// off goes straight back to the outline, the way Instagram's like and save buttons behave.
///
///     PoppingIcon(symbol: "heart", isOn: post.likedByMe, onColor: Theme.like)          // like
///     PoppingIcon(symbol: "bookmark", isOn: post.savedByMe, size: 21)                 // save
///
/// Put it in a Button with `.buttonStyle(.squash)` so it also squashes while the finger is down.
struct PoppingIcon: View {
    /// The outline symbol; ".fill" is added while it's on.
    let symbol: String
    let isOn: Bool
    var size: CGFloat = 22
    var onColor: Color = Theme.text
    var offColor: Color = Theme.text

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pops = 0

    var body: some View {
        Image(systemName: isOn ? symbol + ".fill" : symbol)
            .font(.system(size: size))
            .foregroundStyle(isOn ? onColor : offColor)
            .keyframeAnimator(initialValue: 1.0, trigger: pops) { icon, scale in
                icon.scaleEffect(scale)
            } keyframes: { _ in
                // A quick overshoot, then it settles with a little wobble.
                SpringKeyframe(1.28, duration: 0.13, spring: .snappy)
                SpringKeyframe(1.0, duration: 0.32, spring: .init(response: 0.3, dampingRatio: 0.5))
            }
            .onChange(of: isOn) { _, on in
                if on && !reduceMotion { pops += 1 }
            }
    }
}

/// Buttons that squash a little under the finger and spring back when let go (like, save, send).
///
///     Button { ... } label: { PoppingIcon(...) }
///         .buttonStyle(.squash)
struct SquashButtonStyle: ButtonStyle {
    var pressedScale: CGFloat = 0.82

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? pressedScale : 1)
            .animation(Motion.press, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == SquashButtonStyle {
    static var squash: SquashButtonStyle { SquashButtonStyle() }
}
