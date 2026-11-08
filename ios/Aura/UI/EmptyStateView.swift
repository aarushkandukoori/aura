import SwiftUI

/// A friendly centered message for empty lists and errors, with an optional button.
///
///     EmptyStateView(systemImage: "bubble.left", title: "No comments yet", message: "Start the conversation.")
///     EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load", message: error, actionTitle: "Try again") { reload() }
struct EmptyStateView: View {
    var systemImage: String
    var title: String
    var message: String? = nil
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(Theme.text)
                .frame(width: 76, height: 76)
                .overlay(Circle().strokeBorder(Theme.text, lineWidth: 1.5))
                .padding(.bottom, 4)
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.auraPrimary)
                    .padding(.top, 6)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}
