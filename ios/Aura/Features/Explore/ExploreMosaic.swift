import SwiftUI

/// The Explore grid. Posts come in groups of eight: a row of three tiles, then a tall tile (two rows
/// high) next to four small ones. The tall tile switches sides from group to group, and a reel takes
/// the tall spot when the group has one (with its view count).
///
/// Explore and hashtag pages load 24 posts at a time, exactly three groups, so tiles never jump
/// around when the next page arrives. A short last group (fewer than five posts) is just plain rows.
struct ExploreMosaic: View {
    let posts: [Post]
    /// The width to fill (the screen's width, from a GeometryReader).
    let width: CGFloat
    var onLastAppear: (() -> Void)? = nil

    static let gap: CGFloat = 2

    /// One group of up to eight posts.
    struct MosaicGroup {
        var row: [Post]      // the row of three (or every post of a short last group)
        var tall: Post?      // the tall tile (nil in a short last group)
        var smalls: [Post]   // the four small tiles beside it
    }

    private var tileWidth: CGFloat { max(1, (width - 2 * Self.gap) / 3) }
    private var tileHeight: CGFloat { tileWidth * 4 / 3 }
    private var tallHeight: CGFloat { tileHeight * 2 + Self.gap }

    var body: some View {
        let groups = Self.groups(from: posts)
        LazyVStack(spacing: Self.gap) {
            ForEach(Array(groups.enumerated()), id: \.offset) { index, group in
                groupView(group, tallOnLeft: index.isMultiple(of: 2))
                    .onAppear {
                        if index == groups.count - 1 { onLastAppear?() }
                    }
            }
        }
    }

    /// Splits the posts into groups of eight (the last group may be smaller).
    static func groups(from posts: [Post]) -> [MosaicGroup] {
        var groups: [MosaicGroup] = []
        var start = 0
        while start < posts.count {
            var chunk = Array(posts[start..<min(start + 8, posts.count)])
            start += 8
            guard chunk.count >= 5 else {
                groups.append(MosaicGroup(row: chunk, tall: nil, smalls: []))
                break
            }
            // The tall tile: the first reel in the chunk, otherwise the fourth post.
            let tallIndex = chunk.firstIndex(where: \.isReel) ?? 3
            let tall = chunk.remove(at: tallIndex)
            groups.append(MosaicGroup(row: Array(chunk.prefix(3)), tall: tall, smalls: Array(chunk.dropFirst(3))))
        }
        return groups
    }

    // MARK: - Layout

    private func groupView(_ group: MosaicGroup, tallOnLeft: Bool) -> some View {
        VStack(spacing: Self.gap) {
            // Rows of three: the top row, or all of a short last group.
            ForEach(Array(stride(from: 0, to: group.row.count, by: 3)), id: \.self) { start in
                let rowPosts = Array(group.row[start..<min(start + 3, group.row.count)])
                HStack(spacing: Self.gap) {
                    ForEach(0..<3, id: \.self) { slot in
                        tileOrSpace(rowPosts, slot)
                    }
                }
            }
            if let tall = group.tall {
                HStack(alignment: .top, spacing: Self.gap) {
                    if tallOnLeft {
                        tallTile(tall)
                        smallBlock(group.smalls)
                    } else {
                        smallBlock(group.smalls)
                        tallTile(tall)
                    }
                }
            }
        }
    }

    /// The four small tiles in a 2 x 2 square.
    private func smallBlock(_ smalls: [Post]) -> some View {
        VStack(spacing: Self.gap) {
            HStack(spacing: Self.gap) {
                tileOrSpace(smalls, 0)
                tileOrSpace(smalls, 1)
            }
            HStack(spacing: Self.gap) {
                tileOrSpace(smalls, 2)
                tileOrSpace(smalls, 3)
            }
        }
    }

    /// The post in that slot, or an empty space of the same size at the very end of the list.
    @ViewBuilder private func tileOrSpace(_ posts: [Post], _ slot: Int) -> some View {
        if posts.indices.contains(slot) {
            tile(posts[slot], height: tileHeight, showsViewCount: false)
        } else {
            Color.clear.frame(width: tileWidth, height: tileHeight)
        }
    }

    private func tallTile(_ post: Post) -> some View {
        tile(post, height: tallHeight, showsViewCount: post.isReel)
    }

    private func tile(_ post: Post, height: CGFloat, showsViewCount: Bool) -> some View {
        NavigationLink(value: post.isReel ? Route.reel(post.id) : Route.post(post.id)) {
            PostTile(post: post, aspect: tileWidth / height, showsViewCount: showsViewCount)
                .frame(width: tileWidth, height: height)
        }
        .buttonStyle(.plain)
    }
}

/// Shimmering tiles shown while the first page of a grid loads.
struct GridSkeleton: View {
    var rows = 4
    var tileAspect: CGFloat = 3.0 / 4.0

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 2) {
            ForEach(0..<(rows * 3), id: \.self) { _ in
                ShimmerView().aspectRatio(tileAspect, contentMode: .fit)
            }
        }
        .accessibilityLabel("Loading")
    }
}
