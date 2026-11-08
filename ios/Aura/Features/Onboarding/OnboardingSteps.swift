import SwiftUI

// The question screens of onboarding. Each one edits the shared OnboardingDraft; OnboardingView
// supplies the back button, progress bar and Continue button around them.

// MARK: - Name, username, pronouns

struct NameStep: View {
    @Bindable var draft: OnboardingDraft
    @FocusState private var focus: Field?

    private enum Field { case name, username, pronouns }

    var body: some View {
        OnboardingPage(title: "What should we call you?", subtitle: "This is how you'll show up for everyone.") {
            VStack(alignment: .leading, spacing: 18) {
                LabeledField(label: "Name") {
                    TextField("Your name", text: $draft.displayName)
                        .textContentType(.name)
                        .submitLabel(.next)
                        .focused($focus, equals: .name)
                        .onSubmit { focus = .username }
                        .onChange(of: draft.displayName) { draft.nameChanged() }
                }

                LabeledField(label: "Username", note: usernameNote, noteIsWarning: usernameIsWarning) {
                    HStack(spacing: 2) {
                        Text("@").foregroundStyle(Theme.muted)
                        TextField("username", text: usernameBinding)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.asciiCapable)
                            .submitLabel(.next)
                            .focused($focus, equals: .username)
                            .onSubmit { focus = .pronouns }
                        if UsernameRules.problem(with: draft.username) == nil {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Theme.aura4)
                                .transition(.scale.combined(with: .opacity))
                        }
                    }
                    .animation(.snappy, value: draft.username)
                }

                LabeledField(label: "Pronouns") {
                    TextField("Optional", text: $draft.pronouns)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .focused($focus, equals: .pronouns)
                }

                HStack(spacing: 8) {
                    ForEach(OnboardingDraft.pronounChoices, id: \.self) { choice in
                        Button {
                            Haptics.selection()
                            draft.pronouns = draft.pronouns == choice ? "" : choice
                        } label: {
                            ChipLabel(title: choice, isSelected: draft.pronouns == choice, height: 32)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .task {
            // Wait for the slide-in to finish, then put the cursor in the name field.
            try? await Task.sleep(for: .milliseconds(500))
            if draft.trimmedName.isEmpty { focus = .name }
        }
    }

    /// Typing keeps only what usernames allow, and stops the suggestion from the name.
    private var usernameBinding: Binding<String> {
        Binding(
            get: { draft.username },
            set: { typed in
                draft.username = UsernameRules.clean(typed)
                draft.typedOwnUsername = !typed.isEmpty
            }
        )
    }

    private var usernameIsWarning: Bool {
        !draft.username.isEmpty && UsernameRules.problem(with: draft.username) != nil
    }

    private var usernameNote: String {
        if draft.username.isEmpty { return "Letters, numbers, dots and underscores." }
        return UsernameRules.problem(with: draft.username) ?? "You can change it anytime."
    }
}

// MARK: - Photo

struct PhotoStep: View {
    @Bindable var draft: OnboardingDraft

    var body: some View {
        OnboardingPage(title: "Add a profile photo", subtitle: "So your friends spot you right away.") {
            AvatarChooser(path: $draft.avatar, isUploading: $draft.isUploadingAvatar, previewSize: 140)
                .frame(maxWidth: .infinity)
        }
    }
}

// MARK: - Bio and interests

struct AboutStep: View {
    @Bindable var draft: OnboardingDraft

    var body: some View {
        OnboardingPage(title: "Tell people about you", subtitle: "A line about you, and the things you love.") {
            VStack(alignment: .leading, spacing: 6) {
                LabeledField(label: "Bio") {
                    TextField("Coffee first, then everything else ☕", text: bioBinding, axis: .vertical)
                        .lineLimit(2...4)
                        .padding(.vertical, 14)
                }
                Text("\(draft.bio.count)/\(OnboardingDraft.bioLimit)")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text("What are you into?")
                        .font(.headline)
                        .foregroundStyle(Theme.text)
                    Spacer()
                    Text(interestHint)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(draft.interests.count >= OnboardingDraft.minimumInterests ? Theme.accent : Theme.muted)
                        .contentTransition(.numericText())
                        .animation(.snappy, value: draft.interests.count)
                }
                InterestPicker(selection: $draft.interests)
            }
        }
    }

    /// The bio, cut off at the server's 150-character limit.
    private var bioBinding: Binding<String> {
        Binding(
            get: { draft.bio },
            set: { draft.bio = String($0.prefix(OnboardingDraft.bioLimit)) }
        )
    }

    private var interestHint: String {
        let missing = OnboardingDraft.minimumInterests - draft.interests.count
        return missing > 0 ? "Pick \(missing) more" : "\(draft.interests.count) picked"
    }
}

// MARK: - How you know your friends

struct OriginStep: View {
    @Bindable var draft: OnboardingDraft

    var body: some View {
        OnboardingPage(title: "How do you know your friends?",
                       subtitle: "Your closest friends will share this part of your story.") {
            VStack(spacing: 10) {
                ForEach(OnboardingDraft.origins, id: \.value) { origin in
                    Button {
                        Haptics.selection()
                        draft.origin = origin.value
                    } label: {
                        OptionCard(emoji: origin.emoji, title: origin.title, detail: origin.detail,
                                   isSelected: draft.origin == origin.value)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Popularity tier

struct TierStep: View {
    @Bindable var draft: OnboardingDraft

    var body: some View {
        OnboardingPage(title: "How popular are you?", subtitle: "Pick the life you want. You can change it anytime in Settings.") {
            VStack(spacing: 12) {
                ForEach(Tier.allCases) { tier in
                    Button {
                        Haptics.selection()
                        draft.tier = tier
                    } label: {
                        TierCard(tier: tier, isSelected: draft.tier == tier)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// A tier with its follower count and what it feels like.
struct TierCard: View {
    let tier: Tier
    let isSelected: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(tier.emoji)
                .font(.system(size: 26))
                .frame(width: 48, height: 48)
                .background(Circle().fill(Theme.auraGradient.opacity(isSelected ? 0.35 : 0.15)))
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(tier.label)
                        .font(.headline)
                        .foregroundStyle(Theme.text)
                    Spacer()
                    Text("\(Format.count(tier.followers)) followers")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isSelected ? Theme.accent : Theme.muted)
                }
                Text(tier.blurb)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(isSelected ? AnyShapeStyle(Theme.ringGradient) : AnyShapeStyle(Theme.border),
                              lineWidth: isSelected ? 2.5 : 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .animation(.snappy(duration: 0.2), value: isSelected)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// A big tappable choice: an emoji, a title, a line of detail and a check when picked.
struct OptionCard: View {
    let emoji: String
    let title: String
    let detail: String
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 14) {
            Text(emoji)
                .font(.system(size: 24))
                .frame(width: 46, height: 46)
                .background(Circle().fill(Theme.background))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 22))
                .foregroundStyle(isSelected ? Theme.accent : Theme.border)
        }
        .padding(14)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(isSelected ? Theme.accent : Theme.border, lineWidth: isSelected ? 2 : 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .animation(.snappy(duration: 0.2), value: isSelected)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

extension Tier {
    /// A little picture for each tier on the tier cards.
    var emoji: String {
        switch self {
        case .rising: "🌱"
        case .popular: "⭐️"
        case .influencer: "💫"
        case .icon: "👑"
        }
    }
}
