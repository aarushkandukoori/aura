import SwiftUI

/// The big white heart that pops in the middle of a photo when you double-tap it, like Instagram's:
/// it springs in with an overshoot, holds for a moment, then grows a little as it fades away.
/// Increase `trigger` to play it.
///
///     @State private var hearts = 0
///     media
///         .overlay { HeartBurst(trigger: hearts) }
///         .onTapGesture(count: 2) { hearts += 1; store.like(post.id) }
struct HeartBurst: View {
    let trigger: Int
    var size: CGFloat = 96

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Values {
        var scale = 0.0
        var opacity = 0.0
    }

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: size))
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.22), radius: 10, y: 3)
            .keyframeAnimator(initialValue: Values(), trigger: trigger) { heart, values in
                heart
                    .scaleEffect(values.scale)
                    .opacity(values.opacity)
            } keyframes: { _ in
                KeyframeTrack(\.scale) {
                    if reduceMotion {
                        // Reduce Motion: no growing, the heart just fades in and out.
                        LinearKeyframe(1, duration: 0.01)
                        LinearKeyframe(1, duration: 0.9)
                    } else {
                        SpringKeyframe(1.18, duration: 0.2, spring: .init(response: 0.22, dampingRatio: 0.55))
                        SpringKeyframe(1.0, duration: 0.14, spring: .snappy)
                        LinearKeyframe(1.0, duration: 0.32)          // hold
                        CubicKeyframe(1.3, duration: 0.24)           // grow as it fades
                    }
                }
                KeyframeTrack(\.opacity) {
                    LinearKeyframe(1, duration: 0.07)
                    LinearKeyframe(1, duration: 0.59)
                    CubicKeyframe(0, duration: 0.24)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
