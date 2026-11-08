import SwiftUI

/// The accent-colored badge with a white check shown after verified usernames.
///
///     HStack(spacing: 4) { Text(account.username); if account.verified { VerifiedBadge() } }
struct VerifiedBadge: View {
    var size: CGFloat = 13

    var body: some View {
        Image(systemName: "checkmark.seal.fill")
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, Theme.accent)
            .font(.system(size: size, weight: .semibold))
            .accessibilityLabel("Verified")
    }
}
