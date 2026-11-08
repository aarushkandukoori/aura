import SwiftUI

/// New message: pick one person for a DM or several for a group chat (with an optional name),
/// then open the chat. People you already talk to and people you follow are suggested.
struct NewMessageView: View {
    @Environment(AppStore.self) private var store

    @State private var query = ""
    @State private var suggested: [Account] = []
    @State private var results: [Account] = []
    @State private var selected: [Account] = []
    @State private var groupName = ""
    @State private var isCreating = false
    @FocusState private var isSearchFocused: Bool

    private var isSearching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }
    private var people: [Account] { isSearching ? results : suggested }

    var body: some View {
        VStack(spacing: 0) {
            toField
            if selected.count >= 2 {
                groupNameField
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Rectangle().fill(Theme.border).frame(height: 0.5)
            List {
                if !people.isEmpty {
                    Section {
                        ForEach(people) { person in
                            personRow(person)
                        }
                    } header: {
                        Text(isSearching ? "People" : "Suggested")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .textCase(nil)
                    }
                } else if isSearching {
                    Text("No one found for \"\(query)\"")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { createButton }
        .animation(.snappy(duration: 0.25), value: selected.count >= 2)
        .navigationTitle("New message")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .task { await loadSuggestions() }
        .task(id: query) { await search() }
    }

    // MARK: - Parts

    /// "To:" with a chip for everyone picked so far, then the search box. When the chips get too
    /// wide, picking someone scrolls the row to the end so the search box stays in sight.
    private var toField: some View {
        HStack(spacing: 8) {
            Text("To:")
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.text)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(selected) { person in
                            Button {
                                toggle(person)
                            } label: {
                                HStack(spacing: 4) {
                                    Text(person.displayName)
                                        .lineLimit(1)
                                    Image(systemName: "xmark")
                                        .font(.system(size: 9, weight: .bold))
                                }
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.accent)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Theme.accent.opacity(0.12), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove \(person.displayName)")
                        }
                        TextField(selected.isEmpty ? "Search" : "Add more", text: $query)
                            .focused($isSearchFocused)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .frame(minWidth: 120)
                            .id("search")
                    }
                    // The row's width changes once a chip is added or removed and laid out.
                    .onGeometryChange(for: CGFloat.self) { geometry in
                        geometry.size.width
                    } action: { _ in
                        withAnimation(.snappy) { proxy.scrollTo("search", anchor: .trailing) }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        // Chips appear without the group name field's animation: while the row is still growing,
        // the scroll above can't reach its end.
        .animation(nil, value: selected.count)
    }

    private var groupNameField: some View {
        HStack(spacing: 10) {
            Image(systemName: "person.3.fill")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
            TextField("Group name (optional)", text: $groupName)
                .submitLabel(.done)
        }
        .padding(.horizontal, 12)
        .frame(height: 40)
        .background(Theme.secondaryFill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func personRow(_ person: Account) -> some View {
        let isSelected = selected.contains { $0.id == person.id }
        return Button {
            toggle(person)
        } label: {
            HStack(spacing: 12) {
                ChatPersonRow(account: person)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 24))
                    .foregroundStyle(isSelected ? Theme.accent : Theme.border)
                    .padding(.trailing, 16)
                    .contentTransition(.symbolEffect(.replace))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Theme.background)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var createButton: some View {
        Button(action: create) {
            if isCreating {
                ProgressView().tint(.white)
            } else {
                Text(selected.count >= 2 ? "Create group chat" : "Chat")
            }
        }
        .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
        .disabled(selected.isEmpty || isCreating)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(Theme.background)
    }

    // MARK: - Data

    /// People I already DM first, then the rest of the characters I follow.
    private func loadSuggestions() async {
        let dmPartners = store.conversations.filter { !$0.isGroup }.compactMap(\.members.first)
        var list = dmPartners.filter { $0.kind == .cast }
        if let me = store.me, let following = try? await API.following(me.username) {
            list += following.accounts.filter { $0.kind == .cast }
        }
        var seen = Set<String>()
        suggested = list.filter { seen.insert($0.id).inserted }
    }

    private func search() async {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else {
            results = []
            return
        }
        try? await Task.sleep(for: .milliseconds(250)) // wait for a pause in typing
        if Task.isCancelled { return }
        if let found = try? await API.search(term) {
            // Only characters write back, so they're the people worth messaging.
            results = found.accounts.filter { $0.kind == .cast }
        }
    }

    private func toggle(_ person: Account) {
        Haptics.selection()
        if let index = selected.firstIndex(where: { $0.id == person.id }) {
            selected.remove(at: index)
        } else {
            selected.append(person)
            query = ""
        }
    }

    /// Opens the DM (an existing one is reused) or makes the group, then shows it in place of this screen.
    private func create() {
        isCreating = true
        let name = groupName.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                let conversation = try await store.startConversation(
                    with: selected.map(\.id),
                    title: selected.count >= 2 && !name.isEmpty ? name : nil
                )
                let tab = store.selectedTab
                var path = store.path(for: tab)
                if path.last == .newMessage { path.removeLast() }
                path.append(.chat(conversation.id))
                store.setPath(path, for: tab)
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
            isCreating = false
        }
    }
}
