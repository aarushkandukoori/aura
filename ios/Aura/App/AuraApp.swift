import SwiftUI

/// The app's entry point. Creates the one AppStore, asks the server for the session (which starts
/// the live stream once onboarded), and pauses the stream while the app is in the background.
@main
struct AuraApp: App {
    @State private var store = AppStore()
    @AppStorage(Appearance.storageKey) private var appearance: Appearance = .system
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .tint(Theme.accent)
                .preferredColorScheme(appearance.colorScheme)
                .task { await store.start() }
                .onOpenURL { url in store.open(url: url) }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: store.appDidBecomeActive()
            case .background: store.appDidEnterBackground()
            default: break
            }
        }
    }
}
