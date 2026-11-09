import SwiftUI
import UIKit

/// The signed-in app: five tabs, each with its own navigation stack, plus everything that floats
/// above them (banners, toasts, milestone celebrations) and the shared sheets and story viewer.
///
/// Feature screens never present these themselves. They ask the store:
///     store.openStories(trays:startIndex:) / await store.openStories(for: account)  -> story viewer
///     store.showComments(postId:)                                                -> comments sheet
///     store.showShareSheet(for: post)                                            -> share sheet
struct MainTabView: View {
    @Environment(AppStore.self) private var store
    @State private var avatarIcons: AvatarTabIcons?

    var body: some View {
        @Bindable var store = store
        TabView(selection: tabSelection) {
            NavigationStack(path: $store.homePath) {
                HomeView()
                    .background(Theme.background.ignoresSafeArea())
                    .safeAreaInset(edge: .top, spacing: 0) { HomeTopBar() }
                    .toolbar(.hidden, for: .navigationBar)
                    .withAuraRoutes()
            }
            .tabItem { tabIcon("house", selected: store.selectedTab == .home, label: "Home") }
            .tag(AppTab.home)

            NavigationStack(path: $store.explorePath) {
                ExploreView()
                    .background(Theme.background.ignoresSafeArea())
                    .withAuraRoutes()
            }
            .tabItem { tabIcon("magnifyingglass", selected: false, label: "Explore") }
            .tag(AppTab.explore)

            NavigationStack(path: $store.createPath) {
                CreateView()
                    .background(Theme.background.ignoresSafeArea())
                    .withAuraRoutes()
            }
            .tabItem { tabIcon("plus.app", selected: store.selectedTab == .create, label: "Create") }
            .tag(AppTab.create)

            // ReelsView turns the tab bar dark itself, only while the reels are on screen.
            NavigationStack(path: $store.reelsPath) {
                ReelsView(startId: nil)
                    .withAuraRoutes()
            }
            .tabItem { tabIcon("play.rectangle", selected: store.selectedTab == .reels, label: "Reels") }
            .tag(AppTab.reels)

            NavigationStack(path: $store.profilePath) {
                MyProfileTab()
                    .background(Theme.background.ignoresSafeArea())
                    .withAuraRoutes()
            }
            .tabItem { profileTabIcon }
            .tag(AppTab.profile)
        }
        .environment(\.openURL, openLinksInApp)
        .overlay(alignment: .top) { BannerHost() }
        .overlay(alignment: .bottom) { ToastHost().padding(.bottom, 72) }
        .overlay { MilestoneHost() }
        .fullScreenCover(item: $store.storyViewer) { request in
            StoryViewer(trays: request.trays, startIndex: request.startIndex)
                .environment(store)
                .environment(\.openURL, openLinksInApp)
        }
        .sheet(item: $store.commentsSheet) { item in
            CommentsSheet(postId: item.id)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.background)
                .environment(store)
                .environment(\.openURL, openLinksInApp)
        }
        .sheet(item: $store.shareSheetPost) { post in
            ShareSheetView(post: post)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.background)
                .environment(store)
                .environment(\.openURL, openLinksInApp)
        }
        .background { AvatarTabIconsLoader(icons: $avatarIcons) }
        .zoomTransitions() // grid tiles zoom into the posts they open (UI/ZoomTransitions.swift)
    }

    /// Tapping the tab you're already on goes back to its first screen. On Home's first screen it
    /// scrolls the feed back to the top instead.
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { store.selectedTab },
            set: { tab in
                if tab == store.selectedTab {
                    if tab == .home && store.homePath.isEmpty {
                        store.homeScrollToTop += 1
                    } else {
                        store.popToRoot(tab)
                    }
                }
                store.selectedTab = tab
            }
        )
    }

    /// @mentions, #tags and other aura:// links inside any Text open screens in the app.
    private var openLinksInApp: OpenURLAction {
        OpenURLAction { url in
            store.open(url: url) ? .handled : .systemAction
        }
    }

    private func tabIcon(_ symbol: String, selected: Bool, label: String) -> some View {
        Image(systemName: selected ? symbol + ".fill" : symbol)
            .environment(\.symbolVariants, .none)
            .accessibilityLabel(label)
    }

    /// My avatar as the Profile tab icon (with a ring when selected), or a person symbol until it loads.
    @ViewBuilder private var profileTabIcon: some View {
        if let avatarIcons {
            Image(uiImage: store.selectedTab == .profile ? avatarIcons.selected : avatarIcons.normal)
                .renderingMode(.original)
                .accessibilityLabel("Profile")
        } else {
            tabIcon("person.crop.circle", selected: store.selectedTab == .profile, label: "Profile")
        }
    }
}

/// The Home tab's top bar: the wordmark, the activity heart (with a dot for unread activity) and
/// the messages button (with the unread count).
struct HomeTopBar: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        HStack(spacing: 22) {
            AuraWordmark(size: 31)
            Spacer()
            NavigationLink(value: Route.activity) {
                Image(systemName: "heart")
                    .font(.system(size: 23, weight: .regular))
                    .overlay(alignment: .topTrailing) {
                        if store.badges.notifications > 0 {
                            Circle()
                                .fill(Theme.like)
                                .frame(width: 9, height: 9)
                                .overlay(Circle().stroke(Theme.background, lineWidth: 1.5))
                                .offset(x: 3, y: -1)
                                .popOnIncrease(store.badges.notifications) // UI/BadgePop.swift
                                .transition(.scale)
                        }
                    }
                    .frame(width: 34, height: 40)
                    .contentShape(Rectangle())
                    .overlay(alignment: .bottom) { ActivityBubble() } // UI/ActivityBubble.swift
            }
            .accessibilityLabel(store.badges.notifications > 0 ? "Activity, \(store.badges.notifications) new" : "Activity")
            NavigationLink(value: Route.inbox) {
                Image(systemName: "paperplane")
                    .font(.system(size: 22, weight: .regular))
                    .overlay(alignment: .topTrailing) {
                        if store.badges.messages > 0 {
                            Text(store.badges.messages > 9 ? "9+" : "\(store.badges.messages)")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 18, minHeight: 18)
                                .background(Theme.like, in: Capsule())
                                .overlay(Capsule().stroke(Theme.background, lineWidth: 1.5))
                                .offset(x: 10, y: -8)
                                .popOnIncrease(store.badges.messages) // UI/BadgePop.swift
                                .transition(.scale)
                        }
                    }
                    .frame(width: 34, height: 40)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(store.badges.messages > 0 ? "Messages, \(store.badges.messages) unread" : "Messages")
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.text)
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .frame(height: 48)
        .background(Theme.background.ignoresSafeArea(edges: .top))
        .animation(.spring(duration: 0.3), value: store.badges)
    }
}

/// Shows the milestone celebration over everything while `store.milestone` is set.
private struct MilestoneHost: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            if let milestone = store.milestone {
                MilestoneView(milestone: milestone) { store.dismissMilestone() }
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: store.milestone)
    }
}

/// My profile, the Profile tab's first screen.
///
/// My counts change with every new follower and like, so `store.me` changes all the time. Reading it
/// here instead of in MainTabView means those changes redraw this screen, not the whole tab view.
private struct MyProfileTab: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ProfileView(username: store.me?.username ?? "")
    }
}

/// Redraws the Profile tab icon when my avatar changes. Its own small view for the same reason as
/// MyProfileTab: only this view watches `store.me`.
private struct AvatarTabIconsLoader: View {
    @Environment(AppStore.self) private var store
    @Binding var icons: AvatarTabIcons?

    var body: some View {
        Color.clear
            .task(id: store.me?.avatar) {
                icons = await AvatarTabIcons.make(path: store.me?.avatar)
            }
    }
}

/// Tab bars only show plain images, so my avatar is drawn into small round pictures for the Profile tab.
struct AvatarTabIcons {
    let normal: UIImage
    let selected: UIImage

    static func make(path: String?) async -> AvatarTabIcons? {
        guard let url = API.mediaURL(path), let photo = try? await ImageLoader.shared.image(for: url) else { return nil }
        return AvatarTabIcons(normal: draw(photo, ring: nil), selected: draw(photo, ring: UIColor(Theme.accent)))
    }

    /// A 28 pt circle of the photo, optionally inside a colored ring.
    private static func draw(_ photo: UIImage, ring: UIColor?) -> UIImage {
        let size = CGSize(width: 28, height: 28)
        let image = UIGraphicsImageRenderer(size: size).image { _ in
            let bounds = CGRect(origin: .zero, size: size)
            var photoArea = bounds.insetBy(dx: 1, dy: 1)
            if let ring {
                ring.setFill()
                UIBezierPath(ovalIn: bounds).fill()
                photoArea = bounds.insetBy(dx: 2.5, dy: 2.5)
            }
            UIBezierPath(ovalIn: photoArea).addClip()
            // Fill the circle like a photo tile: scale up and crop the overflow.
            let scale = max(photoArea.width / photo.size.width, photoArea.height / photo.size.height)
            let drawn = CGSize(width: photo.size.width * scale, height: photo.size.height * scale)
            photo.draw(in: CGRect(x: photoArea.midX - drawn.width / 2, y: photoArea.midY - drawn.height / 2,
                                  width: drawn.width, height: drawn.height))
        }
        return image.withRenderingMode(.alwaysOriginal)
    }
}
