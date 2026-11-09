import SwiftUI

/// "Someone is typing": their avatar and a gray bubble with three dots bouncing one after another.
/// The bubble grows out of the avatar's corner when it appears, like Instagram's.
struct ChatTypingBubble: View {
    let typers: [Account]

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if typers.count > 1 {
                StackedAvatars(paths: typers.map(\.avatar), size: 20)
                    .frame(width: 28, alignment: .leading)
            } else {
                AvatarView(account: typers.first, size: 28)
            }
            ChatTypingDots()
                .padding(.horizontal, 15)
                .padding(.vertical, 14)
                .background(Theme.secondaryFill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .scaleEffect(appeared || reduceMotion ? 1 : 0.4, anchor: .bottomLeading)
                .opacity(appeared ? 1 : 0)
            Spacer(minLength: 0)
        }
        .padding(.top, 10)
        .onAppear { withAnimation(Motion.pop.orFade(reduceMotion)) { appeared = true } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MessagePreview.typingLine(typers, isGroup: typers.count > 1))
    }
}

/// Three dots rising and brightening one after another, then resting for a beat (half of each sine
/// wave is cut off, so every dot sits still while the others take their turn).
struct ChatTypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    // Each dot runs the same sine wave a little later than the one before.
                    let wave = reduceMotion ? 0 : max(0, sin(time * 6.5 - Double(index) * 0.9))
                    Circle()
                        .fill(Theme.muted)
                        .frame(width: 8, height: 8)
                        .opacity(0.45 + 0.55 * wave)
                        .offset(y: -3 * wave)
                }
            }
        }
    }
}
