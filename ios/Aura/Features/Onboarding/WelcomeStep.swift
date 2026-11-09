import SwiftUI

/// The first screen: the wordmark inside a slowly turning ring of friendly faces.
struct WelcomeStep: View {
    let onStart: () -> Void

    @State private var faces: [String] = []
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 12)

            ZStack {
                FaceOrbit(paths: faces)
                AuraWordmark(size: 72)
                    .scaleEffect(appeared ? 1 : 0.8)
                    .opacity(appeared ? 1 : 0)
                FloatingPill(text: "❤️ 2,481", delay: 0)
                    .offset(x: 92, y: -64)
                FloatingPill(text: "💬 148", delay: 0.9)
                    .offset(x: -96, y: 70)
            }
            .frame(height: 340)

            VStack(spacing: 12) {
                Text("Everyone's happy to see you.")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)
                Text("Share your moments with friends who can't wait to see them.")
                    .font(.body)
                    .foregroundStyle(Theme.muted)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 36)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 14)

            Spacer()

            Button("Get started", action: onStart)
                .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
                .opacity(appeared ? 1 : 0)
        }
        .task {
            if faces.isEmpty { faces = (try? await API.avatars()) ?? [] }
        }
        .onAppear {
            withAnimation(.spring(duration: 0.9, bounce: 0.3).delay(0.15)) { appeared = true }
        }
    }
}

/// Profile pictures with story rings, spaced around a circle that turns very slowly.
/// Each face turns the other way at the same speed, so it stays upright.
struct FaceOrbit: View {
    let paths: [String]

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let radius: CGFloat = 132
    /// One slow turn takes this long.
    private let turnSeconds = 90.0

    var body: some View {
        // The angle comes from the clock, so faces that arrive after the screen appears turn in step.
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            let angle = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                .truncatingRemainder(dividingBy: turnSeconds) / turnSeconds * 360
            ZStack {
                Circle()
                    .strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1, dash: [3, 7]))
                    .frame(width: radius * 2, height: radius * 2)
                ForEach(Array(paths.prefix(8).enumerated()), id: \.offset) { index, path in
                    let spot = Angle.degrees(Double(index) / Double(min(paths.count, 8)) * 360)
                    AvatarView(path: path, size: index.isMultiple(of: 2) ? 60 : 46, ring: .unseen)
                        .rotationEffect(.degrees(-angle))
                        .offset(x: cos(spot.radians) * radius, y: sin(spot.radians) * radius)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .rotationEffect(.degrees(angle))
        }
        .animation(.spring(duration: 0.6), value: paths.count)
        .accessibilityHidden(true)
    }
}

/// A small "notification" bubble that bobs gently next to the wordmark.
struct FloatingPill: View {
    let text: String
    let delay: Double

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var up = false

    var body: some View {
        Text(text)
            .font(.footnote.weight(.bold))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.regularMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.border.opacity(0.7), lineWidth: 0.5))
            .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
            .offset(y: up ? -6 : 6)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 2.2).repeatForever().delay(delay)) { up = true }
            }
            .accessibilityHidden(true)
    }
}
