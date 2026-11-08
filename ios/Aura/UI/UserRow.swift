import SwiftUI

/// A person in a list: avatar (with story ring), username + badge, a second line, and something on
/// the right (a Follow button by default). Tapping the avatar or names opens their profile.
///
///     UserRow(account: account)                                    // with a Follow button
///     UserRow(account: account, subtitle: "Followed by maya") { EmptyView() }
///     UserRow(account: viewer.account) { Text(viewer.reaction ?? "") }
///
/// The profile link is a NavigationLink, so the row must be inside a NavigationStack that uses
/// `.withAuraRoutes()` (every tab does; a sheet needs its own NavigationStack).
struct UserRow<Trailing: View>: View {
    let account: Account
    var subtitle: String?
    var avatarSize: CGFloat
    let trailing: Trailing

    init(account: Account, subtitle: String? = nil, avatarSize: CGFloat = 48, @ViewBuilder trailing: () -> Trailing) {
        self.account = account
        self.subtitle = subtitle
        self.avatarSize = avatarSize
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 12) {
            NavigationLink(value: Route.profile(account.username)) {
                HStack(spacing: 12) {
                    AvatarView(account: account, size: avatarSize, showsStoryRing: true)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(account.username)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                            if account.verified { VerifiedBadge(size: 12) }
                        }
                        let secondLine = subtitle ?? account.displayName
                        if !secondLine.isEmpty {
                            Text(secondLine)
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            trailing
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }
}

extension UserRow where Trailing == FollowButton {
    /// A row with a Follow button on the right.
    init(account: Account, subtitle: String? = nil, avatarSize: CGFloat = 48) {
        self.init(account: account, subtitle: subtitle, avatarSize: avatarSize) {
            FollowButton(account: account)
        }
    }
}
