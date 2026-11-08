import SwiftUI

/// A count (12.4K style) whose digits roll when the number changes, e.g. likes ticking up live.
///
///     CountText(value: post.likeCount).font(.subheadline.weight(.semibold))
struct CountText: View {
    let value: Int

    var body: some View {
        Text(Format.count(value))
            .contentTransition(.numericText(value: Double(value)))
            .animation(.snappy, value: value)
    }
}
