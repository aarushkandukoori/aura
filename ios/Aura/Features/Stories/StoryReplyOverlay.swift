import SwiftUI

/// Replying to someone's story: the story dims, quick reactions appear, and a text field rises
/// with the keyboard. A reply or reaction lands in your DMs with them.
struct StoryReplyOverlay: View {
    let story: Story
    var onSend: (String) -> Void
    var onReact: (String) -> Void
    var onClose: () -> Void

    @State private var text = ""
    @FocusState private var isFocused: Bool

    private static let reactions = ["😂", "😮", "😍", "😢", "👏", "🔥", "🎉", "💯"]

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .onTapGesture { onClose() }

            VStack(spacing: 22) {
                Text("Quick reactions")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 20) {
                    ForEach(Self.reactions, id: \.self) { emoji in
                        Button { onReact(emoji) } label: {
                            Text(emoji)
                                .font(.system(size: 44))
                                .frame(width: 64, height: 64)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(ReactionButtonStyle())
                        .accessibilityLabel("React \(emoji)")
                    }
                }
                .padding(.horizontal, 36)
            }
            .frame(maxHeight: .infinity)

            inputBar
        }
        .onAppear { isFocused = true }
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            AvatarView(path: story.author.avatar, size: 32)
            TextField("Reply to \(story.author.username)…", text: $text)
                .font(.subheadline)
                .foregroundStyle(.white)
                .tint(.white)
                .focused($isFocused)
                .submitLabel(.send)
                .onSubmit(send)
            if !trimmed.isEmpty {
                Button(action: send) {
                    Text("Send")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 44, minHeight: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, 16)
        .padding(.vertical, 6)
        .frame(minHeight: 46)
        .background(.black.opacity(0.55), in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.6), lineWidth: 1))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .environment(\.colorScheme, .dark)
    }

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func send() {
        guard !trimmed.isEmpty else { return }
        onSend(trimmed)
    }
}

/// Emoji buttons grow a little when pressed.
private struct ReactionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.25 : 1)
            .animation(.spring(duration: 0.25, bounce: 0.5), value: configuration.isPressed)
    }
}
