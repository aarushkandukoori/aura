import SwiftUI

/// The bar that slides up over the bottom of a photo for a moment after you save it, like
/// Instagram's: the post's thumbnail, "Saved", and a shortcut to everything you've saved.
struct SavedBar: View {
    @Environment(AppStore.self) private var store
    let thumbnail: String?

    var body: some View {
        HStack(spacing: 10) {
            RemoteImage(path: thumbnail)
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text("Saved")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.text)
            Spacer()
            Button {
                store.navigate(to: .saved)
            } label: {
                Text("View all")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(Theme.background.opacity(0.97))
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.border).frame(height: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}
