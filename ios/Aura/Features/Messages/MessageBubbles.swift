import SwiftUI

// The pieces a message can be made of. MessageRow stacks the ones a message needs:
// story reply, reply quote, shared post, photo, then the text bubble.

/// A text bubble. Mine are accent colored on the right, theirs gray on the left. Inside a run of
/// bubbles, the corners facing the neighbours get tighter so the run reads as one block.
struct MessageTextBubble: View {
    let text: String
    let placement: ChatPlacement

    var body: some View {
        Text(Format.richText(text))
            .font(.callout)
            .foregroundStyle(placement.isMine ? Color.white : Theme.text)
            // @mentions and #tags: white on my accent bubble, accent on gray bubbles.
            .tint(placement.isMine ? Color.white : Theme.accent)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(placement.isMine ? Theme.accent : Theme.secondaryFill, in: MessageBubbleShape(placement: placement))
            .contentShape(.contextMenuPreview, MessageBubbleShape(placement: placement))
    }
}

/// A rounded bubble whose corners on the sender's side tighten inside a run.
struct MessageBubbleShape: Shape {
    let placement: ChatPlacement

    func path(in rect: CGRect) -> Path {
        let round: CGFloat = 20
        let tight: CGFloat = 5
        let top = placement.isFirstInRun ? round : tight
        let bottom = placement.isLastInRun ? round : tight
        let shape = placement.isMine
            ? UnevenRoundedRectangle(topLeadingRadius: round, bottomLeadingRadius: round,
                                     bottomTrailingRadius: bottom, topTrailingRadius: top, style: .continuous)
            : UnevenRoundedRectangle(topLeadingRadius: top, bottomLeadingRadius: bottom,
                                     bottomTrailingRadius: round, topTrailingRadius: round, style: .continuous)
        return shape.path(in: rect)
    }
}

/// One to three emoji on their own are sent big, without a bubble (like "😭" or "🔥🔥").
enum ChatEmoji {
    static func isBigEmoji(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed.count <= 3 else { return false }
        return trimmed.allSatisfy { character in
            guard let scalar = character.unicodeScalars.first else { return false }
            // Emoji presentation by default (😭), or a symbol made emoji by a variation selector (❤️).
            return scalar.properties.isEmojiPresentation
                || (scalar.properties.isEmoji && character.unicodeScalars.count > 1)
        }
    }
}

/// A photo in the chat, sized to its shape. Tap opens it full screen.
struct MessagePhotoBubble: View {
    let media: Media

    var body: some View {
        // Very tall or very wide photos are cropped a little so the chat stays readable.
        let aspect = min(max(media.aspectRatio ?? 0.8, 0.6), 1.6)
        RemoteImage(path: media.thumbnail)
            .frame(width: 230, height: 230 / aspect)
            .overlay {
                if media.isVideo {
                    Image(systemName: "play.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .padding(16)
                        .background(.black.opacity(0.35), in: Circle())
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.border.opacity(0.6), lineWidth: 0.5))
            .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityLabel(media.isVideo ? "Video" : "Photo")
    }
}

/// A post someone sent into the chat: author, picture and the start of the caption.
struct MessagePostCard: View {
    let post: Post

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                AvatarView(account: post.author, size: 26)
                Text(post.author.username)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if post.author.verified { VerifiedBadge(size: 11) }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)

            RemoteImage(path: post.thumbnail)
                .aspectRatio(4 / 5, contentMode: .fit)
                .overlay(alignment: .topTrailing) {
                    if post.isReel || post.kind == .carousel {
                        Image(systemName: post.isReel ? "play.rectangle.fill" : "square.fill.on.square.fill")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.4), radius: 3)
                            .padding(10)
                    }
                }

            if !post.caption.isEmpty {
                Text(Format.caption(username: post.author.username, text: post.caption))
                    .font(.footnote)
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
            }
        }
        .frame(width: 230)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.border, lineWidth: 0.5))
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the post")
    }
}

/// "Replied to your story" with a small picture of the story, above the reply itself.
struct MessageStoryReply: View {
    let story: StoryRef
    let isMine: Bool
    /// A reaction (just an emoji) reads "Reacted to..." instead of "Replied to...".
    let isReaction: Bool

    var body: some View {
        VStack(alignment: isMine ? .trailing : .leading, spacing: 5) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.muted)
            HStack(spacing: 8) {
                if isMine { quoteBar }
                RemoteImage(path: story.thumb.isEmpty ? nil : story.thumb)
                    .frame(width: 96, height: 160)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border.opacity(0.6), lineWidth: 0.5))
                if !isMine { quoteBar }
            }
            .fixedSize()
        }
        .accessibilityElement(children: .combine)
    }

    private var label: String {
        switch (isMine, isReaction) {
        case (true, true): "You reacted to their story"
        case (true, false): "You replied to their story"
        case (false, true): "Reacted to your story"
        case (false, false): "Replied to your story"
        }
    }

    private var quoteBar: some View {
        Capsule()
            .fill(Theme.border)
            .frame(width: 3)
    }
}

/// The message a reply answers, shown small and faded above the reply bubble. Tap jumps to it.
struct MessageReplyQuote: View {
    let label: String
    let quotedText: String
    let isMine: Bool

    var body: some View {
        VStack(alignment: isMine ? .trailing : .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.system(size: 9))
                Text(label)
                    .font(.caption)
            }
            .foregroundStyle(Theme.muted)
            Text(quotedText.isEmpty ? "Message" : quotedText)
                .font(.subheadline)
                .foregroundStyle(Theme.text.opacity(0.65))
                .lineLimit(2)
                .multilineTextAlignment(isMine ? .trailing : .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
        }
        .accessibilityElement(children: .combine)
    }
}

/// The little pill of emoji reactions under a bubble: "❤️😂 2".
struct MessageReactionsBadge: View {
    let reactions: [Reaction]

    var body: some View {
        // Each emoji once, in the order people reacted.
        let emojis = reactions.map(\.emoji).reduce(into: [String]()) { list, emoji in
            if !list.contains(emoji) { list.append(emoji) }
        }
        HStack(spacing: 1) {
            ForEach(emojis.prefix(3), id: \.self) { emoji in
                Text(emoji).font(.system(size: 13))
            }
            if reactions.count > 1 {
                Text("\(reactions.count)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .padding(.leading, 2)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Theme.secondaryFill, in: Capsule())
        // A ring in the chat's background color makes the pill look cut out of the bubble.
        .padding(2)
        .background(Theme.background, in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Reactions: \(emojis.joined(separator: " "))")
    }
}
