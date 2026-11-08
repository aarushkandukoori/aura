import SwiftUI

/// Shows the store's banners one at a time, sliding down from the top. MainTabView places it.
struct BannerHost: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            if let banner = store.currentBanner {
                BannerView(banner: banner)
                    .id(banner.id)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.45, bounce: 0.25), value: store.currentBanner?.id)
    }
}

/// A push-notification-style card ("Maya: omg that sunset 😭"). Tap to open, swipe up to dismiss;
/// it leaves on its own after a few seconds.
struct BannerView: View {
    @Environment(AppStore.self) private var store
    let banner: Banner

    @State private var dragOffset: CGFloat = 0

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(path: banner.avatar, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(banner.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text(banner.body)
                    .font(.subheadline)
                    .foregroundStyle(Theme.text.opacity(0.8))
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.border.opacity(0.6), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.16), radius: 18, y: 8)
        .padding(.horizontal, 10)
        .padding(.top, 4)
        .offset(y: min(0, dragOffset))
        .contentShape(Rectangle())
        .onTapGesture {
            store.dismissBanner(banner)
            if let href = banner.href { store.open(href: href) }
        }
        .gesture(
            DragGesture(minimumDistance: 8)
                .onChanged { dragOffset = $0.translation.height }
                .onEnded { value in
                    if value.translation.height < -24 {
                        store.dismissBanner(banner)
                    } else {
                        withAnimation(.spring) { dragOffset = 0 }
                    }
                }
        )
        .task(id: banner.id) {
            Haptics.tap()
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { store.dismissBanner(banner) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
