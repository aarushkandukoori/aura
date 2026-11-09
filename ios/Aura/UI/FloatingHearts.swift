import SwiftUI

/// Hearts that pop where you double-tapped a reel, like Instagram's: each one is tilted a little to a
/// random side, springs in, then floats up and fades. Quick double-taps leave a little trail of them.
///
///     @State private var hearts = FloatingHearts()
///     reel
///         .overlay { FloatingHeartsLayer(hearts: hearts) }
///         .onTapGesture(count: 2) { location in hearts.add(at: location) }
@Observable
@MainActor
final class FloatingHearts {
    struct Heart: Identifiable {
        let id = UUID()
        let point: CGPoint
        let tilt: Double // degrees
    }

    private(set) var hearts: [Heart] = []

    /// Adds a heart at `point` (in the layer's coordinates). It removes itself when it has faded.
    func add(at point: CGPoint) {
        let heart = Heart(point: point, tilt: .random(in: -25...25))
        hearts.append(heart)
        Task {
            try? await Task.sleep(for: .seconds(1.3))
            hearts.removeAll { $0.id == heart.id }
        }
    }
}

/// Draws the hearts of a FloatingHearts. Put it over the reel, the same size as the tap area.
struct FloatingHeartsLayer: View {
    let hearts: FloatingHearts
    var size: CGFloat = 104

    var body: some View {
        ZStack {
            ForEach(hearts.hearts) { heart in
                FloatingHeartView(tilt: heart.tilt, size: size)
                    .position(heart.point)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// One heart: pop in, hold, float up while fading. It plays once, as soon as it appears.
private struct FloatingHeartView: View {
    let tilt: Double
    let size: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Flips on appear, which plays the keyframes once.
    @State private var started = false

    private struct Values {
        var scale = 0.0
        var rise = 0.0
        var opacity = 1.0
    }

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: size))
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.25), radius: 10, y: 3)
            .rotationEffect(.degrees(tilt))
            .keyframeAnimator(initialValue: Values(), trigger: started) { heart, values in
                heart
                    .scaleEffect(values.scale)
                    .offset(y: values.rise)
                    .opacity(values.opacity)
            } keyframes: { _ in
                KeyframeTrack(\.scale) {
                    if reduceMotion {
                        LinearKeyframe(1, duration: 0.01)
                    } else {
                        SpringKeyframe(1.15, duration: 0.18, spring: .init(response: 0.2, dampingRatio: 0.55))
                        SpringKeyframe(1.0, duration: 0.14, spring: .snappy)
                        LinearKeyframe(1.0, duration: 0.2)
                        CubicKeyframe(0.85, duration: 0.5)
                    }
                }
                KeyframeTrack(\.rise) {
                    LinearKeyframe(0, duration: reduceMotion ? 1.0 : 0.5)
                    CubicKeyframe(reduceMotion ? 0 : -110, duration: 0.5)
                }
                KeyframeTrack(\.opacity) {
                    LinearKeyframe(1, duration: 0.6)
                    CubicKeyframe(0, duration: 0.4)
                }
            }
            .onAppear { started = true }
    }
}
