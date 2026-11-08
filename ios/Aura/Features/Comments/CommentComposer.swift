import SwiftUI

/// The comment box pinned at the bottom of the comments: quick emojis, "Replying to @x", my avatar,
/// the text field and a send button. It rides up with the keyboard (it lives in a safe-area inset).
struct CommentComposer: View {
    @Environment(AppStore.self) private var store
    let postId: String
    @Binding var replyingTo: Comment?
    var isFocused: FocusState<Bool>.Binding
    /// Called with my comment once the server has it (to scroll to it).
    var onPosted: (Comment) -> Void

    @State private var text = ""
    @State private var isSending = false
    @State private var errorMessage: String?

    private static let quickEmojis = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"]

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 0.5)
            if let replyingTo {
                replyingBar(replyingTo)
            }
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Theme.like)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }
            emojiBar
            inputRow
        }
        .background(Theme.background)
        .animation(.snappy, value: replyingTo?.id)
        .onChange(of: replyingTo?.id) { startReply() }
    }

    // MARK: - Pieces

    private func replyingBar(_ comment: Comment) -> some View {
        HStack {
            Text("Replying to \(Text(comment.author.username).bold())")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            Spacer()
            Button { cancelReply() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 32, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancel reply")
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .padding(.vertical, 4)
        .background(Theme.surface)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var emojiBar: some View {
        HStack(spacing: 0) {
            ForEach(Self.quickEmojis, id: \.self) { emoji in
                Button {
                    text += emoji
                    Haptics.selection()
                } label: {
                    Text(emoji)
                        .font(.system(size: 24))
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Add \(emoji)")
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 4)
    }

    private var inputRow: some View {
        HStack(spacing: 10) {
            AvatarView(account: store.me?.account, size: 36)
            HStack(alignment: .bottom, spacing: 8) {
                TextField(placeholder, text: $text, axis: .vertical)
                    .font(.subheadline)
                    .lineLimit(1...5)
                    .focused(isFocused)
                    .padding(.vertical, 6)
                if canSend || isSending {
                    Button(action: send) {
                        ZStack {
                            Circle().fill(Theme.accent)
                            if isSending {
                                ProgressView().controlSize(.small).tint(.white)
                            } else {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                        .frame(width: 30, height: 30)
                    }
                    .buttonStyle(.plain)
                    .disabled(isSending)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityLabel("Post comment")
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 5)
            .padding(.vertical, 3)
            .frame(minHeight: 40)
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.border))
            .animation(.snappy(duration: 0.2), value: canSend)
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    private var placeholder: String {
        guard let author = store.post(postId)?.author, !author.isMe else { return "Add a comment…" }
        return "Add a comment for \(author.username)…"
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Replying

    /// Starting a reply puts "@username " in front of the text, like other apps do.
    private func startReply() {
        guard let replyingTo else { return }
        isFocused.wrappedValue = true
        guard !replyingTo.author.isMe else { return }
        text = "@\(replyingTo.author.username) " + withoutLeadingMention(text)
    }

    private func cancelReply() {
        replyingTo = nil
        text = withoutLeadingMention(text)
    }

    /// "@maya.chen so cute" -> "so cute".
    private func withoutLeadingMention(_ text: String) -> String {
        guard text.hasPrefix("@") else { return text }
        guard let space = text.firstIndex(of: " ") else { return "" }
        return String(text[text.index(after: space)...])
    }

    // MARK: - Sending

    private func send() {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !isSending else { return }
        // Replies always hang off the top-level comment (the server keeps one level of replies).
        let parentId = replyingTo.map { $0.parentId ?? $0.id }
        isSending = true
        errorMessage = nil
        Task {
            do {
                let comment = try await store.addComment(to: postId, text: body, parentId: parentId)
                text = ""
                replyingTo = nil
                Haptics.tap()
                onPosted(comment)
            } catch {
                if !error.isCancellation { showError(error.localizedDescription) }
            }
            isSending = false
        }
    }

    private func showError(_ message: String) {
        withAnimation { errorMessage = message }
        Haptics.error()
        Task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation { errorMessage = nil }
        }
    }
}
