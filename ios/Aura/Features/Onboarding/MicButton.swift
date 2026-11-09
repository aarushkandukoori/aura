import SwiftUI

/// The big round mic for "Tell us about your world": a ring around it fills up over the minute of
/// talking, soft aura rings ripple out while it listens, and the button swells a little with the voice.
struct MicButton: View {
    let isListening: Bool
    /// How much of the minute is used, 0...1.
    let progress: Double
    /// How loud the voice is right now, 0...1.
    let level: Double
    let isDisabled: Bool
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let ringSize: CGFloat = 136
    private let buttonSize: CGFloat = 108

    /// The aura colors in order around the ring, starting where it starts filling (the top, once
    /// the ring is turned a quarter back), so the fill goes violet, pink, gold, mint, sky.
    private static let minuteGradient = AngularGradient(colors: Theme.auraColors + [Theme.aura1], center: .center,
                                                        startAngle: .degrees(0), endAngle: .degrees(360))

    var body: some View {
        ZStack {
            if isListening && !reduceMotion {
                Ripples(size: buttonSize)
                    .transition(.opacity)
            }

            // The minute: a gray track with the aura gradient filling it clockwise from the top.
            Circle()
                .stroke(Theme.border, lineWidth: 5)
                .frame(width: ringSize, height: ringSize)
            Circle()
                .trim(from: 0, to: min(1, progress))
                .stroke(Self.minuteGradient, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: ringSize, height: ringSize)
                .animation(.linear(duration: 0.15), value: progress)

            Button(action: action) {
                ZStack {
                    Circle().fill(isListening ? AnyShapeStyle(Theme.auraGradient) : AnyShapeStyle(Theme.accent))
                    Image(systemName: isListening ? "stop.fill" : "mic.fill")
                        .font(.system(size: isListening ? 30 : 40, weight: .semibold))
                        .foregroundStyle(.white)
                        .contentTransition(.symbolEffect(.replace))
                }
                .frame(width: buttonSize, height: buttonSize)
                .shadow(color: (isListening ? Theme.aura2 : Theme.accent).opacity(0.38), radius: 18, y: 8)
                // Listening: a touch bigger, and bigger still while the voice is loud.
                .scaleEffect(isListening ? 1.04 + (reduceMotion ? 0 : level * 0.07) : 1)
                .animation(Motion.press, value: level)
            }
            .buttonStyle(SquashButtonStyle(pressedScale: 0.92))
            .disabled(isDisabled)
            .opacity(isDisabled ? 0.4 : 1)
            .accessibilityLabel(isListening ? "Stop talking" : "Start talking")
        }
        .frame(width: 176, height: 176)
        .animation(Motion.pop, value: isListening)
    }
}

/// Two aura-colored rings that keep growing out of the button and fading, half a beat apart.
private struct Ripples: View {
    let size: CGFloat

    private let period = 1.8

    var body: some View {
        TimelineView(.animation) { timeline in
            let seconds = timeline.date.timeIntervalSinceReferenceDate
            ZStack {
                ForEach(0..<2, id: \.self) { ring in
                    // 0 -> 1 over each period, the second ring half a period behind the first.
                    let phase = (seconds / period + Double(ring) * 0.5).truncatingRemainder(dividingBy: 1)
                    Circle()
                        .fill(Theme.ringGradient)
                        .frame(width: size, height: size)
                        .scaleEffect(1 + 0.5 * phase)
                        .opacity(0.38 * (1 - phase))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
