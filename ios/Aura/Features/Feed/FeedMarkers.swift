import SwiftUI

/// The floating "New posts" pill with the faces of whoever just posted. Tap to jump to them.
struct NewPostsPill: View {
    let authors: [Account]
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 13, weight: .bold))
                StackedAvatars(paths: uniqueAvatars, size: 22)
                Text("New posts")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(.white)
            .padding(.leading, 14)
            .padding(.trailing, 16)
            .padding(.vertical, 7)
            .background(Theme.accent, in: Capsule())
            .shadow(color: Theme.accent.opacity(0.35), radius: 12, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Show new posts")
    }

    /// Up to three different people.
    private var uniqueAvatars: [String?] {
        var seen = Set<String>()
        return authors.filter { seen.insert($0.id).inserted }.prefix(3).map(\.avatar)
    }
}

/// "You're all caught up": shown where posts from people you follow end and suggestions begin.
struct CaughtUpView: View {
    var showsSuggestedHeader: Bool

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 0.5)
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .strokeBorder(Theme.ringGradient, lineWidth: 2.5)
                    Image(systemName: "checkmark")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(Theme.auraGradient)
                }
                .frame(width: 64, height: 64)
                .padding(.bottom, 4)
                Text("You're all caught up")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text("You've seen all the new posts from people you follow.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 30)
            if showsSuggestedHeader {
                Rectangle().fill(Theme.border).frame(height: 0.5)
                Text("Suggested posts")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.top, 16)
                    .padding(.bottom, 4)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// The small label above a post from someone you don't follow yet.
struct SuggestedLabel: View {
    var body: some View {
        Label("Suggested for you", systemImage: "sparkles")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 2)
    }
}

/// Gray, shimmering stand-ins for posts while the feed loads.
struct FeedSkeleton: View {
    var body: some View {
        VStack(spacing: 26) {
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        ShimmerView().frame(width: 38, height: 38).clipShape(Circle())
                        VStack(alignment: .leading, spacing: 6) {
                            ShimmerView().frame(width: 130, height: 11).clipShape(Capsule())
                            ShimmerView().frame(width: 84, height: 9).clipShape(Capsule())
                        }
                    }
                    .padding(.horizontal, 12)
                    ShimmerView().aspectRatio(4 / 5, contentMode: .fit)
                    ShimmerView().frame(width: 190, height: 11).clipShape(Capsule()).padding(.horizontal, 14)
                    ShimmerView().frame(width: 270, height: 11).clipShape(Capsule()).padding(.horizontal, 14)
                }
            }
        }
        .padding(.top, 10)
        .accessibilityElement()
        .accessibilityLabel("Loading your feed")
    }
}
