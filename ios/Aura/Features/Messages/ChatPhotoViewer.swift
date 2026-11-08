import SwiftUI

/// A chat photo full screen on black. Drag it down (or tap ✕) to close.
struct ChatPhotoViewer: View {
    let path: String

    @Environment(\.dismiss) private var dismiss
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        ZStack {
            // The background fades as the photo is dragged away, showing the chat behind.
            Color.black
                .opacity(1 - min(Double(abs(dragOffset)) / 500, 0.7))
                .ignoresSafeArea()
            RemoteImage(path: path, contentMode: .fit)
                .ignoresSafeArea()
                .offset(y: dragOffset)
                .gesture(
                    DragGesture()
                        .onChanged { dragOffset = $0.translation.height }
                        .onEnded { value in
                            if abs(value.translation.height) > 120 {
                                dismiss()
                            } else {
                                withAnimation(.spring(duration: 0.3)) { dragOffset = 0 }
                            }
                        }
                )
        }
        .overlay(alignment: .topLeading) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.black.opacity(0.35), in: Circle())
            }
            .padding(.leading, 12)
            .opacity(dragOffset == 0 ? 1 : 0)
            .accessibilityLabel("Close")
        }
        .presentationBackground(.clear)
        .statusBarHidden()
    }
}
