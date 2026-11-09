import SwiftUI

/// A 3-column grid of post thumbnails with reel / carousel icons (profiles, explore results, saved, tags).
/// Tapping opens the post (or the reel player for reels), zooming out of the tile, unless you pass `onSelect`.
///
///     PostGrid(posts: posts)
///     PostGrid(posts: reels, showsViewCounts: true)
///     PostGrid(posts: posts) { post in selected = post }
///
/// Put it in a ScrollView. Use `onLastAppear` to load the next page.
struct PostGrid: View {
    let posts: [Post]
    /// Tile width / height. 3:4 shows more of the 4:5 photos than squares do.
    var tileAspect: CGFloat = 3.0 / 4.0
    var showsViewCounts = false
    var onSelect: ((Post) -> Void)? = nil
    var onLastAppear: (() -> Void)? = nil

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 2) {
            ForEach(posts) { post in
                tile(for: post)
                    .onAppear {
                        if post.id == posts.last?.id { onLastAppear?() }
                    }
            }
        }
    }

    @ViewBuilder private func tile(for post: Post) -> some View {
        if let onSelect {
            Button { onSelect(post) } label: {
                PostTile(post: post, aspect: tileAspect, showsViewCount: showsViewCounts)
            }
            .buttonStyle(.plain)
        } else {
            PostTileButton(post: post, aspect: tileAspect, showsViewCount: showsViewCounts)
        }
    }
}

/// A tile that opens its post (or reel) on the current tab. The screen zooms out of the tile, the
/// way Instagram's grids open posts, and shrinks back into it when you go back.
struct PostTileButton: View {
    @Environment(AppStore.self) private var store
    let post: Post
    var aspect: CGFloat = 3.0 / 4.0
    var showsViewCount = false

    var body: some View {
        Button {
            ZoomSources.tileTapped(post.id)
            store.navigate(to: post.isReel ? .reel(post.id) : .post(post.id))
        } label: {
            PostTile(post: post, aspect: aspect, showsViewCount: showsViewCount)
                .zoomSource(id: ZoomID.post(post.id))
        }
        .buttonStyle(.plain)
    }
}

/// One thumbnail: the first picture, an icon for reels and carousels, and optionally the view count.
struct PostTile: View {
    let post: Post
    var aspect: CGFloat = 3.0 / 4.0
    var showsViewCount = false

    var body: some View {
        RemoteImage(path: post.thumbnail)
            .aspectRatio(aspect, contentMode: .fit)
            .overlay(alignment: .topTrailing) {
                if let icon = kindIcon {
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.45), radius: 3)
                        .padding(7)
                }
            }
            .overlay(alignment: .bottomLeading) {
                if showsViewCount {
                    Label(Format.count(post.viewCount), systemImage: "play.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.5), radius: 3)
                        .padding(7)
                }
            }
            .contentShape(Rectangle())
            .accessibilityLabel(post.caption.isEmpty ? "Post by \(post.author.username)" : post.caption)
    }

    private var kindIcon: String? {
        switch post.kind {
        case .reel: "play.square.stack.fill"
        case .carousel: "square.fill.on.square.fill"
        case .photo: nil
        }
    }
}
