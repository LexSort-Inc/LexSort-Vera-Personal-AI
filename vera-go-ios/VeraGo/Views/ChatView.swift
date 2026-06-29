import SwiftUI
import Speech

struct ChatView: View {
    let ip: String
    let port: Int
    let token: String

    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isConnected = false
    @State private var isStreaming = false
    @State private var isListening = false
    @State private var errorMessage: String?

    private let speechRecognizer = SFSpeechRecognizer()

    var body: some View {
        VStack(spacing: 0) {
            connectionBanner

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(messages) { msg in
                            MessageBubble(message: msg)
                        }
                        if isStreaming {
                            HStack {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("VERA is thinking...")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _ in
                    withAnimation {
                        proxy.scrollTo(messages.last?.id, anchor: .bottom)
                    }
                }
            }

            inputBar
        }
        .onAppear {
            connect()
        }
        .onDisappear {
            disconnect()
        }
    }

    private var connectionBanner: some View {
        HStack {
            Circle()
                .fill(isConnected ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            Text(isConnected ? "Connected to VERA" : "Disconnected")
                .font(.caption)
                .foregroundColor(.secondary)
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(Color(.systemGray6))
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            if SFSpeechRecognizer.authorizationStatus() == .authorized {
                Button {
                    toggleVoiceInput()
                } label: {
                    Image(systemName: isListening ? "mic.fill" : "mic")
                        .foregroundColor(isListening ? .red : .secondary)
                        .font(.title3)
                }
            }

            TextField("Message VERA...", text: $inputText)
                .textFieldStyle(.roundedBorder)
                .disabled(!isConnected || isStreaming)

            Button {
                sendMessage()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundColor(inputText.trimmingCharacters(in: .whitespaces).isEmpty ? .secondary : .accentColor)
            }
            .disabled(inputText.trimmingCharacters(in: .whitespaces).isEmpty || !isConnected || isStreaming)
        }
        .padding()
        .background(Color(.systemBackground))
    }

    private func connect() {
        Task {
            do {
                try await VERAChatService.shared.connect(ip: ip, port: port, token: token)
                isConnected = true
                listenForMessages()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func disconnect() {
        VERAChatService.shared.disconnect()
        isConnected = false
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        inputText = ""

        let userMsg = ChatMessage(id: UUID(), text: text, isUser: true)
        messages.append(userMsg)
        isStreaming = true

        Task {
            do {
                try await VERAChatService.shared.sendMessage(text)
            } catch {
                errorMessage = error.localizedDescription
                isStreaming = false
            }
        }
    }

    private func listenForMessages() {
        Task {
            for await chunk in await VERAChatService.shared.receiveMessages() {
                if messages.last?.isUser == true || messages.last?.isPartial == true {
                    if messages.last?.isPartial == true {
                        messages[messages.count - 1].text += chunk
                    } else {
                        messages.append(ChatMessage(id: UUID(), text: chunk, isUser: false, isPartial: true))
                    }
                } else {
                    messages.append(ChatMessage(id: UUID(), text: chunk, isUser: false, isPartial: true))
                }
                isStreaming = false
            }
        }
    }

    private func toggleVoiceInput() {
        if isListening {
            speechRecognizer?.stopSpeaking()
            isListening = false
        } else {
            isListening = true
            let request = SFSpeechAudioBufferRecognitionRequest()
            // In production, configure AVAudioEngine here
            speechRecognizer?.recognitionTask(with: request) { result, error in
                if let text = result?.bestTranscription.formattedString {
                    inputText = text
                }
                if error != nil || result?.isFinal == true {
                    isListening = false
                    if !inputText.trimmingCharacters(in: .whitespaces).isEmpty {
                        sendMessage()
                    }
                }
            }
        }
    }
}

struct ChatMessage: Identifiable {
    let id: UUID
    var text: String
    let isUser: Bool
    var isPartial: Bool = false
}

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isUser { Spacer() }

            Text(message.text)
                .padding(12)
                .background(message.isUser ? Color.accentColor : Color(.systemGray5))
                .foregroundColor(message.isUser ? .white : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .frame(maxWidth: 280, alignment: message.isUser ? .trailing : .leading)

            if !message.isUser { Spacer() }
        }
    }
}
