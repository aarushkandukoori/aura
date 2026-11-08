import SwiftUI

/// Shown above the composer in a message request: accept it (moves to Primary) or delete it.
/// Replying works too: the server accepts the request when I send a message.
struct ChatRequestBar: View {
    @Environment(AppStore.self) private var store
    let conversation: Conversation
    /// Called after the request was deleted, so the chat can close.
    let onDeleted: () -> Void

    @State private var isConfirmingDelete = false
    @State private var isWorking = false

    private var name: String {
        conversation.members.first.map { MessagePreview.firstName($0) } ?? conversation.title
    }

    var body: some View {
        VStack(spacing: 12) {
            VStack(spacing: 3) {
                Text("\(name) wants to send you a message")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                Text("Accept to move this chat to Primary. Replying accepts it too.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            .multilineTextAlignment(.center)
            HStack(spacing: 10) {
                Button("Delete") { isConfirmingDelete = true }
                    .buttonStyle(.aura(.secondary, fullWidth: true))
                Button("Accept") { accept() }
                    .buttonStyle(.aura(.primary, fullWidth: true))
            }
            .disabled(isWorking)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Theme.background)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.border).frame(height: 0.5)
        }
        .confirmationDialog("Delete this request?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { delete() }
        } message: {
            Text("\(name) won't know you deleted it.")
        }
    }

    private func accept() {
        isWorking = true
        Task {
            do {
                try await store.acceptRequest(conversation.id)
                Haptics.success()
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
            isWorking = false
        }
    }

    private func delete() {
        isWorking = true
        Task {
            do {
                try await store.deleteConversation(conversation.id)
                onDeleted()
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
            isWorking = false
        }
    }
}
