import SwiftUI

/// "Continue with Google", drawn the way Google's sign-in branding asks: the full-color G on a white
/// button with a gray outline (dark mode: near-black with a lighter outline), same as the web app.
struct GoogleButton: View {
    /// Shows a spinner instead of the G while the sign-in sheet is open.
    let isWorking: Bool
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if isWorking {
                    ProgressView()
                        .tint(isDark ? .white : .black)
                        .frame(width: 20, height: 20)
                } else {
                    GoogleMark()
                        .frame(width: 20, height: 20)
                }
                Text("Continue with Google")
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundStyle(isDark ? Color(hex: 0xE3E3E3) : Color(hex: 0x1F1F1F))
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(isDark ? Color(hex: 0x131314) : Color.white, in: Capsule())
            .overlay(Capsule().strokeBorder(isDark ? Color(hex: 0x8E918F) : Color(hex: 0x747775), lineWidth: 1))
            .shadow(color: .black.opacity(isDark ? 0 : 0.06), radius: 1, y: 1)
            .contentShape(Capsule())
        }
        .buttonStyle(SquashButtonStyle(pressedScale: 0.97))
        .disabled(isWorking)
        .accessibilityLabel("Continue with Google")
    }
}

/// Google's "G" in its own four colors (never recolored), drawn from the official 48 x 48 artwork.
struct GoogleMark: View {
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / 48
            context.scaleBy(x: scale, y: scale)
            context.fill(Self.red, with: .color(Color(hex: 0xEA4335)))
            context.fill(Self.blue, with: .color(Color(hex: 0x4285F4)))
            context.fill(Self.yellow, with: .color(Color(hex: 0xFBBC05)))
            context.fill(Self.green, with: .color(Color(hex: 0x34A853)))
        }
        .accessibilityHidden(true)
    }

    private static func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }

    private static let red = Path { p in
        p.move(to: pt(24, 9.5))
        p.addCurve(to: pt(33.21, 13.1), control1: pt(27.54, 9.5), control2: pt(30.71, 10.72))
        p.addLine(to: pt(40.06, 6.25))
        p.addCurve(to: pt(24, 0), control1: pt(35.9, 2.38), control2: pt(30.47, 0))
        p.addCurve(to: pt(2.56, 13.22), control1: pt(14.62, 0), control2: pt(6.51, 5.38))
        p.addLine(to: pt(10.54, 19.41))
        p.addCurve(to: pt(24, 9.5), control1: pt(12.43, 13.72), control2: pt(17.74, 9.5))
        p.closeSubpath()
    }

    private static let blue = Path { p in
        p.move(to: pt(46.98, 24.55))
        p.addCurve(to: pt(46.6, 20), control1: pt(46.98, 22.98), control2: pt(46.83, 21.46))
        p.addLine(to: pt(24, 20))
        p.addLine(to: pt(24, 29.02))
        p.addLine(to: pt(36.94, 29.02))
        p.addCurve(to: pt(32.16, 36.2), control1: pt(36.36, 31.98), control2: pt(34.68, 34.5))
        p.addLine(to: pt(39.89, 42.2))
        p.addCurve(to: pt(46.98, 24.55), control1: pt(44.4, 38.02), control2: pt(46.98, 31.84))
        p.closeSubpath()
    }

    private static let yellow = Path { p in
        p.move(to: pt(10.53, 28.59))
        p.addCurve(to: pt(9.77, 24), control1: pt(10.05, 27.14), control2: pt(9.77, 25.6))
        p.addCurve(to: pt(10.53, 19.41), control1: pt(9.77, 22.4), control2: pt(10.04, 20.86))
        p.addLine(to: pt(2.55, 13.22))
        p.addCurve(to: pt(0, 24), control1: pt(0.92, 16.46), control2: pt(0, 20.12))
        p.addCurve(to: pt(2.56, 34.78), control1: pt(0, 27.88), control2: pt(0.92, 31.54))
        p.addLine(to: pt(10.53, 28.59))
        p.closeSubpath()
    }

    private static let green = Path { p in
        p.move(to: pt(24, 48))
        p.addCurve(to: pt(39.89, 42.19), control1: pt(30.48, 48), control2: pt(35.93, 45.87))
        p.addLine(to: pt(32.16, 36.19))
        p.addCurve(to: pt(24, 38.49), control1: pt(30.01, 37.64), control2: pt(27.24, 38.49))
        p.addCurve(to: pt(10.53, 28.58), control1: pt(17.74, 38.49), control2: pt(12.43, 34.27))
        p.addLine(to: pt(2.55, 34.77))
        p.addCurve(to: pt(24, 48), control1: pt(6.51, 42.62), control2: pt(14.62, 48))
        p.closeSubpath()
    }
}
