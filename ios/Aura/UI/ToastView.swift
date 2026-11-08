import SwiftUI

/// Shows the store's toast ("Your post is live ✨") at the bottom for a moment. MainTabView places it.
struct ToastHost: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            if let toast = store.toast {
                Text(toast.text)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.background)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Theme.text.opacity(0.92), in: Capsule())
                    .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
                    .padding(.horizontal, 24)
                    .id(toast.id)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onTapGesture { store.toast = nil }
            }
        }
        .animation(.spring(duration: 0.4), value: store.toast)
    }
}
