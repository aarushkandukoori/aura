import SwiftUI

extension Date {
    /// A Date from the server's milliseconds-since-1970.
    init(millis: Millis) {
        self.init(timeIntervalSince1970: millis / 1000)
    }

    /// This date in the server's milliseconds-since-1970.
    var millis: Millis { timeIntervalSince1970 * 1000 }
}

/// How numbers, times and captions are written everywhere in the app.
enum Format {
    // MARK: - Counts

    /// 1,234 · 12.4K · 124K · 1.2M. Rounds down (like social apps do) so 99,999 never reads as "100K".
    static func count(_ number: Int) -> String {
        let n = max(number, 0)
        if n < 10_000 { return n.formatted(.number) }
        if n < 1_000_000 { return compact(n, unit: 1_000, suffix: "K") }
        if n < 1_000_000_000 { return compact(n, unit: 1_000_000, suffix: "M") }
        return compact(n, unit: 1_000_000_000, suffix: "B")
    }

    /// 12_400 -> "12.4K" (one decimal under 100 units), 124_000 -> "124K".
    private static func compact(_ n: Int, unit: Int, suffix: String) -> String {
        let whole = n / unit
        if whole >= 100 { return "\(whole)\(suffix)" }
        let tenth = (n % unit) / (unit / 10)
        return tenth == 0 ? "\(whole)\(suffix)" : "\(whole).\(tenth)\(suffix)"
    }

    /// "1 like" / "1,204 likes": a count with its word, singular when it is exactly one.
    static func count(_ number: Int, _ singular: String, _ plural: String? = nil) -> String {
        "\(count(number)) \(number == 1 ? singular : (plural ?? singular + "s"))"
    }

    // MARK: - Times

    /// Short relative time: now · 2m · 3h · 4d · 2w · Mar 3 (· Mar 3, 2025 in another year).
    static func timeAgo(_ millis: Millis, now: Date = .now) -> String {
        let date = Date(millis: millis)
        let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
        let hours = minutes / 60
        let days = hours / 24
        if minutes < 1 { return "now" }
        if hours < 1 { return "\(minutes)m" }
        if days < 1 { return "\(hours)h" }
        if days < 7 { return "\(days)d" }
        if days < 28 { return "\(days / 7)w" }
        return shortDate(date, now: now)
    }

    /// Long relative time for under a post: Just now · 5 minutes ago · 3 hours ago · 4 days ago · March 3.
    static func timeAgoLong(_ millis: Millis, now: Date = .now) -> String {
        let date = Date(millis: millis)
        let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
        let hours = minutes / 60
        let days = hours / 24
        if minutes < 1 { return "Just now" }
        if hours < 1 { return minutes == 1 ? "1 minute ago" : "\(minutes) minutes ago" }
        if days < 1 { return hours == 1 ? "1 hour ago" : "\(hours) hours ago" }
        if days < 7 { return days == 1 ? "1 day ago" : "\(days) days ago" }
        let sameYear = Calendar.current.isDate(date, equalTo: now, toGranularity: .year)
        return sameYear
            ? date.formatted(.dateTime.month(.wide).day())
            : date.formatted(.dateTime.month(.wide).day().year())
    }

    /// For chat time separators: 3:42 PM · Yesterday 3:42 PM · Mon 3:42 PM · Mar 3, 3:42 PM.
    static func messageTime(_ millis: Millis, now: Date = .now) -> String {
        let date = Date(millis: millis)
        let calendar = Calendar.current
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDateInToday(date) { return time }
        if calendar.isDateInYesterday(date) { return "Yesterday \(time)" }
        if let days = calendar.dateComponents([.day], from: date, to: now).day, days < 7 {
            return "\(date.formatted(.dateTime.weekday(.abbreviated))) \(time)"
        }
        return "\(shortDate(date, now: now)), \(time)"
    }

    /// "Active now" (last 5 minutes), "Active 12m ago", "Active 3h ago", or nil when longer than a day.
    static func activeStatus(_ lastActiveAt: Millis?, now: Date = .now) -> String? {
        guard let lastActiveAt else { return nil }
        let minutes = Int(max(0, now.timeIntervalSince(Date(millis: lastActiveAt))) / 60)
        if minutes < 5 { return "Active now" }
        if minutes < 60 { return "Active \(minutes)m ago" }
        if minutes < 24 * 60 { return "Active \(minutes / 60)h ago" }
        return nil
    }

    /// Mar 3 (this year) or Mar 3, 2025.
    private static func shortDate(_ date: Date, now: Date) -> String {
        let sameYear = Calendar.current.isDate(date, equalTo: now, toGranularity: .year)
        return sameYear
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    // MARK: - Captions and comments

    /// Text with every @mention and #tag turned into a tappable link (accent colored by the app's tint).
    /// Show it with `Text(Format.richText(caption))`; taps open the profile or tag page by themselves.
    static func richText(_ text: String) -> AttributedString {
        var result = AttributedString(text)
        let whole = NSRange(text.startIndex..., in: text)
        for match in linkPattern.matches(in: text, range: whole) {
            guard let range = Range(match.range, in: result),
                  let textRange = Range(match.range, in: text) else { continue }
            let token = text[textRange]                 // "@maya.chen" or "#sunset"
            let name = String(token.dropFirst())
            result[range].link = token.hasPrefix("@") ? AuraLink.profile(name) : AuraLink.tag(name)
            if token.hasPrefix("@") { result[range].inlinePresentationIntent = .stronglyEmphasized }
        }
        return result
    }

    /// "username caption…" with the username in bold, like a caption under a post or a comment.
    static func caption(username: String, text: String) -> AttributedString {
        var name = AttributedString(username)
        name.inlinePresentationIntent = .stronglyEmphasized
        return name + AttributedString(" ") + richText(text)
    }

    /// @mention (letters, numbers, _ and inner dots) or #tag, not glued to a word before it (so emails don't match).
    private static let linkPattern = try! NSRegularExpression(
        pattern: #"(?<![\p{L}\p{N}_@#])(?:@[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?|#[\p{L}\p{N}_]+)"#
    )
}

/// The aura:// links the app uses for in-text links and deep links. AppStore.open(url:) understands them.
///
///     aura://profile/maya.chen   aura://tag/sunset   aura://messages/c_123 (any in-app path, see AppStore.open(href:))
enum AuraLink {
    static func profile(_ username: String) -> URL {
        URL(string: "aura://profile/\(encode(username))")!
    }

    static func tag(_ tag: String) -> URL {
        URL(string: "aura://tag/\(encode(tag))")!
    }

    private static func encode(_ part: String) -> String {
        part.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? part
    }
}
