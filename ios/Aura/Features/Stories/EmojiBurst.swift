import SwiftUI

/// A quick reaction flying out over a story, like Instagram's: the emoji pops big in the middle while
/// a handful of small copies float up around it and fade. It plays once, as soon as it appears
/// (give it a new `.id` to play it again).
struct EmojiBurst: View {
    let emoji: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The small copies, each with its own path, size, tilt and start time (picked once).
    @State private var sparks = (0..<9).map { _ in Spark.random() }

    var body: some View {
        ZStack {
            if !reduceMotion {
                ForEach(sparks) { spark in
                    SparkView(emoji: emoji, spark: spark)
                }
            }
            BigEmoji(emoji: emoji, reduceMotion: reduceMotion)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Where one small copy goes.
private struct Spark: Identifiable {
    let id = UUID()
    let drift: CGFloat   // sideways, in points
    let rise: CGFloat    // upwards, in points
    let size: CGFloat
    let spin: Double     // degrees by the end
    let delay: Double    // seconds before it starts

    static func random() -> Spark {
        Spark(drift: .random(in: -150...150), rise: .random(in: 180...420), size: .random(in: 28...46),
              spin: .random(in: -40...40), delay: .random(in: 0...0.18))
    }
}

/// One small copy: it pops out of the middle and drifts up while fading.
private struct SparkView: View {
    let emoji: String
    let spark: Spark

    /// Flips on appear, which plays the keyframes once.
    @State private var started = false

    private struct Values {
        var travel = 0.0
        var scale = 0.3
        var opacity = 0.0
    }

    var body: some View {
        Text(emoji)
            .font(.system(size: spark.size))
            .keyframeAnimator(initialValue: Values(), trigger: started) { view, values in
                view
                    .scaleEffect(values.scale)
                    .rotationEffect(.degrees(spark.spin * values.travel))
                    .offset(x: spark.drift * values.travel, y: -spark.rise * values.travel)
                    .opacity(values.opacity)
            } keyframes: { _ in
                KeyframeTrack(\.travel) {
                    LinearKeyframe(0, duration: spark.delay)
                    CubicKeyframe(1, duration: 1.05)
                }
                KeyframeTrack(\.scale) {
                    LinearKeyframe(0.3, duration: spark.delay)
                    SpringKeyframe(1, duration: 0.3, spring: .snappy)
                }
                KeyframeTrack(\.opacity) {
                    LinearKeyframe(0, duration: spark.delay)
                    LinearKeyframe(1, duration: 0.08)
                    LinearKeyframe(1, duration: 0.5)
                    CubicKeyframe(0, duration: 0.45)
                }
            }
            .onAppear { started = true }
    }
}

/// The big emoji in the middle: pops in with an overshoot, holds, then shrinks a little and fades.
private struct BigEmoji: View {
    let emoji: String
    let reduceMotion: Bool

    /// Flips on appear, which plays the keyframes once.
    @State private var started = false

    private struct Values {
        var scale = 0.2
        var opacity = 0.0
    }

    var body: some View {
        Text(emoji)
            .font(.system(size: 110))
            .shadow(color: .black.opacity(0.25), radius: 12)
            .keyframeAnimator(initialValue: Values(), trigger: started) { view, values in
                view
                    .scaleEffect(values.scale)
                    .opacity(values.opacity)
            } keyframes: { _ in
                KeyframeTrack(\.scale) {
                    if reduceMotion {
                        LinearKeyframe(1, duration: 0.01)
                    } else {
                        SpringKeyframe(1.25, duration: 0.22, spring: .init(response: 0.24, dampingRatio: 0.55))
                        SpringKeyframe(1.0, duration: 0.16, spring: .snappy)
                        LinearKeyframe(1.0, duration: 0.45)
                        CubicKeyframe(0.85, duration: 0.3)
                    }
                }
                KeyframeTrack(\.opacity) {
                    LinearKeyframe(1, duration: 0.08)
                    LinearKeyframe(1, duration: 0.8)
                    CubicKeyframe(0, duration: 0.3)
                }
            }
            .onAppear { started = true }
    }
}
