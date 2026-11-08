import SwiftUI

/// The celebration for a big moment ("You just hit 50K followers"): confetti and a glowing card.
/// MainTabView shows it over everything while `store.milestone` is set.
struct MilestoneView: View {
    let milestone: Milestone
    var onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)

            if !reduceMotion {
                ConfettiView()
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }

            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Theme.ringGradient)
                        .frame(width: 92, height: 92)
                        .blur(radius: 18)
                        .opacity(0.8)
                    Circle()
                        .strokeBorder(Theme.ringGradient, lineWidth: 6)
                        .frame(width: 78, height: 78)
                    Text("✦")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.auraGradient)
                }
                .padding(.bottom, 4)

                Text(milestone.title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                if !milestone.body.isEmpty {
                    Text(milestone.body)
                        .font(.body)
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
                Button("Keep shining", action: onDismiss)
                    .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
                    .padding(.top, 8)
            }
            .padding(24)
            .frame(maxWidth: 340)
            .background(Theme.background, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
            .shadow(color: Theme.aura1.opacity(0.35), radius: 40)
            .padding(28)
            .scaleEffect(appeared ? 1 : 0.85)
            .opacity(appeared ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(duration: 0.5, bounce: 0.35)) { appeared = true }
        }
    }
}

/// Confetti falling from the top for a few seconds, drawn with Canvas.
struct ConfettiView: View {
    /// One piece of confetti. Its position is worked out from the time since the start.
    private struct Piece {
        var x: Double          // 0...1 across the screen
        var delay: Double      // seconds before it starts falling
        var speed: Double      // screen heights per second
        var sway: Double       // phase of the side-to-side wobble
        var spin: Double       // radians per second
        var color: Color
        var size: CGSize

        static func random() -> Piece {
            Piece(x: .random(in: 0...1), delay: .random(in: 0...0.8), speed: .random(in: 0.28...0.5),
                  sway: .random(in: 0...(2 * .pi)), spin: .random(in: -6...6),
                  color: Theme.auraColors.randomElement() ?? Theme.aura1,
                  size: CGSize(width: .random(in: 6...10), height: .random(in: 9...15)))
        }
    }

    @State private var pieces = (0..<110).map { _ in Piece.random() }
    @State private var start = Date()
    @State private var finished = false

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: finished)) { timeline in
            Canvas { context, size in
                let elapsed = timeline.date.timeIntervalSince(start)
                for piece in pieces {
                    let time = elapsed - piece.delay
                    guard time > 0 else { continue }
                    let y = -20 + time * piece.speed * size.height
                    guard y < size.height + 20 else { continue }
                    let x = piece.x * size.width + sin(time * 2.4 + piece.sway) * 26
                    var pieceContext = context
                    pieceContext.translateBy(x: x, y: y)
                    pieceContext.rotate(by: .radians(time * piece.spin))
                    let rect = CGRect(x: -piece.size.width / 2, y: -piece.size.height / 2,
                                      width: piece.size.width, height: piece.size.height)
                    pieceContext.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(piece.color))
                }
            }
        }
        .task {
            try? await Task.sleep(for: .seconds(5))
            finished = true // stop redrawing once everything has fallen
        }
    }
}
