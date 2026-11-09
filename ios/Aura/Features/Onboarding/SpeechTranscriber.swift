import AVFoundation
import Observation
import Speech

/// Voice typing for "Tell us about your world": listens to the microphone and turns speech into text
/// while the person talks (Apple's Speech framework), for up to a minute of talking in total.
///
///     await speech.start(after: draft.transcript) { text in draft.transcript = text }
///     speech.stop()
///
/// The words are worked out on the iPhone when it can (otherwise by Apple's speech service). Aura only
/// gets the text when the person presses "Build my world".
@Observable
@MainActor
final class SpeechTranscriber {
    /// Why voice typing can't be used right now.
    enum Problem: Equatable {
        case denied       // the microphone or speech recognition is switched off for Aura
        case restricted   // not allowed on this iPhone (Screen Time, a managed device)
        case unavailable  // no speech recognition for this language right now, or no microphone
        case failed       // it stopped working while listening
    }

    /// A minute of talking in total.
    static let talkLimit: TimeInterval = 60

    private(set) var isListening = false
    /// Seconds of talking used so far (the ring around the mic fills up over the minute).
    private(set) var usedSeconds: TimeInterval = 0
    /// How loud the voice is right now, 0...1 (the mic button swells with it).
    private(set) var level: Double = 0
    private(set) var problem: Problem?

    var timeLeft: TimeInterval { max(0, Self.talkLimit - usedSeconds) }
    var isTimeUp: Bool { timeLeft <= 0 }

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var clock: Task<Void, Never>?
    /// The text from before this listening session; new words are added after it.
    private var base = ""
    private var heardSomething = false
    /// Counts listening sessions, so late results from one that already ended are ignored.
    private var sessionNumber = 0
    private var onText: (String) -> Void = { _ in }

    // MARK: - Listening

    /// Asks for permission the first time, then listens until stop() or the minute is used up.
    /// `onText` gets the whole text (what was there before plus what's being said) as it changes.
    func start(after text: String, onText: @escaping (String) -> Void) async {
        guard !isListening, !isTimeUp else { return }
        problem = nil
        guard await askPermission() else { return }
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            problem = .unavailable
            return
        }
        do {
            try listen(with: recognizer, after: text, onText: onText)
        } catch {
            stopAudio()
            problem = .unavailable
        }
    }

    /// Stops listening. The last words still arrive a moment later.
    func stop() {
        guard isListening else { return }
        isListening = false
        clock?.cancel()
        stopAudio()
        request?.endAudio()
    }

    /// Forgets the talk time used (after "Start over"), so the person gets a fresh minute.
    func resetTime() {
        usedSeconds = 0
    }

    // MARK: - Permission

    /// Speech recognition first, then the microphone: iOS asks the person once for each.
    private func askPermission() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in continuation.resume(returning: status) }
        }
        switch speech {
        case .authorized: break
        case .restricted:
            problem = .restricted
            return false
        default:
            problem = .denied
            return false
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            problem = .denied
            return false
        }
        return true
    }

    // MARK: - The audio and the recognizer

    private func listen(with recognizer: SFSpeechRecognizer, after text: String, onText: @escaping (String) -> Void) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw APIError(message: "No microphone") }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true // words appear while talking, not only at the end
        request.addsPunctuation = true
        // Keep the words on the iPhone when it can recognize them by itself.
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        self.request = request
        self.onText = onText
        base = text.trimmingCharacters(in: .whitespacesAndNewlines)
        heardSomething = false

        input.installTap(onBus: 0, bufferSize: 1024, format: format,
                         block: Self.feed(request) { [weak self] level in self?.level = level })
        engine.prepare()
        try engine.start()

        sessionNumber += 1
        let number = sessionNumber
        task = recognizer.recognitionTask(with: request, resultHandler: Self.results { [weak self] words, isFinal, error in
            self?.received(words, isFinal: isFinal, error: error, session: number)
        })
        isListening = true
        startClock()
    }

    /// New words (the whole session so far), the end of the session, or an error.
    private func received(_ words: String?, isFinal: Bool, error: Error?, session number: Int) {
        // Stopped and started again quickly: the old session's last words are already in the text.
        guard number == sessionNumber else { return }
        if let words, !words.isEmpty {
            heardSomething = true
            onText(base.isEmpty ? words : base + " " + words)
        }
        guard isFinal || error != nil else { return }
        // Silence ("no speech detected", code 1110) and stopping aren't failures; anything else is.
        if let error, isListening, !heardSomething, (error as NSError).code != 1110 { problem = .failed }
        if isListening { stop() }
        task = nil
        request = nil
    }

    /// Counts the talking time ten times a second and stops at the limit.
    private func startClock() {
        clock?.cancel()
        clock = Task { [weak self] in
            var last = Date()
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, self.isListening else { return }
                let now = Date()
                self.usedSeconds = min(Self.talkLimit, self.usedSeconds + now.timeIntervalSince(last))
                last = now
                if self.isTimeUp {
                    Haptics.tap()
                    self.stop()
                }
            }
        }
    }

    private func stopAudio() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        level = 0
    }

    // These two closures run on audio and speech threads, not the main thread, so they are made in
    // nonisolated functions and hop to the main thread before touching the transcriber.

    /// Hands each slice of microphone audio to the recognizer and reports how loud it was.
    private nonisolated static func feed(_ request: SFSpeechAudioBufferRecognitionRequest,
                                         level: @escaping @MainActor (Double) -> Void) -> AVAudioNodeTapBlock {
        { buffer, _ in
            request.append(buffer)
            let loudness = Self.loudness(of: buffer)
            Task { @MainActor in level(loudness) }
        }
    }

    private nonisolated static func results(_ deliver: @escaping @MainActor (String?, Bool, Error?) -> Void)
        -> (SFSpeechRecognitionResult?, Error?) -> Void {
        { result, error in
            let words = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            Task { @MainActor in deliver(words, isFinal, error) }
        }
    }

    /// The buffer's loudness from 0 (silence) to 1 (loud talking): its average power in decibels,
    /// with -50 dB and quieter as 0 and -10 dB and louder as 1.
    private nonisolated static func loudness(of buffer: AVAudioPCMBuffer) -> Double {
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
        let rms = sqrt(sum / Float(buffer.frameLength))
        let decibels = 20 * log10(max(rms, 0.000_01))
        return Double(min(1, max(0, (decibels + 50) / 40)))
    }
}
