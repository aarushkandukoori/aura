import SwiftUI

// Small pieces of the message list: the time labels between messages and the "New messages" chip.

/// A centered time label between messages sent far apart ("Yesterday 9:41 PM").
struct ChatTimeSeparator: View {
    let millis: Millis

    var body: some View {
        Text(Format.messageTime(millis))
            .font(.caption.weight(.medium))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity)
            .padding(.top, 18)
            .padding(.bottom, 4)
    }
}

/// Floats above the composer when messages arrive while you're reading further up.
struct NewMessagesChip: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.down")
                    .font(.caption.weight(.bold))
                Text("New messages")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Theme.accent, in: Capsule())
            .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
    }
}
