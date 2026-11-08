import SwiftUI

/// The big heart that pops over a photo when you double-tap it. Increase `trigger` to play it.
///
///     @State private var hearts = 0
///     media
///         .overlay { HeartBurst(trigger: hearts) }
///         .onTapGesture(count: 2) { hearts += 1; store.like(post.id) }
struct HeartBurst: View {
    let trigger: Int
    var size: CGFloat = 96

    private struct Values {
        var scale = 0.2
        var opacity = 0.0
        var lift = 0.0
    }

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: size))
            .foregroundStyle(.white)
            .shadow(color: Theme.like.opacity(0.55), radius: 18)
            .shadow(color: .black.opacity(0.18), radius: 6, y: 2)
            .keyframeAnimator(initialValue: Values(), trigger: trigger) { heart, values in
                heart
                    .scaleEffect(values.scale)
                    .opacity(values.opacity)
                    .offset(y: values.lift)
            } keyframes: { _ in
                KeyframeTrack(\.scale) {
                    SpringKeyframe(1.15, duration: 0.25, spring: .bouncy)
                    SpringKeyframe(0.95, duration: 0.12)
                    SpringKeyframe(1.0, duration: 0.35)
                    CubicKeyframe(0.6, duration: 0.2)
                }
                KeyframeTrack(\.opacity) {
                    LinearKeyframe(1, duration: 0.08)
                    LinearKeyframe(1, duration: 0.62)
                    LinearKeyframe(0, duration: 0.22)
                }
                KeyframeTrack(\.lift) {
                    LinearKeyframe(0, duration: 0.7)
                    CubicKeyframe(-40, duration: 0.22)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
