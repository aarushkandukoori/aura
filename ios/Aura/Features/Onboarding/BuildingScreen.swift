import SwiftUI

/// "Building your world...": the person's photo inside turning aura rings with friends circling it,
/// and a status line that changes every moment. Shown while the plan is made (PlanStep) and while the
/// world is built (BuildStep), then "You're all set" with a check, or what went wrong.
struct BuildingScreen: View {
    enum Phase: Equatable {
        case working
        case done
        case failed(String)
    }

    let phase: Phase
    let title: String
    /// Status lines shown one after another while working. The last one stays.
    let lines: [String]
    /// How long each line stays (a plan takes longer than a build).
    var lineSeconds = 1.4
    let avatar: String?
    let name: String
    var backTitle = "Go back"
    let onRetry: () -> Void
    let onBack: () -> Void

    @State private var lineIndex = 0

    var body: some View {
        switch phase {
        case .failed(let message): failure(message)
        case .working, .done: progress
        }
    }

    private var progress: some View {
        VStack(spacing: 28) {
            Spacer()
            BuildingRings(avatar: avatar, isDone: phase == .done)
            VStack(spacing: 10) {
                Text(phase == .done ? doneTitle : title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)
                    .contentTransition(.opacity)
                Text(phase == .done ? "Everyone's happy to see you." : lines[min(lineIndex, lines.count - 1)])
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .id(phase == .done ? -1 : lineIndex)
                    .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity),
                                            removal: .move(edge: .top).combined(with: .opacity)))
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            .frame(height: 90, alignment: .top)
            .clipped()
            .animation(Motion.slide, value: phase)
            Spacer()
        }
        .task(id: phase) { await cycleLines() }
        .accessibilityElement(children: .combine)
    }

    private var doneTitle: String {
        let first = name.split(separator: " ").first.map(String.init) ?? ""
        return first.isEmpty ? "You're all set!" : "You're all set, \(first)!"
    }

    /// A new status line every so often while working.
    private func cycleLines() async {
        guard phase == .working else { return }
        while !Task.isCancelled && lineIndex < lines.count - 1 {
            try? await Task.sleep(for: .seconds(lineSeconds))
            if Task.isCancelled { return }
            withAnimation(.easeInOut(duration: 0.35)) { lineIndex += 1 }
        }
    }

    private func failure(_ message: String) -> some View {
        VStack(spacing: 14) {
            Spacer()
            Text("😕")
                .font(.system(size: 40))
                .frame(width: 84, height: 84)
                .background(Theme.surface, in: Circle())
            Text("We hit a snag")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.text)
                .padding(.top, 8)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
            VStack(spacing: 10) {
                Button("Try again", action: onRetry)
                    .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
                Button(backTitle, action: onBack)
                    .buttonStyle(.aura(.secondary, size: .large, fullWidth: true))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 16)
        }
        .transition(.opacity)
    }
}

/// The person's photo inside two turning aura rings, a soft pulsing glow, preset faces circling
/// around (each turning back so it stays upright), and a check that pops on when it's done.
private struct BuildingRings: View {
    let avatar: String?
    let isDone: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spin = false
    @State private var pulse = false
    @State private var faces: [String] = []

    private let orbitRadius: CGFloat = 118
    /// One trip around takes this long.
    private static let orbitSeconds = 16.0

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.ringGradient)
                .frame(width: 200, height: 200)
                .blur(radius: 50)
                .opacity(pulse ? 0.6 : 0.3)
                .scaleEffect(pulse ? 1.06 : 0.92)
            // The orbit's angle comes from the clock, so faces that pop in later turn in step with the rest.
            TimelineView(.animation(paused: reduceMotion)) { timeline in
                let orbit = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: Self.orbitSeconds) / Self.orbitSeconds * 360
                ZStack {
                    ForEach(Array(faces.enumerated()), id: \.offset) { index, face in
                        let angle = Double(index) / 5 * 2 * .pi
                        AvatarView(path: face, size: 42)
                            .padding(3)
                            .background(Circle().fill(Theme.background))
                            .shadow(color: .black.opacity(0.12), radius: 6, y: 3)
                            .rotationEffect(.degrees(-orbit))
                            .offset(x: cos(angle) * orbitRadius, y: sin(angle) * orbitRadius)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                .rotationEffect(.degrees(orbit))
            }
            Circle()
                .strokeBorder(Theme.ringGradient.opacity(0.6), style: StrokeStyle(lineWidth: 2, dash: [4, 10]))
                .frame(width: 186, height: 186)
                .rotationEffect(.degrees(spin ? -360 : 0))
            Circle()
                .strokeBorder(Theme.ringGradient, lineWidth: 5)
                .frame(width: 156, height: 156)
                .rotationEffect(.degrees(spin ? 360 : 0))
            Group {
                if let avatar {
                    RemoteImage(path: avatar)
                } else {
                    DefaultAvatar()
                }
            }
            .frame(width: 132, height: 132)
            .clipShape(Circle())
            .overlay(alignment: .bottomTrailing) {
                if isDone {
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Theme.aura4.gradient, in: Circle())
                        .overlay(Circle().stroke(Theme.background, lineWidth: 4))
                        .offset(x: 4, y: 4)
                        .transition(.scale(scale: 0.2).combined(with: .opacity))
                }
            }
            .animation(Motion.pop, value: isDone)
        }
        .frame(width: 290, height: 290)
        .task {
            if faces.isEmpty {
                let presets = (try? await API.avatars()) ?? []
                // The faces pop in one by one.
                for face in presets.prefix(5) {
                    try? await Task.sleep(for: .milliseconds(300))
                    withAnimation(Motion.pop) { faces.append(face) }
                }
            }
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 3.5).repeatForever(autoreverses: false)) { spin = true }
            withAnimation(.easeInOut(duration: 1.3).repeatForever()) { pulse = true }
        }
        .accessibilityHidden(true)
    }
}
