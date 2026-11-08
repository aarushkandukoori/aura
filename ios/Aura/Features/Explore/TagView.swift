import SwiftUI

/// A hashtag page: a header with the tag and how many posts use it, then the posts as a mosaic.
struct TagView: View {
    @Environment(AppStore.self) private var store
    let tag: String

    @State private var pager: PostPager
    @State private var postCount: Int?

    init(tag: String) {
        self.tag = tag
        _pager = State(initialValue: PostPager { cursor in try await API.tagPosts(tag, cursor: cursor) })
    }

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    header
                    grid(width: geometry.size.width)
                }
            }
            .refreshable {
                await pager.reload(into: store)
                await loadCount()
            }
        }
        .navigationTitle("#\(tag)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await pager.loadFirstPage(into: store)
            await loadCount()
        }
    }

    private var header: some View {
        HStack(spacing: 18) {
            Text("#")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 84, height: 84)
                .background(Theme.ringGradient, in: Circle())
                .shadow(color: Theme.aura1.opacity(0.3), radius: 12, y: 4)
            VStack(alignment: .leading, spacing: 4) {
                Text("#\(tag)")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text(postCount.map { Format.count($0, "post") } ?? " ")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .contentTransition(.numericText())
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
    }

    @ViewBuilder private func grid(width: CGFloat) -> some View {
        let posts = pager.posts(in: store)
        if !pager.hasLoaded {
            if let error = pager.errorMessage {
                EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load #\(tag)", message: error,
                               actionTitle: "Try again") { Task { await pager.reload(into: store) } }
            } else {
                GridSkeleton(rows: 4)
            }
        } else if posts.isEmpty {
            EmptyStateView(systemImage: "number", title: "No posts yet",
                           message: "Be the first to post with #\(tag).")
        } else {
            ExploreMosaic(posts: posts, width: width) {
                Task { await pager.loadMore(into: store) }
            }
        }
    }

    /// The number of posts using the tag, from search (it counts every post, not just loaded ones).
    private func loadCount() async {
        guard let result = try? await API.search("#" + tag) else { return }
        let match = result.tags.first { $0.tag.lowercased() == tag.lowercased() }
        withAnimation { postCount = match?.postCount ?? pager.ids.count }
    }
}
