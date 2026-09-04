import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Task } from './types';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { extractFileText, docContextBlock, type DocContext } from '../../utils/documentReader';
import { buildTranslatePrompt, detectLocale, type TranslateTone } from '../../utils/translatorPrompt';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface VeraCopilotProps {
    tasks: Task[];
    activeModel?: string;
    serverPort?: number;
    initialPromptText?: string | null;
    onBreakdownCached: (taskId: string, breakdown: string) => void;
}

export function VeraCopilot({
    tasks,
    activeModel = "llama3.2:3b",
    serverPort = 11434,
    initialPromptText,
    onBreakdownCached
}: VeraCopilotProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [moduleDocs, setModuleDocs] = useState('');

    // Document Drop & Query state (100% local extraction)
    const [doc, setDoc] = useState<DocContext | null>(null);
    const [docError, setDocError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [docBusy, setDocBusy] = useState(false);

    // Quick-translate state (prompt-engineered, local model)
    const [targetLang, setTargetLang] = useState(detectLocale());
    const [tone, setTone] = useState<TranslateTone>('business');

    // Voice Input (Speech to Text) Logic
    const initialTextRef = useRef('');
    const speech = useSpeechRecognition({
        onResult: (transcript) => {
            const base = initialTextRef.current;
            const space = base && !base.endsWith(' ') ? ' ' : '';
            setInput(base + space + transcript);
        },
        onError: (err) => {
            console.error('Speech Recognition Error in Copilot:', err);
        }
    });

    const toggleSpeech = () => {
        if (speech.isListening) {
            speech.stop();
        } else {
            initialTextRef.current = input;
            speech.start();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInput(val);
        if (speech.isListening) {
            initialTextRef.current = val;
            speech.restart();
        }
    };

    const abortControllerRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const activeTasks = tasks.filter(t => !t.completed);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load module documentation and initialize greeting
    useEffect(() => {
        async function fetchDocs() {
            try {
                const docs = await invoke<string>('get_module_docs', { moduleName: 'quick_organizer' });
                setModuleDocs(docs);
            } catch (e) {
                console.error('Failed to load module docs:', e);
            }
        }
        fetchDocs();

        // Welcome greeting from VERA
        setMessages([
            {
                id: 'welcome',
                role: 'assistant',
                content: "👋 **Hello! I am VERA, your LexSort Co-pilot.**\n\nI am here to help you get the most out of your **Quick Organizer** module! All our planning is private and stays 100% on your device.\n\n### 📋 How to use this module:\n1. **Add Tasks**: Type in the task box on the left and hit Enter.\n2. **Organize**: Categorize tasks using the **Today**, **This Week**, or **Someday** tabs.\n3. **Manage**: Complete tasks by clicking the circle next to them, or move them between lists via the **•••** menu.\n\n### ⚡ Quick AI Commands:\n- **Rank & Prioritize List**: I'll recommend the top 1-3 tasks you should focus on today.\n- **Break Down Task**: Select a task in the toolbar below to expand it into actionable steps.\n- **Estimate Time**: Select a task in the toolbar below to get a realistic completion estimate.\n\n*Note: If you have any questions I cannot answer, please feel free to refer to our official [Discord Community](https://discord.gg/kpZ3hWyAaq) for support!*"
            }
        ]);
    }, []);

    // Handle initial prompt text if supplied by parent chips
    useEffect(() => {
        if (initialPromptText) {
            const timer = setTimeout(() => {
                handleSendMessage(initialPromptText);
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [initialPromptText]);

    const handleSendMessage = async (customText?: string) => {
        const textToSend = customText ? customText.trim() : input.trim();
        if (!textToSend || loading) return;

        if (speech.isListening) {
            speech.stop();
        }

        if (!customText) {
            setInput('');
        }

        const userMsgId = Date.now().toString();
        const userMsg: Message = {
            id: userMsgId,
            role: 'user',
            content: textToSend
        };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setLoading(true);

        // Check if this user query is for a task breakdown/estimation
        let targetBreakdownTaskId: string | null = null;
        if (textToSend.startsWith("Break down task: \"")) {
            // Find task ID from our selected state or title matching
            const matchedTask = activeTasks.find(t => textToSend.includes("\"" + t.title + "\""));
            if (matchedTask) {
                targetBreakdownTaskId = matchedTask.id;
            }
        }

        if (abortControllerRef.current) abortControllerRef.current.abort();
        const ctrl = new AbortController();
        abortControllerRef.current = ctrl;

        const assistantMsgId = (Date.now() + 1).toString();
        // Append initial thinking state
        setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

        try {
            // Compile active tasks in a simple JSON structure for prompt context
            const activeTasksList = tasks.filter(t => !t.completed);
            const tasksSummary = activeTasksList.map((t, idx) => {
                const dateStr = t.start_time ? new Date(t.start_time).toLocaleString() : 'Unscheduled';
                return `${idx + 1}. ${t.title} [Category: ${t.category || 'task'}, Time: ${dateStr}]${t.notes ? ` (Notes: ${t.notes})` : ''}`;
            }).join('\n');

            const systemPrompt = "You are VERA, an intelligent private copilot for the LexSort application.\n\n" +
                "Here is the official documentation for the current module (Quick Organizer):\n" +
                (moduleDocs || "No documentation found.") + "\n\n" +
                "Here is the user's active calendar schedule & task list (including user tasks and imported read-only system events):\n" +
                (tasksSummary || "(No active tasks/events in this view)") + "\n\n" +
                "INSTRUCTIONS:\n" +
                "1. Be extremely concise, direct, helpful, and practical.\n" +
                "2. You can answer general knowledge questions easily. You do not need to restrict yourself only to the organizer.\n" +
                "3. If the user asks a question about the LexSort program, the VERA app itself, unsupported features, or upcoming development ideas that are not covered in the provided documentation, or if you do not know the answer, you MUST politely explain that you do not know and suggest they visit the official LexSort Discord community for support: https://discord.gg/kpZ3hWyAaq.\n" +
                "4. Do not hallucinate app features or make up capabilities that do not exist.\n" +
                "5. Format your response with clear Markdown formatting (e.g. lists, bold text).\n" +
                (doc ? "\n" + docContextBlock(doc) + "\n" : "");

            // Prepare messages array for Ollama Chat API
            // We include system prompt first, then map the conversation history
            const payloadMessages = [
                { role: 'system', content: systemPrompt },
                ...updatedMessages.map(msg => ({ role: msg.role, content: msg.content }))
            ];

            const response = await fetch("http://127.0.0.1:" + serverPort + "/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: ctrl.signal,
                body: JSON.stringify({
                    model: activeModel || "llama3.2:3b",
                    messages: payloadMessages,
                    stream: true,
                    temperature: 0.5,
                    max_tokens: 1024,
                }),
            });

            if (!response.ok) throw new Error("Server returned status: " + response.status);
            if (!response.body) throw new Error("No response body available");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const lines = decoder.decode(value, { stream: true }).split("\n");
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6).trim();
                    if (data === "[DONE]") break;

                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content ?? "";
                        if (token) {
                            accumulatedText += token;
                            setMessages(prev => prev.map(msg => 
                                msg.id === assistantMsgId ? { ...msg, content: accumulatedText } : msg
                            ));
                        }
                    } catch {}
                }
            }

            // Cache breakdown to the task card if applicable
            if (targetBreakdownTaskId && accumulatedText) {
                onBreakdownCached(targetBreakdownTaskId, accumulatedText);
            }

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                setMessages(prev => prev.map(msg => 
                    msg.id === assistantMsgId ? { ...msg, content: "⚠️ Error connecting to local VERA server: " + e.message + ". Please make sure VERA is booted and Ollama is active." } : msg
                ));
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    const handleStopStream = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setLoading(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        setDocError('');
        const file = e.dataTransfer.files?.[0];
        if (!file || loading) return;
        setDocBusy(true);
        try {
            setDoc(await extractFileText(file));
        } catch (err: any) {
            setDocError(err?.message ?? 'Could not read that file.');
        } finally {
            setDocBusy(false);
        }
    };

    const handleQuickAction = (action: 'prioritize' | 'breakdown' | 'estimate') => {
        if (action === 'prioritize') {
            handleSendMessage("Rank and prioritize my active task list, suggesting 1-3 tasks to focus on.");
        } else {
            const task = activeTasks.find(t => t.id === selectedTaskId);
            if (!task) return;

            if (action === 'breakdown') {
                handleSendMessage("Break down task: \"" + task.title + "\" into 3-5 concrete, actionable first steps.");
            } else if (action === 'estimate') {
                handleSendMessage("Estimate time: \"" + task.title + "\". Give a realistic duration range and one sentence explaining the estimate.");
            }
        }
    };

    return (
        <div
            className="qo-ask-panel"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={dragOver ? { outline: '2px dashed var(--accent)', outlineOffset: '-2px' } : undefined}
        >
            <div className="qo-ask-panel__header">
                <h3 className="qo-ask-panel__title">✨ VERA Copilot Chat</h3>
                {loading && (
                    <button className="qo-ask-stop-btn" onClick={handleStopStream} style={{ fontSize: '11px', padding: '2px 8px' }}>
                        Stop
                    </button>
                )}
            </div>

            {/* Chat History Container */}
            <div className="qo-chat-history">
                {messages.map((msg) => (
                    <div key={msg.id} className={"qo-chat-msg qo-chat-msg--" + msg.role}>
                        <div className="qo-chat-msg__avatar">
                            {msg.role === 'assistant' ? '🤖' : '👤'}
                        </div>
                        <div className="qo-chat-msg__bubble">
                            {/* Parse and render simple markdown lists/paragraphs */}
                            {msg.content.split('\n\n').map((paragraph, pIdx) => {
                                // Bold blocks replacement
                                const renderTextWithFormatting = (text: string): React.ReactNode => {
                                    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\))/g);
                                    return parts.map((part, partIdx) => {
                                        if (part.startsWith('**') && part.endsWith('**')) {
                                            return <strong key={partIdx}>{renderTextWithFormatting(part.slice(2, -2))}</strong>;
                                        } else if (part.startsWith('*') && part.endsWith('*')) {
                                            return <em key={partIdx}>{renderTextWithFormatting(part.slice(1, -1))}</em>;
                                        } else if (part.startsWith('[') && part.includes('](')) {
                                            const match = part.match(/\[(.*?)\]\((.*?)\)/);
                                            if (match) {
                                                const url = match[2];
                                                const label = match[1];
                                                const handleLinkClick = async (e: React.MouseEvent) => {
                                                    e.preventDefault();
                                                    try {
                                                        const { openUrl } = await import("@tauri-apps/plugin-opener");
                                                        await openUrl(url);
                                                    } catch {
                                                        const a = document.createElement("a");
                                                        a.href = url;
                                                        a.target = "_blank";
                                                        a.rel = "noopener noreferrer";
                                                        document.body.appendChild(a);
                                                        a.click();
                                                        document.body.removeChild(a);
                                                    }
                                                };
                                                return <a key={partIdx} href={url} onClick={handleLinkClick} style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' }}>{label}</a>;
                                            }
                                        }
                                        return part;
                                    });
                                };

                                if (paragraph.startsWith('### ')) {
                                    return <h4 key={pIdx} style={{ margin: '8px 0 4px 0', fontSize: '13px', color: 'var(--text)' }}>{renderTextWithFormatting(paragraph.slice(4))}</h4>;
                                }
                                if (paragraph.startsWith('- ') || paragraph.startsWith('* ') || paragraph.match(/^\d+\.\s/)) {
                                    const isNumbered = paragraph.match(/^\d+\.\s/);
                                    const items = paragraph.split('\n');
                                    const Tag = isNumbered ? 'ol' : 'ul';
                                    return (
                                        <Tag key={pIdx} style={{ margin: '4px 0', paddingLeft: '18px' }}>
                                            {items.map((item, itemIdx) => {
                                                const cleaned = item.replace(/^(-\s|\*\s|\d+\.\s)/, '');
                                                return <li key={itemIdx} style={{ margin: '2px 0' }}>{renderTextWithFormatting(cleaned)}</li>;
                                            })}
                                        </Tag>
                                    );
                                }
                                return <p key={pIdx} style={{ margin: '4px 0', lineHeight: '1.4' }}>{renderTextWithFormatting(paragraph)}</p>;
                            })}
                            {msg.content === '' && loading && (
                                <div className="qo-chat-msg__loading">Vera is typing...</div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions and Bottom Tools Area */}
            <div className="qo-chat-footer">
                {/* Greeting chips shown only if welcome screen or user has no text */}
                {!input && messages.length === 1 && (
                    <div className="qo-chat-chips">
                        <button className="qo-chat-chip" onClick={() => handleQuickAction('prioritize')}>
                            📋 Rank & Prioritize List
                        </button>
                        <button className="qo-chat-chip" onClick={() => handleSendMessage("Explain how the Quick Organizer works and give examples.")}>
                            💡 How to use Quick Organizer
                        </button>
                    </div>
                )}

                {/* Toolbar for task breakdown & time estimates */}
                <div className="qo-chat-tools-bar">
                    <select
                        className="qo-ask-select"
                        style={{ fontSize: '12px', padding: '6px' }}
                        value={selectedTaskId}
                        onChange={(e) => setSelectedTaskId(e.target.value)}
                        disabled={loading}
                    >
                        <option value="">-- Select Task for AI Actions --</option>
                        {activeTasks.map(t => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                    </select>

                    <div className="qo-ask-row" style={{ marginTop: '0' }}>
                        <button
                            className="qo-chat-tool-btn"
                            onClick={() => handleQuickAction('breakdown')}
                            disabled={loading || !selectedTaskId}
                        >
                            🛠️ Break Down
                        </button>
                        <button
                            className="qo-chat-tool-btn"
                            onClick={() => handleQuickAction('estimate')}
                            disabled={loading || !selectedTaskId}
                        >
                            ⏱️ Estimate Time
                        </button>
                    </div>
                </div>

                {/* Attached document chip (Drop & Query) */}
                {(doc || docBusy || docError) && (
                    <div className="qo-doc-chip" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 8px' }}>
                        {docBusy ? (
                            <span>📄 Reading document…</span>
                        ) : docError ? (
                            <span style={{ color: 'var(--danger, #ef4444)' }}>⚠️ {docError}</span>
                        ) : doc ? (
                            <>
                                <span>📄 {doc.fileName} ({doc.charCount} chars{doc.truncated ? ', truncated' : ''})</span>
                                <button
                                    className="qo-chat-tool-btn"
                                    style={{ fontSize: '11px', padding: '2px 8px' }}
                                    onClick={() => { setDoc(null); setDocError(''); }}
                                    title="Remove attached document"
                                >
                                    ✕
                                </button>
                            </>
                        ) : null}
                    </div>
                )}

                {/* Quick-translate row (prompt-engineered, local model) */}
                <div className="qo-translate-row" style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                    <span title="Translate the message box text with the local model">🌐</span>
                    <input
                        className="qo-ask-select"
                        style={{ fontSize: '12px', padding: '6px', width: '64px' }}
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        placeholder="fr"
                        title="Target language code (default: your system locale)"
                        disabled={loading}
                    />
                    <select
                        className="qo-ask-select"
                        style={{ fontSize: '12px', padding: '6px' }}
                        value={tone}
                        onChange={(e) => setTone(e.target.value as TranslateTone)}
                        disabled={loading}
                        title="Translation tone"
                    >
                        <option value="business">Business</option>
                        <option value="casual">Casual</option>
                        <option value="academic">Academic</option>
                        <option value="idiomatic">Native idioms</option>
                    </select>
                    <button
                        className="qo-chat-tool-btn"
                        onClick={() => handleSendMessage(buildTranslatePrompt(input, targetLang || detectLocale(), tone))}
                        disabled={loading || !input.trim()}
                        title="Translate the message above"
                    >
                        Translate
                    </button>
                </div>

                {/* Chat Input Bar */}
                <div className="qo-chat-input-wrapper">
                    <input
                        className="qo-chat-input"
                        type="text"
                        placeholder="Message Vera..."
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        disabled={loading}
                    />
                    {speech.supported && (
                        <button
                            className={`qo-chat-mic-btn ${speech.isListening ? 'active' : ''}`}
                            onClick={toggleSpeech}
                            disabled={loading}
                            title={speech.isListening ? "Stop Voice Input" : "Start Voice Input"}
                            type="button"
                        >
                            {speech.isListening ? (
                                <span className="mic-icon-active">🔴 🎤</span>
                            ) : (
                                <span className="mic-icon-inactive">🎤</span>
                            )}
                        </button>
                    )}
                    <button
                        className="qo-chat-send-btn"
                        onClick={() => handleSendMessage()}
                        disabled={loading || !input.trim()}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
