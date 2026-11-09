import SwiftUI

/// "Suggested for you" under a profile's buttons, like Instagram's: right after you follow someone
/// a row of people you might also like slides down (and the person-plus button toggles it). Each
/// card has a Follow button and an X to drop it from the row.
struct SuggestedRow: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let accounts: [Account]
    var onDismiss: (Account) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Suggested for you")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                Spacer()
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(accounts) { account in
                        SuggestedCard(account: account) { onDismiss(account) }
                            .transition(.scale(scale: 0.8).combined(with: .opacity))
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
        .animation(Motion.snap.orFade(reduceMotion), value: accounts.map(\.id))
    }
}

/// One suggested person: picture, names, Follow, and an X to dismiss them.
private struct SuggestedCard: View {
    let account: Account
    var onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 4) {
            NavigationLink(value: Route.profile(account.username)) {
                VStack(spacing: 4) {
                    AvatarView(account: account, size: 76)
                        .padding(.bottom, 6)
                    HStack(spacing: 3) {
                        Text(account.displayName)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                        if account.verified { VerifiedBadge(size: 11) }
                    }
                    Text(account.followsMe ? "Follows you" : account.username)
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            FollowButton(account: account, fullWidth: true)
                .padding(.top, 8)
        }
        .padding(.horizontal, 12)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(width: 156)
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
        .overlay(alignment: .topTrailing) {
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(account.username) from suggestions")
        }
    }
}
