import SwiftUI

/// Notifications, grouped into New, Today, This week, This month and Earlier. Opening it marks
/// everything read; what was unread stays under "New" until you leave. New ones slide in live and
/// are marked read when you leave (not one by one: while a post's "like" row is unread, the server
/// merges new likes into it, so it stays one row instead of many).
struct ActivityView: View {
    @Environment(AppStore.self) private var store

    /// The notifications that were unread while this screen has been open.
    @State private var newIds: Set<String> = []
    @State private var hasLoaded = false
    @State private var suggestions: [Account] = []

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if store.notifications.isEmpty {
                    if hasLoaded {
                        EmptyStateView(systemImage: "heart", title: "Activity on your posts",
                                       message: "When people like or comment on your posts or follow you, you'll see it here.")
                            .padding(.top, 30)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    }
                } else {
                    ForEach(sections, id: \.title) { section in
                        SectionTitle(text: section.title)
                        ForEach(section.items) { notification in
                            ActivityRow(notification: notification, isNew: section.title == "New")
                                .transition(.move(edge: .top).combined(with: .opacity))
                                .onAppear {
                                    if notification.id == store.notifications.last?.id {
                                        Task { await store.loadMoreNotifications() }
                                    }
                                }
                        }
                    }
                }
                if !suggestions.isEmpty {
                    SectionTitle(text: "Suggested for you")
                        .padding(.top, 10)
                    ForEach(suggestions) { account in
                        UserRow(account: account, subtitle: account.followsMe ? "Follows you" : account.displayName)
                    }
                }
            }
            .padding(.bottom, 24)
            .animation(.snappy, value: store.notifications.map(\.id))
        }
        .refreshable {
            await store.loadNotifications()
            await markRead()
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { Task { await store.markNotificationsRead() } }
        .task {
            if store.notifications.isEmpty { await store.loadNotifications() }
            hasLoaded = true
            await markRead()
            if suggestions.isEmpty {
                let people = (try? await API.suggestions()) ?? []
                suggestions = Array(people.prefix(5))
            }
        }
    }

    /// Remembers what's unread (so it stays under New), then marks everything read.
    private func markRead() async {
        for notification in store.notifications where !notification.read {
            newIds.insert(notification.id)
        }
        await store.markNotificationsRead()
    }

    // MARK: - Sections

    private struct ActivitySection {
        let title: String
        var items: [AuraNotification]
    }

    private var sections: [ActivitySection] {
        let order = ["New", "Today", "This week", "This month", "Earlier"]
        var groups: [String: [AuraNotification]] = [:]
        for notification in store.notifications {
            let title = newIds.contains(notification.id) || !notification.read ? "New" : period(of: notification.createdAt)
            groups[title, default: []].append(notification)
        }
        return order.compactMap { title in groups[title].map { ActivitySection(title: title, items: $0) } }
    }

    private func period(of millis: Millis) -> String {
        let date = Date(millis: millis)
        if Calendar.current.isDateInToday(date) { return "Today" }
        let days = Date().timeIntervalSince(date) / 86_400
        if days < 7 { return "This week" }
        if days < 30 { return "This month" }
        return "Earlier"
    }
}
