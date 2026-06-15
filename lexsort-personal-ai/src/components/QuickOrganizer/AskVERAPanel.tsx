import { useState, useRef } from 'react';
import { Task, TaskList } from './types';

interface AskVERAPanelProps {
    tasks: Task[];
    activeList: TaskList;
    onBreakdownCached: (taskId: string, breakdown: string) => void;
    onClose: () => void;
    activeModel: string;
    serverPort: number;
}

const PRIORITIZE_PROMPT = (tasks: Task[]) => `
You are helping a user prioritize their tasks for today.
Here are their current tasks:
${tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')}

Suggest which 1-3 tasks to focus on first and briefly explain why.
Keep your response concise and practical.
`.trim();

const BREAKDOWN_PROMPT = (task: Task) => `
Break down this task into 3-5 concrete, actionable first steps:
"${task.title}"
${task.notes ? `\nAdditional context: ${task.notes}` : ''}

Format each step as a numbered list. Be specific and practical.
`.trim();

const ESTIMATE_PROMPT = (task: Task) => `
Estimate how long this task will realistically take:
"${task.title}"
${task.notes ? `\nAdditional context: ${task.notes}` : ''}

Give a time range and one sentence explaining your estimate.
`.trim();

export function AskVERAPanel({
    tasks,
    activeList,
    onBreakdownCached,
    onClose,
    activeModel,
    serverPort
}: AskVERAPanelProps) {
    const [actionType, setActionType] = useState<'prioritize' | 'breakdown' | 'estimate' | null>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string>('');
    const [resultText, setResultText] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const activeTasks = tasks.filter(t => !t.completed);
    const listTasks = activeTasks.filter(t => t.list === activeList);

    const handlePrioritize = async () => {
        if (listTasks.length === 0) {
            setResultText("You don't have any active tasks in this list to prioritize.");
            return;
        }
        startStream(PRIORITIZE_PROMPT(listTasks), 'prioritize');
    };

    const handleBreakdown = async () => {
        const task = activeTasks.find(t => t.id === selectedTaskId);
        if (!task) return;
        startStream(BREAKDOWN_PROMPT(task), 'breakdown', task.id);
    };

    const handleEstimate = async () => {
        const task = activeTasks.find(t => t.id === selectedTaskId);
        if (!task) return;
        startStream(ESTIMATE_PROMPT(task), 'estimate');
    };

    const startStream = async (promptText: string, type: 'prioritize' | 'breakdown' | 'estimate', cacheTaskId?: string) => {
        if (loading) return;
        setLoading(true);
        setActionType(type);
        setResultText('');

        if (abortControllerRef.current) abortControllerRef.current.abort();
        const ctrl = new AbortController();
        abortControllerRef.current = ctrl;

        try {
            const response = await fetch(`http://127.0.0.1:${serverPort}/v1/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: ctrl.signal,
                body: JSON.stringify({
                    model: activeModel || "llama3.2:3b",
                    messages: [
                        {
                            role: "system",
                            content: "You are Vera, a helpful private assistant. Be extremely concise, direct, and practical."
                        },
                        {
                            role: "user",
                            content: promptText
                        }
                    ],
                    stream: true,
                    temperature: 0.5,
                    max_tokens: 1024,
                }),
            });

            if (!response.ok) throw new Error(`Ollama returned status: ${response.status}`);
            if (!response.body) throw new Error("No response body available");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

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
                            fullText += token;
                            setResultText(fullText);
                        }
                    } catch {}
                }
            }

            // Cache breakdown if needed
            if (type === 'breakdown' && cacheTaskId) {
                onBreakdownCached(cacheTaskId, fullText);
            }

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                setResultText(`Error connecting to local AI server: ${e.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setLoading(false);
    };

    return (
        <div className="qo-ask-panel">
            <div className="qo-ask-panel__header">
                <h3 className="qo-ask-panel__title">✨ Ask VERA</h3>
                <button className="qo-ask-panel__close" onClick={onClose}>✕</button>
            </div>

            <div className="qo-ask-panel__body">
                <div className="qo-ask-options">
                    {/* Prioritize Button */}
                    <button 
                        className="qo-ask-action-btn"
                        onClick={handlePrioritize}
                        disabled={loading}
                    >
                        Rank & Prioritize List
                    </button>

                    <div className="qo-ask-divider" />

                    {/* Task Actions Section */}
                    <div className="qo-ask-task-section">
                        <label className="qo-ask-label">Select Task:</label>
                        <select
                            className="qo-ask-select"
                            value={selectedTaskId}
                            onChange={(e) => setSelectedTaskId(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">-- Choose a Task --</option>
                            {activeTasks.map(t => (
                                <option key={t.id} value={t.id}>{t.title}</option>
                            ))}
                        </select>

                        <div className="qo-ask-row">
                            <button
                                className="qo-ask-action-btn"
                                onClick={handleBreakdown}
                                disabled={loading || !selectedTaskId}
                            >
                                Break Down Steps
                            </button>
                            <button
                                className="qo-ask-action-btn"
                                onClick={handleEstimate}
                                disabled={loading || !selectedTaskId}
                            >
                                Estimate Time
                            </button>
                        </div>
                    </div>
                </div>

                {/* Output Display */}
                {(actionType || resultText) && (
                    <div className="qo-ask-output">
                        <div className="qo-ask-output__header">
                            <span className="qo-ask-output__label">
                                {actionType === 'prioritize' && 'Recommendation'}
                                {actionType === 'breakdown' && 'Action Steps'}
                                {actionType === 'estimate' && 'Time Estimate'}
                            </span>
                            {loading && (
                                <button className="qo-ask-stop-btn" onClick={handleStop}>
                                    Stop
                                </button>
                            )}
                        </div>
                        <div className="qo-ask-output__content">
                            {resultText ? resultText : <div className="qo-ask-output__loading">Vera is thinking...</div>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
