import SwiftUI

/// Settings: my account, how the world behaves (popularity, speed, AI model), appearance, which
/// server to use, starting over, and an honest note about how Aura works.
struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @AppStorage(Appearance.storageKey) private var appearance: Appearance = .system

    @State private var serverAddress = API.server
    @State private var serverCheck: ServerCheck.Result?
    @State private var checking = false
    @State private var confirmingReset = false
    @State private var resetting = false

    var body: some View {
        List {
            accountSection
            popularitySection
            worldSection
            appearanceSection
            serverSection
            startOverSection
            aboutSection
        }
        .scrollContentBackground(.hidden)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.refreshSession() } // fresh provider status
        .confirmationDialog("Start over?", isPresented: $confirmingReset, titleVisibility: .visible) {
            Button("Start over", role: .destructive) { Task { await startOver() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This deletes your posts, messages and followers and builds a brand new world. It can't be undone.")
        }
    }

    // MARK: - Account

    private var accountSection: some View {
        Section {
            if let me = store.me {
                NavigationLink(value: Route.editProfile) {
                    HStack(spacing: 12) {
                        AvatarView(account: me.account, size: 52)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(me.displayName)
                                .font(.headline)
                                .foregroundStyle(Theme.text)
                            Text("@\(me.username) · Edit profile")
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            NavigationLink(value: Route.saved) {
                Label("Saved posts", systemImage: "bookmark")
            }
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: - The world

    private var popularitySection: some View {
        Section {
            ForEach(Tier.allCases) { tier in
                Button {
                    guard tier != store.settings?.tier else { return }
                    store.settings?.tier = tier // show it right away; the server confirms
                    update(UpdateSettingsRequest(tier: tier))
                } label: {
                    HStack(spacing: 12) {
                        Text(tier.emoji).font(.title3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tier.label)
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Theme.text)
                            Text("\(Format.count(tier.followers)) followers · \(tier.blurb)")
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        if store.settings?.tier == tier {
                            Image(systemName: "checkmark")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Theme.accent)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        } header: {
            Text("Popularity")
        } footer: {
            Text("Changes how many people follow you and how big every post gets.")
        }
        .listRowBackground(Theme.surface)
    }

    private var worldSection: some View {
        Section {
            Picker("World speed", selection: speedBinding) {
                ForEach(Speed.allCases) { speed in Text(speed.label).tag(speed) }
            }
            .pickerStyle(.segmented)
            .listRowSeparator(.hidden)

            Picker("Characters write with", selection: modelBinding) {
                ForEach(AiModel.allCases) { model in Text(model.label).tag(model) }
            }
            .pickerStyle(.menu)

            if let provider = store.settings?.provider {
                HStack(spacing: 10) {
                    Circle()
                        .fill(provider.active == .offline ? Theme.aura3 : Theme.aura4)
                        .frame(width: 9, height: 9)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(providerTitle(provider.active))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                        if !provider.detail.isEmpty {
                            Text(provider.detail)
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }
        } header: {
            Text("World")
        } footer: {
            Text("Speed is how quickly reactions arrive. Fast squeezes an hour of likes and comments into about five minutes.")
        }
        .listRowBackground(Theme.surface)
    }

    private var speedBinding: Binding<Speed> {
        Binding(
            get: { store.settings?.speed ?? .fast },
            set: { speed in
                store.settings?.speed = speed
                update(UpdateSettingsRequest(speed: speed))
            }
        )
    }

    private var modelBinding: Binding<AiModel> {
        Binding(
            get: { store.settings?.model ?? .opus },
            set: { model in
                store.settings?.model = model
                update(UpdateSettingsRequest(model: model))
            }
        )
    }

    private func providerTitle(_ kind: ProviderKind) -> String {
        switch kind {
        case .anthropic: "Connected to the Claude API"
        case .claudeCli: "Connected through Claude Code"
        case .offline: "Offline: built-in replies"
        }
    }

    /// Saves a settings change. If the server says no, the true settings are read back.
    private func update(_ request: UpdateSettingsRequest) {
        Haptics.selection()
        Task {
            do {
                try await store.updateSettings(request)
            } catch {
                if error.isCancellation { return }
                store.showToast(error.localizedDescription)
                await store.refreshSession()
            }
        }
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        Section("Appearance") {
            Picker("Appearance", selection: $appearance) {
                ForEach(Appearance.allCases) { option in Text(option.label).tag(option) }
            }
            .pickerStyle(.segmented)
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: - Server

    private var serverSection: some View {
        Section {
            TextField("http://localhost:8790", text: $serverAddress)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: serverAddress) { serverCheck = nil }

            Button {
                Task {
                    checking = true
                    serverCheck = await ServerCheck.run(address: ServerCheck.normalize(serverAddress))
                    checking = false
                }
            } label: {
                HStack {
                    Text("Test connection")
                    Spacer()
                    if checking { ProgressView() }
                }
            }
            .disabled(checking)

            if let serverCheck {
                Label(serverCheck.message, systemImage: serverCheck.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(serverCheck.ok ? Theme.text : Theme.like)
                    .symbolRenderingMode(.multicolor)
            }

            if ServerCheck.normalize(serverAddress) != API.server {
                Button("Use this server") {
                    Task { await store.changeServer(to: ServerCheck.normalize(serverAddress)) }
                }
                .fontWeight(.semibold)
            }
        } header: {
            Text("Server")
        } footer: {
            Text(serverFooter)
        }
        .listRowBackground(Theme.surface)
    }

    private var serverFooter: String {
        var text = "The Aura server running on your Mac. On a real iPhone, use your Mac's address on the same Wi-Fi."
        if ProcessInfo.processInfo.arguments.contains("-AuraServer") {
            text += " This launch was started with -AuraServer, which wins over this setting until the next normal launch."
        }
        return text
    }

    // MARK: - Start over and About

    private var startOverSection: some View {
        Section {
            Button(role: .destructive) {
                confirmingReset = true
            } label: {
                HStack {
                    Text("Start over")
                    Spacer()
                    if resetting { ProgressView() }
                }
            }
            .disabled(resetting)
        } footer: {
            Text("Wipes this world and takes you back to the beginning.")
        }
        .listRowBackground(Theme.surface)
    }

    private var aboutSection: some View {
        Section("About") {
            VStack(alignment: .leading, spacing: 10) {
                AuraWordmark(size: 26)
                Text("Aura is a social world made just for you. Every account here except yours is an AI character: their posts, comments and messages are written by Claude, or by built-in templates when it's offline. Your photos and messages are sent to Claude only so the characters can react to them, and everything else stays on your own Aura server.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Version \(appVersion)")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            .padding(.vertical, 6)
        }
        .listRowBackground(Theme.surface)
    }

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    private func startOver() async {
        resetting = true
        defer { resetting = false }
        do {
            try await store.resetWorld()
            RecentSearches.clear()
        } catch {
            if !error.isCancellation { store.showToast(error.localizedDescription) }
        }
    }
}
